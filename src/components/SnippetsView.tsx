import { useEffect, useState, useCallback, useRef } from 'react'
import {
  IoAdd,
  IoAddOutline,
  IoTrashOutline,
  IoPencilOutline,
  IoSearchOutline,
  IoDocumentAttachOutline,
  IoCopyOutline,
  IoCheckmark,
  IoChevronForward,
  IoCloseOutline,
  IoCodeSlashOutline,
  IoSaveOutline,
  IoFlashOutline
} from 'react-icons/io5'
import { ConfigInfo, EspansoMatch, MatchFile, VarDefinition } from '../types'
import { parseMatchFile, getMatchLabel, getMatchTriggers, getMatchReplacement, getMatchType, triggerExists, buildMatchFileContent } from '../utils/yaml'
import MatchEditor from './MatchEditor'
import VarEditor from './VarEditor'
import { getTriggerSymbol } from '../utils/prefs'

interface Props {
  configInfo: ConfigInfo | null
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
  // Set by the dashboard's "Add Snippet" shortcut - opens the new-snippet
  // editor as soon as a match file is selected (files load async on mount).
  createRequested?: boolean
  onCreateRequestHandled?: () => void
}

export default function SnippetsView({ configInfo, showToast, createRequested, onCreateRequestHandled }: Props) {
  const [files, setFiles] = useState<MatchFile[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [matches, setMatches] = useState<EspansoMatch[]>([])
  // True while the match-file list is being read - keeps the "No match
  // files found" empty state from flashing while the IPC round-trip is in
  // flight on first open.
  const [filesLoading, setFilesLoading] = useState(true)
  // The file whose matches currently live in `matches`/`globalVars`. Until
  // it equals `selectedFile`, the snippet list is still loading, so show a
  // loading placeholder instead of "No snippets yet" (or a stale list).
  const [loadedFile, setLoadedFile] = useState<string | null>(null)
  // This file's global_vars - shared across every snippet in it (real espanso
  // feature, scoped per file). Kept alongside `matches` since both live in
  // the same file and get written back together.
  const [globalVars, setGlobalVars] = useState<Record<string, VarDefinition>>({})
  // Unknown top-level YAML keys (imports, etc.) preserved across GUI saves.
  const [fileExtra, setFileExtra] = useState<Record<string, any>>({})
  // Which of this file's three views is showing - Snippets (the match
  // list) or the Extensions/Forms tabs that manage global_vars directly.
  // Extensions and forms aren't split by snippet any more (that grouping
  // kept breaking in subtle ways) - one flat, always-visible pool, managed
  // in one place, and that's it.
  const [view, setView] = useState<'snippets' | 'extensions' | 'forms'>('snippets')
  // The vars most recently written to (or read from) disk for the selected
  // file - dirtiness check for auto-save: leaving an editing tab only
  // writes when `globalVars` differs from this.
  const lastSavedGlobalVars = useRef<Record<string, VarDefinition>>({})
  // Latest file/matches/vars mirrored into a ref so the unmount cleanup
  // below can auto-save pending Extensions/Forms edits when the user
  // navigates to another sidebar page (which unmounts this view).
  const latestRef = useRef({ selectedFile, matches, globalVars })
  latestRef.current = { selectedFile, matches, globalVars }
  const [search, setSearch] = useState('')
  const [editingMatch, setEditingMatch] = useState<EspansoMatch | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [showNewFileModal, setShowNewFileModal] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [copiedTrigger, setCopiedTrigger] = useState<string | null>(null)
  const [rawEditFile, setRawEditFile] = useState<string | null>(null)
  const [rawContent, setRawContent] = useState('')
  const [rawSaving, setRawSaving] = useState(false)

  const loadFiles = useCallback(async () => {
    setFilesLoading(true)
    try {
      const result = await window.espansoAPI.listMatchFiles()
      if (result.success && result.files) {
        const fileList = result.files
        setFiles(fileList)
        // Auto-select first file if none selected
        if (!selectedFile && fileList.length > 0) {
          setSelectedFile(fileList[0].name)
        }
      } else if (result.error) {
        showToast('error', result.error)
      }
    } catch (err) {
      showToast('error', `Failed to load match files: ${(err as Error).message}`)
    } finally {
      setFilesLoading(false)
    }
  }, [selectedFile, showToast])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  const loadMatches = useCallback(async (filename: string) => {
    try {
      const result = await window.espansoAPI.readMatchFile(filename)
      if (result.success && result.content) {
        const parsed = parseMatchFile(result.content)
        setMatches(parsed.matches)
        setGlobalVars(parsed.globalVars)
        setFileExtra(parsed.extra)
        lastSavedGlobalVars.current = parsed.globalVars
        setLoadedFile(filename)
        setView('snippets')
      }
    } catch (err) {
      showToast('error', `Failed to load matches: ${(err as Error).message}`)
    }
  }, [showToast])

  useEffect(() => {
    if (selectedFile) {
      loadMatches(selectedFile)
    }
  }, [selectedFile, loadMatches])

  // "Add Snippet" shortcut from the dashboard: open the new-snippet editor
  // once the file is FULLY loaded (loadedFile === selectedFile, i.e. matches
  // AND global_vars are in state). Opening any earlier would hand
  // MatchEditor an empty global_vars, so its {{var}}/{{form.field}} chips
  // would be missing - and a Save would then overwrite the file's real
  // extensions/forms with that empty pool. With no match files at all, the
  // empty-state "Create Match File" flow takes over instead.
  useEffect(() => {
    // !loadedFile covers the pre-load state where BOTH loadedFile and
    // selectedFile are null (null === null) - without it the editor would
    // open before anything is read from disk.
    if (!createRequested || !loadedFile || loadedFile !== selectedFile) return
    setEditingMatch({ trigger: getTriggerSymbol(), replace: '' })
    setEditingIndex(null)
    onCreateRequestHandled?.()
  }, [createRequested, selectedFile, loadedFile, onCreateRequestHandled])

  // Don't let a create request linger past this page (e.g. no match files
  // existed, so it was never handled) - otherwise it'd pop open the editor
  // on some future visit to Snippets.
  useEffect(() => {
    return () => {
      if (createRequested) onCreateRequestHandled?.()
    }
  }, [createRequested, onCreateRequestHandled])

  const saveMatches = async (
    filename: string,
    newMatches: EspansoMatch[],
    newGlobalVars?: Record<string, VarDefinition>,
    successMessage = 'Snippets saved'
  ) => {
    try {
      const content = buildMatchFileContent(
        newMatches,
        newGlobalVars ?? globalVars,
        fileExtra
      )
      const result = await window.espansoAPI.writeMatchFile(filename, content)
      if (result.success) {
        setMatches(newMatches)
        if (newGlobalVars !== undefined) setGlobalVars(newGlobalVars)
        lastSavedGlobalVars.current = newGlobalVars ?? globalVars
        showToast('success', successMessage)
      } else {
        showToast('error', `Failed to save: ${result.error}`)
      }
    } catch (err) {
      showToast('error', `Failed to save: ${(err as Error).message}`)
    }
  }

  // Extensions/Forms edits are written straight into `globalVars` - there's
  // no draft and no explicit Save/Cancel. The only save point is leaving
  // the editing tab, handled by saveGlobalVarsIfDirty below: subtab switch,
  // file switch, or leaving the page. A no-op tab visit saves nothing.
  const saveGlobalVarsIfDirty = () => {
    if (!selectedFile) return
    if (JSON.stringify(globalVars) === JSON.stringify(lastSavedGlobalVars.current)) return
    saveMatches(selectedFile, matches, globalVars, 'Extensions saved')
  }

  const switchSubTab = (next: 'snippets' | 'extensions' | 'forms') => {
    // Leaving an editing tab auto-saves whatever was worked on there.
    if ((view === 'extensions' || view === 'forms') && next !== view) {
      saveGlobalVarsIfDirty()
    }
    setView(next)
  }

  // Auto-save pending Extensions/Forms edits when the user navigates to
  // another sidebar page (this view unmounts) - same rule as a tab switch.
  useEffect(() => {
    return () => {
      const { selectedFile, matches, globalVars } = latestRef.current
      if (!selectedFile) return
      if (JSON.stringify(globalVars) === JSON.stringify(lastSavedGlobalVars.current)) return
      saveMatches(selectedFile, matches, globalVars, 'Extensions saved')
    }
    // Runs once on mount; the cleanup fires on unmount and reads the
    // latest state from latestRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreateMatch = () => {
    setEditingMatch({ trigger: getTriggerSymbol(), replace: '' })
    setEditingIndex(null)
  }

  const handleEditMatch = (index: number) => {
    setEditingMatch({ ...matches[index] })
    setEditingIndex(index)
  }

  const handleDeleteMatch = async (index: number) => {
    if (!selectedFile) return
    const newMatches = matches.filter((_, i) => i !== index)
    await saveMatches(selectedFile, newMatches)
  }

  const handleSaveMatch = async (match: EspansoMatch, updatedGlobalVars: Record<string, VarDefinition>) => {
    if (!selectedFile) return

    // Validate trigger
    const triggers = getMatchTriggers(match)
    if (triggers.length === 0 && !match.regex) {
      showToast('error', 'A trigger is required')
      return
    }

    // Check for duplicate triggers
    for (const trigger of triggers) {
      if (triggerExists(matches, trigger, editingIndex ?? undefined)) {
        showToast('error', `Trigger "${trigger}" already exists`)
        return
      }
    }

    let newMatches: EspansoMatch[]
    if (editingIndex !== null) {
      newMatches = matches.map((m, i) => i === editingIndex ? match : m)
    } else {
      newMatches = [...matches, match]
    }

    // Vars/forms edited from inside the snippet editor all live in
    // global_vars (see MatchEditor's migrateToGlobalPool) - save both
    // together so a var created/edited there isn't lost.
    await saveMatches(selectedFile, newMatches, updatedGlobalVars)
    setEditingMatch(null)
    setEditingIndex(null)
  }

  const handleSelectFile = (name: string) => {
    // Leaving the current file (possibly mid-edit on Extensions/Forms) -
    // write pending vars before switching, or they'd be lost.
    saveGlobalVarsIfDirty()
    setSelectedFile(name)
  }

  const handleCreateFile = async () => {
    const filename = newFileName.trim().endsWith('.yml') ? newFileName.trim() : `${newFileName.trim()}.yml`
    if (!filename || filename === '.yml') {
      showToast('error', 'Please enter a file name')
      return
    }
    const result = await window.espansoAPI.createMatchFile(filename)
    if (result.success) {
      setShowNewFileModal(false)
      setNewFileName('')
      showToast('success', `Created ${filename}`)
      // Leaving the current file (possibly mid-edit on Extensions/Forms) -
      // write pending vars before switching, or they'd be lost.
      saveGlobalVarsIfDirty()
      await loadFiles()
      setSelectedFile(filename)
    } else {
      showToast('error', result.error || 'Failed to create file')
    }
  }

  const handleDeleteFile = async (filename: string) => {
    if (!confirm(`Delete ${filename}? This cannot be undone.`)) return
    // Deleting a *different* file than the one being edited shouldn't lose
    // pending Extensions/Forms edits; deleting the current file makes them
    // moot.
    if (filename !== selectedFile) saveGlobalVarsIfDirty()
    const result = await window.espansoAPI.deleteMatchFile(filename)
    if (result.success) {
      showToast('success', `Deleted ${filename}`)
      if (selectedFile === filename) {
        setSelectedFile(null)
        setMatches([])
        setGlobalVars({})
        setFileExtra({})
      }
      await loadFiles()
    } else {
      showToast('error', result.error || 'Failed to delete file')
    }
  }

  const openRawEditor = async (filename: string) => {
    try {
      const result = await window.espansoAPI.readMatchFile(filename)
      if (result.success) {
        setRawContent(result.content || '')
        setRawEditFile(filename)
      } else {
        showToast('error', result.error || 'Failed to load file')
      }
    } catch (err) {
      showToast('error', `Failed to load file: ${(err as Error).message}`)
    }
  }

  const saveRawEditor = async () => {
    if (!rawEditFile) return
    setRawSaving(true)
    try {
      const result = await window.espansoAPI.writeMatchFile(rawEditFile, rawContent)
      if (result.success) {
        showToast('success', 'File saved')
        if (rawEditFile === selectedFile) {
          await loadMatches(rawEditFile)
        }
        setRawEditFile(null)
      } else {
        showToast('error', `Failed to save: ${result.error}`)
      }
    } catch (err) {
      showToast('error', `Failed to save: ${(err as Error).message}`)
    } finally {
      setRawSaving(false)
    }
  }

  const copyTrigger = async (trigger: string) => {
    try {
      await navigator.clipboard.writeText(trigger)
      setCopiedTrigger(trigger)
      setTimeout(() => setCopiedTrigger(null), 2000)
    } catch {
      showToast('error', 'Failed to copy')
    }
  }

  const filteredMatches = matches.filter(match => {
    if (!search) return true
    const label = getMatchLabel(match).toLowerCase()
    const triggers = getMatchTriggers(match).join(' ').toLowerCase()
    const replace = getMatchReplacement(match).toLowerCase()
    return label.includes(search.toLowerCase()) || triggers.includes(search.toLowerCase()) || replace.includes(search.toLowerCase())
  }).reverse()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="search-input" style={{ width: 320 }}>
          <IoSearchOutline size={16} className="search-icon" />
          <input
            className="form-input"
            placeholder="Search snippets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={handleCreateMatch} disabled={!selectedFile}>
          <IoAdd size={16} /> New Snippet
        </button>
      </div>

      {filesLoading && files.length === 0 ? (
        <div className="text-sm text-muted" style={{ padding: '12px 0' }}>
          Loading match files...
        </div>
      ) : files.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <IoDocumentAttachOutline size={24} />
          </div>
          <div className="empty-state-title">No match files found</div>
          <div className="empty-state-desc">
            Create a new match file to start adding snippets. Match files are stored in the espanso match directory.
          </div>
          <button className="btn btn-lg btn-primary" onClick={() => setShowNewFileModal(true)}>
            <IoAddOutline size={16} /> Create Match File
          </button>
        </div>
      ) : (
        <div>
          {/* File switcher */}
          <div className="file-tabs">
            {files.map(file => (
              <div
                key={file.name}
                className={`file-tab ${selectedFile === file.name ? 'active' : ''}`}
                onClick={() => handleSelectFile(file.name)}
              >
                <span>{file.name}</span>
                <span
                  className="file-tab-delete"
                  onClick={(e) => { e.stopPropagation(); openRawEditor(file.name) }}
                  title="View raw YAML"
                >
                  <IoCodeSlashOutline size={11} />
                </span>
                <span
                  className="file-tab-delete"
                  onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.name) }}
                  title="Delete file"
                >
                  <IoTrashOutline size={11} />
                </span>
              </div>
            ))}
            <div className="file-tab-add" onClick={() => setShowNewFileModal(true)} title="New match file">
              <IoAddOutline size={14} />
            </div>
          </div>

          {/* Matches list */}
          <div>
            {selectedFile ? (
              <>
                <div className="tabs" style={{ marginBottom: 16 }}>
                  <button className={`tab ${view === 'snippets' ? 'active' : ''}`} onClick={() => switchSubTab('snippets')}>
                    Snippets {loadedFile === selectedFile ? `(${matches.length})` : ''}
                  </button>
                  <button
                    className={`tab ${view === 'extensions' ? 'active' : ''}`}
                    onClick={() => switchSubTab('extensions')}
                  >
                    <IoFlashOutline size={14} /> Extensions
                  </button>
                  <button
                    className={`tab ${view === 'forms' ? 'active' : ''}`}
                    onClick={() => switchSubTab('forms')}
                  >
                    Forms
                  </button>
                </div>

                {(view === 'extensions' || view === 'forms') && (
                  <div>
                    <div className="text-xs text-muted mb-4">
                      Shared by every snippet in <span className="font-mono">{selectedFile}</span>.
                    </div>
                    <VarEditor
                      vars={globalVars}
                      onChange={setGlobalVars}
                      showToast={showToast}
                      forcedSubTab={view}
                    />
                  </div>
                )}

                {view === 'snippets' && (loadedFile !== selectedFile ? (
                  <div className="text-sm text-muted" style={{ padding: '12px 0' }}>
                    Loading snippets...
                  </div>
                ) : filteredMatches.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">
                      <IoSearchOutline size={24} />
                    </div>
                    <div className="empty-state-title">
                      {search ? 'No matching snippets' : 'No snippets yet'}
                    </div>
                    <div className="empty-state-desc">
                      {search ? 'Try a different search term.' : 'Create your first snippet to get started.'}
                    </div>
                    {!search && (
                      <button className="btn btn-lg btn-primary" onClick={handleCreateMatch}>
                        <IoAddOutline size={16} /> New Snippet
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="match-list">
                    {filteredMatches.map((match, i) => {
                      const originalIndex = matches.indexOf(match)
                      const type = getMatchType(match)
                      const triggers = getMatchTriggers(match)
                      return (
                        <div
                          key={i}
                          className="match-item"
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleEditMatch(originalIndex)}
                        >
                          <div style={{ overflow: 'hidden' }}>
                            {triggers.length > 0 ? (
                              <div className="match-trigger">{triggers[0]}</div>
                            ) : (
                              <div className="match-trigger" style={{ color: 'var(--warning)' }}>regex</div>
                            )}
                            {triggers.length > 1 && (
                              <div className="text-xs text-muted">+{triggers.length - 1} more</div>
                            )}
                          </div>
                          <div className="match-replace">
                            {getMatchReplacement(match) || <span className="text-muted">No replacement</span>}
                          </div>
                          <span className={`badge badge-${type}`}>
                            {type === 'static' ? 'Static' : type === 'form' ? 'Form' : type === 'regex' ? 'Regex' : 'Dynamic'}
                          </span>
                          <div className="match-actions">
                            <button
                              className="btn btn-icon btn-sm"
                              onClick={(e) => { e.stopPropagation(); copyTrigger(triggers[0] || '') }}
                              title="Copy trigger"
                            >
                              {copiedTrigger === triggers[0] ? <IoCheckmark size={14} color="var(--success)" /> : <IoCopyOutline size={14} />}
                            </button>
                            <button
                              className="btn btn-icon btn-sm"
                              onClick={(e) => { e.stopPropagation(); handleEditMatch(originalIndex) }}
                              title="Edit"
                            >
                              <IoPencilOutline size={14} />
                            </button>
                            <button
                              className="btn btn-icon btn-sm"
                              onClick={(e) => { e.stopPropagation(); handleDeleteMatch(originalIndex) }}
                              title="Delete"
                            >
                              <IoTrashOutline size={14} color="var(--danger)" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <IoChevronForward size={24} />
                </div>
                <div className="empty-state-title">Select a match file</div>
                <div className="empty-state-desc">
                  Choose a file from the list to view and edit its snippets.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Match editor modal */}
      {editingMatch && (
        <MatchEditor
          match={editingMatch}
          isNew={editingIndex === null}
          globalVars={globalVars}
          onSave={handleSaveMatch}
          onCancel={() => { setEditingMatch(null); setEditingIndex(null) }}
          showToast={showToast}
        />
      )}

      {/* New file modal */}
      {showNewFileModal && (
        <div className="modal-overlay" onClick={() => setShowNewFileModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Create Match File</div>
              <button className="btn btn-icon btn-sm" onClick={() => setShowNewFileModal(false)}>
                <IoCloseOutline size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">File name</label>
                <input
                  className="form-input"
                  placeholder="my-snippets.yml"
                  value={newFileName}
                  onChange={e => setNewFileName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateFile() }}
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setShowNewFileModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateFile}>
                <IoAddOutline size={16} /> Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Raw YAML editor modal */}
      {rawEditFile && (
        <div className="modal-overlay" onClick={() => setRawEditFile(null)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title font-mono">{rawEditFile}</div>
              <button className="btn btn-icon btn-sm" onClick={() => setRawEditFile(null)}>
                <IoCloseOutline size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="text-xs text-muted mb-2">
                Edit the raw YAML directly. Be careful - invalid YAML will break espanso.
              </div>
              <textarea
                className="code-editor"
                value={rawContent}
                onChange={e => setRawContent(e.target.value)}
                rows={18}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setRawEditFile(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveRawEditor} disabled={rawSaving}>
                <IoSaveOutline size={16} /> {rawSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}