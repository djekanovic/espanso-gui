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
