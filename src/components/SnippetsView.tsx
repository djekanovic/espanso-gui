import { useEffect, useState, useCallback } from 'react'
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
  IoSaveOutline
} from 'react-icons/io5'
import { ConfigInfo, EspansoMatch, MatchFile } from '../types'
import { extractMatches, getMatchLabel, getMatchTriggers, getMatchReplacement, getMatchType, triggerExists, buildMatchFileContent } from '../utils/yaml'
import MatchEditor from './MatchEditor'

interface Props {
  configInfo: ConfigInfo | null
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
}

export default function SnippetsView({ configInfo, showToast }: Props) {
  const [files, setFiles] = useState<MatchFile[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [matches, setMatches] = useState<EspansoMatch[]>([])
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
    }
  }, [selectedFile, showToast])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  const loadMatches = useCallback(async (filename: string) => {
    try {
      const result = await window.espansoAPI.readMatchFile(filename)
      if (result.success && result.content) {
        const extracted = extractMatches(result.content)
        setMatches(extracted)
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

  const saveMatches = async (filename: string, newMatches: EspansoMatch[]) => {
    try {
      const content = buildMatchFileContent(newMatches, `# ${filename.replace(/\.(yml|yaml)$/, '')}\n# Managed by Espanso GUI\n`)
      const result = await window.espansoAPI.writeMatchFile(filename, content)
      if (result.success) {
        setMatches(newMatches)
        showToast('success', 'Snippets saved')
      } else {
        showToast('error', `Failed to save: ${result.error}`)
      }
    } catch (err) {
      showToast('error', `Failed to save: ${(err as Error).message}`)
    }
  }

  const handleCreateMatch = () => {
    setEditingMatch({ trigger: '', replace: '' })
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

  const handleSaveMatch = async (match: EspansoMatch) => {
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
    
    await saveMatches(selectedFile, newMatches)
    setEditingMatch(null)
    setEditingIndex(null)
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
      await loadFiles()
      setSelectedFile(filename)
    } else {
      showToast('error', result.error || 'Failed to create file')
    }
  }

  const handleDeleteFile = async (filename: string) => {
    if (!confirm(`Delete ${filename}? This cannot be undone.`)) return
    const result = await window.espansoAPI.deleteMatchFile(filename)
    if (result.success) {
      showToast('success', `Deleted ${filename}`)
      if (selectedFile === filename) {
        setSelectedFile(null)
        setMatches([])
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
  })

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

      {files.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <IoDocumentAttachOutline size={24} />
          </div>
          <div className="empty-state-title">No match files found</div>
          <div className="empty-state-desc">
            Create a new match file to start adding snippets. Match files are stored in the espanso match directory.
          </div>
          <button className="btn btn-primary" onClick={() => setShowNewFileModal(true)}>
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
                onClick={() => setSelectedFile(file.name)}
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
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-secondary">
                    <span className="font-mono" style={{ color: 'var(--accent)' }}>{selectedFile}</span>
                    {' '}· {matches.length} snippets
                  </div>
                </div>

                {filteredMatches.length === 0 ? (
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
                      <button className="btn btn-primary" onClick={handleCreateMatch}>
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
                        <div key={i} className="match-item">
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
                              onClick={() => copyTrigger(triggers[0] || '')}
                              title="Copy trigger"
                            >
                              {copiedTrigger === triggers[0] ? <IoCheckmark size={14} color="var(--success)" /> : <IoCopyOutline size={14} />}
                            </button>
                            <button 
                              className="btn btn-icon btn-sm" 
                              onClick={() => handleEditMatch(originalIndex)}
                              title="Edit"
                            >
                              <IoPencilOutline size={14} />
                            </button>
                            <button 
                              className="btn btn-icon btn-sm" 
                              onClick={() => handleDeleteMatch(originalIndex)}
                              title="Delete"
                            >
                              <IoTrashOutline size={14} color="var(--danger)" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
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