import { useEffect, useState, useCallback, useRef } from 'react'
import {
  IoSaveOutline,
  IoSyncOutline,
  IoChevronDown,
  IoChevronForward,
  IoCloseOutline,
  IoCheckmark,
  IoKeypadOutline,
  IoAddOutline
} from 'react-icons/io5'
import { ConfigInfo } from '../types'
import { parseConfigSettings, buildConfigContent, detectTriggerSymbol, applyTriggerSymbolToAll, parseMatchFile, extractMatches, buildMatchFileContent } from '../utils/yaml'
import { NewlineMode, getDefaultNewlineMode, setDefaultNewlineMode, setTriggerSymbol } from '../utils/prefs'

interface Props {
  configInfo: ConfigInfo | null
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
  onHeaderActionsChange?: (node: React.ReactNode) => void
}

const TRIGGER_SYMBOLS = [':', ';', '/', '!', '?', '.', ',']

// espanso's accepted toggle_key values (docs: configuration/options/toggle_key)
const TOGGLE_KEY_OPTIONS = [
  '', 'OFF', 'CTRL', 'ALT', 'SHIFT', 'META',
  'LEFT_CTRL', 'RIGHT_CTRL', 'LEFT_ALT', 'RIGHT_ALT',
  'LEFT_SHIFT', 'RIGHT_SHIFT', 'LEFT_META', 'RIGHT_META'
]

// espanso's built-in default word_separators (docs: configuration/options/word_separators)
const DEFAULT_WORD_SEPARATORS = [
  ' ', ',', '.', '?', '!', '\r', '\n', '\t', "'", '"', '\x0c',
  '(', ')', '[', ']', '{', '}', '<', '>', ':', ';', '\xa0'
]

const WORD_SEPARATOR_LABELS: Record<string, string> = {
  ' ': 'Space',
  ',': 'Comma ,',
  '.': 'Period .',
  '?': 'Question Mark ?',
  '!': 'Exclamation !',
  '\r': 'Carriage Return',
  '\n': 'Newline',
  '\t': 'Tab',
  "'": "Single Quote '",
  '"': 'Double Quote "',
  '\x0c': 'Form Feed',
  '(': 'Open Paren (',
  ')': 'Close Paren )',
  '[': 'Open Bracket [',
  ']': 'Close Bracket ]',
  '{': 'Open Brace {',
  '}': 'Close Brace }',
  '<': 'Less Than <',
  '>': 'Greater Than >',
  ':': 'Colon :',
  ';': 'Semicolon ;',
  '\xa0': 'Non-breaking Space'
}

// Map a keydown event's main (non-modifier) key to espanso's search_shortcut
// key names (docs: configuration/options/search_shortcut).
function mapKeyToEspansoKey(e: KeyboardEvent): string | null {
  const key = e.key
  if (key === ' ') return 'SPACE'
  if (key === 'Enter') return 'ENTER'
  if (key === 'Tab') return 'TAB'
  if (key === 'Insert') return 'INSERT'
  if (key === 'ArrowDown') return 'DOWN'
  if (key === 'ArrowLeft') return 'LEFT'
  if (key === 'ArrowRight') return 'RIGHT'
  if (key === 'ArrowUp') return 'UP'
  if (key === 'End') return 'END'
  if (key === 'Home') return 'HOME'
  if (key === 'PageDown') return 'PAGEDOWN'
  if (key === 'PageUp') return 'PAGEUP'
  if (/^F([1-9]|1[0-9]|20)$/.test(key)) return key.toUpperCase()
  if (/^[a-zA-Z]$/.test(key)) return key.toUpperCase()
  if (/^[0-9]$/.test(key)) return key
  if (/^Numpad[0-9]$/.test(e.code)) return `NUMPAD${e.code.slice(6)}`
  return null
}

export default function ConfigView({ configInfo, showToast, onHeaderActionsChange }: Props) {
  const [configContent, setConfigContent] = useState('')
  const [settings, setSettings] = useState<Record<string, any>>({})
  const [currentSymbol, setCurrentSymbol] = useState(':')
  const [newSymbol, setNewSymbol] = useState(':')
  const [showTriggerModal, setShowTriggerModal] = useState(false)
  const [applyTo, setApplyTo] = useState<'new-only' | 'all'>('new-only')
  const [saving, setSaving] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['general', 'search']))
  const [recordingShortcut, setRecordingShortcut] = useState(false)
  const [defaultNewlineMode, setDefaultNewlineModeState] = useState<NewlineMode>(getDefaultNewlineMode())
  const [customSeparator, setCustomSeparator] = useState('')

  const loadConfig = useCallback(async () => {
    try {
      const result = await window.espansoAPI.readConfig()
      if (result.success && result.content) {
        setConfigContent(result.content)
        const parsed = parseConfigSettings(result.content)
        if ('match' in parsed) delete parsed.match
        setSettings(parsed)
      } else if (result.error) {
        showToast('error', result.error)
      }
    } catch (err) {
      showToast('error', `Failed to load config: ${(err as Error).message}`)
    }
  }, [showToast])

  // The trigger symbol (e.g. ':' in ':hello') is a convention read from the
  // user's own snippets, not an espanso config setting - detect it from
  // whatever match files are on disk.
  const loadTriggerSymbol = useCallback(async () => {
    try {
      const files = await window.espansoAPI.listMatchFiles()
      if (!files.success || !files.files) return
      const allMatches = []
      for (const file of files.files) {
        const fileResult = await window.espansoAPI.readMatchFile(file.name)
        if (fileResult.success && fileResult.content) {
          allMatches.push(...extractMatches(fileResult.content))
        }
      }
      const detected = detectTriggerSymbol(allMatches)
      let symbol = detected
      try {
        const stored = localStorage.getItem('espanso-gui:triggerSymbol')
        if (stored != null && stored.length > 0) symbol = stored
      } catch {
        // localStorage unavailable - use detected
      }
      setCurrentSymbol(symbol)
      setNewSymbol(symbol)
    } catch {
      // Non-critical - fall back to the ':' default already in state
    }
  }, [])

  useEffect(() => {
    loadConfig()
    loadTriggerSymbol()
  }, [loadConfig, loadTriggerSymbol])

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  // Remove a key entirely so espanso falls back to its own built-in default
  // (e.g. "Reset to Defaults" on word_separators) rather than persisting a
  // value that happens to match the default.
  const clearSetting = (key: string) => {
    setSettings(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  // Kept in sync with `settings` so the recording keydown handler (set up
  // once per recording session) always writes against the latest values
  // instead of whatever was current when recording started.
  const settingsRef = useRef(settings)
  useEffect(() => { settingsRef.current = settings }, [settings])

  // Search Trigger / Search Shortcut / Toggle Key save immediately instead
  // of waiting for the "Save Config" button - they're single atomic values
  // (a dropdown pick, a captured combo, or a trigger string), not a form
  // you'd want to fill out before committing. Text fields save on blur
  // rather than per-keystroke so we're not writing a partial value on
  // every character typed.
  const autoSaveSettings = async (newSettings: Record<string, any>) => {
    setSettings(newSettings)
    try {
      const content = buildConfigContent(newSettings, configContent)
      const result = await window.espansoAPI.writeConfig(content)
      if (result.success) {
        setConfigContent(content)
      } else {
        showToast('error', `Failed to save: ${result.error}`)
      }
    } catch (err) {
      showToast('error', `Failed to save: ${(err as Error).message}`)
    }
  }

  // While recording, capture the next real key combo pressed and format it
  // into espanso's search_shortcut syntax (e.g. "ALT+SHIFT+SPACE").
  //
  // espanso's own daemon runs a global low-level keyboard hook, so combos
  // that match its currently active hotkeys (including its built-in
  // defaults, e.g. ALT+SPACE) never reach this window at all - espanso
  // consumes them first. We stop espanso for the duration of recording and
  // restart it afterward so any combo can actually be captured.
  useEffect(() => {
    if (!recordingShortcut) return

    let wasRunning = false
    ;(async () => {
      try {
        const status = await window.espansoAPI.runEspansoCommand(['status'])
        wasRunning = status.success && !status.stdout?.includes('not running')
        if (wasRunning) {
          await window.espansoAPI.runEspansoCommand(['stop'])
        }
      } catch {
        // Non-critical - recording still works for combos espanso wasn't intercepting
      }
    })()

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        setRecordingShortcut(false)
        return
      }

      const mainKey = mapKeyToEspansoKey(e)
      if (!mainKey) return // still just a modifier - keep waiting

      const modifiers: string[] = []
      if (e.ctrlKey) modifiers.push('CTRL')
      if (e.altKey) modifiers.push('ALT')
      if (e.shiftKey) modifiers.push('SHIFT')
      if (e.metaKey) modifiers.push('META')

      autoSaveSettings({ ...settingsRef.current, search_shortcut: [...modifiers, mainKey].join('+') })
      setRecordingShortcut(false)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      if (wasRunning) {
        window.espansoAPI.runEspansoCommand(['start']).catch(() => {})
      }
    }
  }, [recordingShortcut])

  const saveConfig = useCallback(async () => {
    setSaving(true)
    try {
      const content = buildConfigContent(settings, configContent)
      const result = await window.espansoAPI.writeConfig(content)
      if (result.success) {
        setConfigContent(content)
        showToast('success', 'Configuration saved')
      } else {
        showToast('error', `Failed to save: ${result.error}`)
      }
    } catch (err) {
      showToast('error', `Failed to save: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }, [settings, configContent, showToast])

  // Project Save/Reload into the topbar next to the "Configuration" title,
  // instead of a separate sticky bar inside the scrollable content.
  useEffect(() => {
    if (!onHeaderActionsChange) return
    onHeaderActionsChange(
      <div className="flex gap-2">
        {settings.auto_restart === false && (
          <button className="btn btn-sm" onClick={loadConfig}>
            <IoSyncOutline size={14} /> Reload
          </button>
        )}
        <button className="btn btn-sm btn-primary" onClick={saveConfig} disabled={saving}>
          <IoSaveOutline size={14} /> {saving ? 'Saving...' : 'Save Config'}
        </button>
      </div>
    )
    return () => onHeaderActionsChange(null)
  }, [settings.auto_restart, saving, loadConfig, saveConfig])

  const handleApplyTriggerSymbol = async () => {
    if (!newSymbol || newSymbol.length > 1) {
      showToast('error', 'Trigger symbol must be a single character')
      return
    }

    try {
      setCurrentSymbol(newSymbol)
      setTriggerSymbol(newSymbol)

      // If applying to all, update all match files
      if (applyTo === 'all') {
        const files = await window.espansoAPI.listMatchFiles()
        if (files.success && files.files) {
          for (const file of files.files) {
            const fileResult = await window.espansoAPI.readMatchFile(file.name)
            if (fileResult.success && fileResult.content) {
              const parsed = parseMatchFile(fileResult.content)
              const updatedMatches = applyTriggerSymbolToAll(parsed.matches, newSymbol)
              const newContent = buildMatchFileContent(updatedMatches, parsed.globalVars, parsed.extra)
              await window.espansoAPI.writeMatchFile(file.name, newContent)
            }
          }
          showToast('success', `Trigger symbol changed to "${newSymbol}" and applied to all snippets`)
        }
      } else {
        showToast('success', `Trigger symbol changed to "${newSymbol}". New snippets will use it.`)
      }

      setShowTriggerModal(false)
    } catch (err) {
      showToast('error', `Failed to apply trigger symbol: ${(err as Error).message}`)
    }
  }

  const renderSection = (id: string, title: string, children: React.ReactNode) => {
    const isOpen = expandedSections.has(id)
    return (
      <div className="card mb-4">
        <div 
          className="flex items-center justify-between" 
          style={{ cursor: 'pointer', padding: '4px 0' }}
          onClick={() => toggleSection(id)}
        >
          <div className="card-title">{title}</div>
          {isOpen ? <IoChevronDown size={16} /> : <IoChevronForward size={16} />}
        </div>
        {isOpen && (
          <div className="mt-4">
            {children}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="text-sm text-secondary mb-6">
        Edit the main espanso configuration file
      </div>

      {/* Global Trigger Symbol */}
      <div className="card mb-6" style={{ borderColor: 'rgba(79, 140, 255, 0.3)' }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="card-title mb-1">Global Trigger Symbol</div>
            <div className="text-sm text-secondary">
              Current symbol: <code className="font-mono" style={{ color: 'var(--accent)', fontSize: 16 }}>{currentSymbol}</code>
            </div>
            <div className="text-xs text-muted mt-1">
              This is the character you type before a trigger to activate it (e.g. {currentSymbol}hello)
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowTriggerModal(true)}>
            Change Symbol
          </button>
        </div>
      </div>

      {/* Espanso GUI preferences - not written to espanso's config, stored locally */}
      <div className="card mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="card-title mb-1">New Snippet Line Breaks</div>
            <div className="text-sm text-secondary">
              Default for the "Replacement Text" field when creating a new snippet
            </div>
            <div className="text-xs text-muted mt-1">
              A GUI preference, stored on this device only - not part of espanso's own config
            </div>
          </div>
          <select
            className="form-select"
            style={{ width: 200 }}
            value={defaultNewlineMode}
            onChange={e => {
              const mode = e.target.value as NewlineMode
              setDefaultNewlineModeState(mode)
              setDefaultNewlineMode(mode)
            }}
          >
            <option value="preserve">Keep line breaks</option>
            <option value="join">Join as spaces</option>
          </select>
        </div>
      </div>

      {/* Settings sections */}
      {renderSection('general', 'General Settings', (
        <div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Backend</div>
              <div className="settings-desc">How text is injected. Auto uses keypresses for short snippets and clipboard for long ones</div>
            </div>
            <select
              className="form-select"
              style={{ width: 200 }}
              value={(settings.backend || 'auto').toString().toLowerCase()}
              onChange={e => updateSetting('backend', e.target.value)}
            >
              <option value="auto">Auto (recommended)</option>
              <option value="clipboard">Clipboard</option>
              <option value="inject">Inject (keypresses)</option>
            </select>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">Clipboard Threshold</div>
              <div className="settings-desc">Use clipboard injection above this length (default 100). Only applies when Backend is Auto</div>
            </div>
            <input
              className="form-input"
              type="number"
              style={{ width: 120 }}
              placeholder="100"
              value={settings.clipboard_threshold ?? ''}
              onChange={e => {
                const v = e.target.value
                if (v === '') clearSetting('clipboard_threshold')
                else updateSetting('clipboard_threshold', parseInt(v) || 0)
              }}
            />
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">Pre-Paste Delay</div>
              <div className="settings-desc">Milliseconds to wait after copying, before pasting (default 300)</div>
            </div>
            <input
              className="form-input"
              type="number"
              style={{ width: 120 }}
              placeholder="300"
              value={settings.pre_paste_delay ?? ''}
              onChange={e => {
                const v = e.target.value
                if (v === '') clearSetting('pre_paste_delay')
                else updateSetting('pre_paste_delay', parseInt(v) || 0)
              }}
            />
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">Paste Shortcut</div>
              <div className="settings-desc">Keyboard shortcut used for pasting</div>
            </div>
            <input
              className="form-input font-mono"
              style={{ width: 200 }}
              value={settings.paste_shortcut || ''}
              placeholder="CTRL+V"
              onChange={e => updateSetting('paste_shortcut', e.target.value)}
            />
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">Preserve Clipboard</div>
              <div className="settings-desc">Restore the previous clipboard content after an expansion</div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.preserve_clipboard !== false}
                onChange={e => updateSetting('preserve_clipboard', e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">Show Notifications</div>
              <div className="settings-desc">If false, disable all notifications</div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.show_notifications !== false}
                onChange={e => updateSetting('show_notifications', e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">Show Icon</div>
              <div className="settings-desc">If false, avoid showing the espanso icon on the system's tray bar. Not supported on Linux.</div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.show_icon !== false}
                onChange={e => updateSetting('show_icon', e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">Enabled</div>
              <div className="settings-desc">Activate espanso for this configuration</div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.enable !== false}
                onChange={e => updateSetting('enable', e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">Undo on Backspace</div>
              <div className="settings-desc">Automatically revert an expansion if Backspace is pressed right after</div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.undo_backspace !== false}
                onChange={e => updateSetting('undo_backspace', e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">Auto Restart</div>
              <div className="settings-desc">Restart the worker and reload config when a config file changes on disk</div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.auto_restart !== false}
                onChange={e => updateSetting('auto_restart', e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>
      ))}

      {renderSection('search', 'Search Settings', (
        <div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Search Trigger</div>
              <div className="settings-desc">Text typed to open the search bar (e.g. a symbol or a whole word like ".search")</div>
            </div>
            <input
              className="form-input font-mono"
              style={{ width: 160 }}
              value={settings.search_trigger ?? ''}
              placeholder=".search"
              onFocus={e => e.target.select()}
              onChange={e => updateSetting('search_trigger', e.target.value)}
              onBlur={() => autoSaveSettings(settingsRef.current)}
            />
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">Search Shortcut</div>
              <div className="settings-desc">
                {recordingShortcut ? 'Press the key combo now (espanso paused so it doesn\'t intercept it)... Esc to cancel' : 'Keyboard shortcut to open the search bar'}
              </div>
            </div>
            <div className="form-input-group" style={{ width: 200 }}>
              <input
                className="form-input font-mono"
                value={settings.search_shortcut || ''}
                placeholder="ALT+SHIFT+SPACE"
                onChange={e => updateSetting('search_shortcut', e.target.value)}
                onBlur={() => autoSaveSettings(settingsRef.current)}
              />
              <button
                type="button"
                className={`btn btn-icon btn-sm ${recordingShortcut ? 'btn-primary' : ''}`}
                title="Record shortcut by pressing keys"
                onClick={() => setRecordingShortcut(r => !r)}
              >
                <IoKeypadOutline size={14} />
              </button>
            </div>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">Toggle Key</div>
              <div className="settings-desc">Double-tap to toggle espanso on/off</div>
            </div>
            <select
              className="form-select font-mono"
              style={{ width: 200 }}
              value={settings.toggle_key ?? ''}
              onChange={e => {
                const next = { ...settings }
                if (e.target.value) next.toggle_key = e.target.value
                else delete next.toggle_key
                autoSaveSettings(next)
              }}
            >
              {TOGGLE_KEY_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt === '' ? 'Off (default)' : opt}</option>
              ))}
            </select>
          </div>
        </div>
      ))}

      {renderSection('advanced', 'Advanced Settings', (
        <div>
          <div className="settings-row">
            <div>
              <div className="settings-label">Includes</div>
              <div className="settings-desc">Extra match-file globs to load (comma separated). Files starting with _ are skipped unless imported.</div>
            </div>
            <input
              className="form-input font-mono"
              style={{ width: 300 }}
              value={(settings.includes || []).join(', ')}
              onChange={e => updateSetting('includes', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            />
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">Excludes</div>
              <div className="settings-desc">Match-file globs to skip (comma separated)</div>
            </div>
            <input
              className="form-input font-mono"
              style={{ width: 300 }}
              value={(settings.excludes || []).join(', ')}
              onChange={e => updateSetting('excludes', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            />
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">Backspace Limit</div>
              <div className="settings-desc">Max backspace presses tracked for correcting a misspelled trigger</div>
            </div>
            <input
              className="form-input"
              type="number"
              style={{ width: 120 }}
              value={settings.backspace_limit ?? 5}
              onChange={e => updateSetting('backspace_limit', parseInt(e.target.value) || 0)}
            />
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">Max Form Size</div>
              <div className="settings-desc">Maximum width/height for form dialogs, in pixels</div>
            </div>
            <div className="form-input-group" style={{ width: 220 }}>
              <input
                className="form-input"
                type="number"
                placeholder="700"
                value={settings.max_form_width ?? ''}
                onChange={e => updateSetting('max_form_width', parseInt(e.target.value) || 0)}
              />
              <span className="text-muted">×</span>
              <input
                className="form-input"
                type="number"
                placeholder="500"
                value={settings.max_form_height ?? ''}
                onChange={e => updateSetting('max_form_height', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">Emulate ALT Codes</div>
              <div className="settings-desc">Restore ALT-code character entry on Windows (may conflict with expansions)</div>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.emulate_alt_codes === true}
                onChange={e => updateSetting('emulate_alt_codes', e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="settings-label">Word Separators</div>
                <div className="settings-desc">Characters that mark the start/end of a word, for "Word Boundary" matches</div>
              </div>
              {settings.word_separators !== undefined && (
                <button className="btn btn-sm" onClick={() => clearSetting('word_separators')}>
                  Reset to Defaults
                </button>
              )}
            </div>
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              {DEFAULT_WORD_SEPARATORS.map(char => {
                const active = (settings.word_separators ?? DEFAULT_WORD_SEPARATORS).includes(char)
                return (
                  <button
                    key={char === ' ' ? 'space' : char}
                    className={`btn btn-sm ${active ? 'btn-primary' : ''}`}
                    style={{ opacity: active ? 1 : 0.5 }}
                    title={active ? 'Click to remove' : 'Click to add'}
                    onClick={() => {
                      const current: string[] = settings.word_separators ?? DEFAULT_WORD_SEPARATORS
                      const next = current.includes(char) ? current.filter(c => c !== char) : [...current, char]
                      updateSetting('word_separators', next)
                    }}
                  >
                    {WORD_SEPARATOR_LABELS[char] || char}
                  </button>
                )
              })}
              {(settings.word_separators ?? []).filter((c: string) => !DEFAULT_WORD_SEPARATORS.includes(c)).map((char: string) => (
                <button
                  key={`custom-${char}`}
                  className="btn btn-sm btn-primary"
                  title="Click to remove"
                  onClick={() => {
                    const current: string[] = settings.word_separators ?? []
                    updateSetting('word_separators', current.filter(c => c !== char))
                  }}
                >
                  {char} <IoCloseOutline size={12} />
                </button>
              ))}
            </div>
            <div className="form-input-group" style={{ width: 200 }}>
              <input
                className="form-input font-mono"
                placeholder="Custom char"
                maxLength={4}
                value={customSeparator}
                onChange={e => setCustomSeparator(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter' || !customSeparator) return
                  const current: string[] = settings.word_separators ?? DEFAULT_WORD_SEPARATORS
                  if (!current.includes(customSeparator)) {
                    updateSetting('word_separators', [...current, customSeparator])
                  }
                  setCustomSeparator('')
                }}
              />
              <button
                className="btn btn-sm"
                disabled={!customSeparator}
                onClick={() => {
                  const current: string[] = settings.word_separators ?? DEFAULT_WORD_SEPARATORS
                  if (!current.includes(customSeparator)) {
                    updateSetting('word_separators', [...current, customSeparator])
                  }
                  setCustomSeparator('')
                }}
              >
                <IoAddOutline size={14} /> Add
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Raw YAML editor */}
      {renderSection('raw', 'Raw YAML Editor', (
        <div>
          <div className="text-xs text-muted mb-2">
            Edit the raw YAML directly. Be careful - invalid YAML will break espanso.
          </div>
          <textarea
            className="code-editor"
            value={configContent}
            onChange={e => setConfigContent(e.target.value)}
            rows={12}
          />
          <div className="flex justify-end mt-2">
            <button 
              className="btn btn-primary" 
              onClick={async () => {
                const result = await window.espansoAPI.writeConfig(configContent)
                if (result.success) {
                  showToast('success', 'Raw config saved')
                  await loadConfig()
                } else {
                  showToast('error', `Failed to save: ${result.error}`)
                }
              }}
            >
              <IoSaveOutline size={16} /> Save Raw
            </button>
          </div>
        </div>
      ))}

      {/* Trigger symbol modal */}
      {showTriggerModal && (
        <div className="modal-overlay" onClick={() => setShowTriggerModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Change Global Trigger Symbol</div>
              <button className="btn btn-icon btn-sm" onClick={() => setShowTriggerModal(false)}>
                <IoCloseOutline size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Select Symbol</label>
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  {TRIGGER_SYMBOLS.map(symbol => (
                    <button
                      key={symbol}
                      className={`btn ${newSymbol === symbol ? 'btn-primary' : ''}`}
                      style={{ width: 48, height: 40, fontSize: 18, justifyContent: 'center' }}
                      onClick={() => setNewSymbol(symbol)}
                    >
                      {symbol}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Custom Symbol</label>
                <input
                  className="form-input font-mono"
                  style={{ width: 80, textAlign: 'center', fontSize: 18 }}
                  value={newSymbol}
                  maxLength={1}
                  onChange={e => setNewSymbol(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Apply To</label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="applyTo"
                      checked={applyTo === 'new-only'}
                      onChange={() => setApplyTo('new-only')}
                    />
                    <span className="text-sm">Only new snippets (existing triggers stay unchanged)</span>
                  </label>
                  <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="applyTo"
                      checked={applyTo === 'all'}
                      onChange={() => setApplyTo('all')}
                    />
                    <span className="text-sm">Replace all existing triggers (e.g. :hello → {newSymbol}hello)</span>
                  </label>
                </div>
              </div>

              {applyTo === 'all' && (
                <div className="text-xs" style={{ color: 'var(--warning)' }}>
                  Warning: This will modify all your existing snippets. Make sure you have a backup.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setShowTriggerModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleApplyTriggerSymbol}>
                <IoCheckmark size={16} /> Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}