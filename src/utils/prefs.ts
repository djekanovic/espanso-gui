// App-level (GUI-only) preferences, stored in localStorage. These are not
// espanso config options - espanso has no notion of "default newline
// handling for new snippets", it's purely about how this editor authors
// the `replace` string before writing it to a match file.

export type NewlineMode = 'preserve' | 'join'

const NEWLINE_MODE_KEY = 'espanso-gui:defaultNewlineMode'

export function getDefaultNewlineMode(): NewlineMode {
  const stored = localStorage.getItem(NEWLINE_MODE_KEY)
  return stored === 'join' ? 'join' : 'preserve'
}

export function setDefaultNewlineMode(mode: NewlineMode): void {
  localStorage.setItem(NEWLINE_MODE_KEY, mode)
}

// Collapse line breaks into single spaces, e.g. for a snippet typed across
// multiple lines in the editor for readability but meant to expand as one
// continuous line. Multiple blank lines still collapse to a single space -
// there's no "paragraph break" concept once join mode is chosen.
export function foldNewlines(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, ' ').trim()
}

// Accent color theme, applied via data-theme on <html>. 'green' matches
// espanso's own brand color and is the default; the other two are picks
// that read clearly against the dark UI without colliding with the
// existing success/warning/danger palette.
export type Theme = 'green' | 'blue' | 'violet'

const THEME_KEY = 'espanso-gui:theme'

export const THEMES: { id: Theme; label: string; color: string }[] = [
  { id: 'green', label: 'Espanso Green', color: '#22c55e' },
  { id: 'blue', label: 'Blue', color: '#4f8cff' },
  { id: 'violet', label: 'Violet', color: '#8b5cf6' }
]

export function getTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  return stored === 'blue' || stored === 'violet' ? stored : 'green'
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme)
  applyTheme(theme)
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
}

// Trigger prefix convention (e.g. ':' in ':hello'). Not an espanso config
// option - stored here so "new snippets only" actually applies after restart.
const TRIGGER_SYMBOL_KEY = 'espanso-gui:triggerSymbol'

export function getTriggerSymbol(): string {
  const stored = localStorage.getItem(TRIGGER_SYMBOL_KEY)
  return stored && stored.length > 0 ? stored : ':'
}

export function setTriggerSymbol(symbol: string): void {
  localStorage.setItem(TRIGGER_SYMBOL_KEY, symbol)
}

const WELCOME_KEY = 'espanso-gui:welcomeCompleted'
const WELCOME_RESET_FLAG = 'espanso-gui:folderBackupWelcomeReset'

// Folder backup replaced per-file .backup copies. Clear the old completion
// flag once so the welcome screen shows again (including local re-testing).
function resetWelcomeForFolderBackup() {
  try {
    if (localStorage.getItem(WELCOME_RESET_FLAG) === '1') return
    localStorage.removeItem(WELCOME_KEY)
    localStorage.setItem(WELCOME_RESET_FLAG, '1')
  } catch {
    // localStorage can throw in locked / private sessions
  }
}

export function hasCompletedWelcome(): boolean {
  resetWelcomeForFolderBackup()
  return localStorage.getItem(WELCOME_KEY) === '1'
}

export function setWelcomeCompleted(): void {
  localStorage.setItem(WELCOME_KEY, '1')
}
