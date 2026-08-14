// Espanso configuration types

export interface EspansoMatch {
  trigger?: string;
  triggers?: string[];
  replace?: string;
  replace_with?: string;
  form?: string;
  form_fields?: Record<string, FormField>;
  vars?: Record<string, VarDefinition>;
  label?: string;
  propagate_case?: boolean;
  word?: boolean;
  regex?: string;
  [key: string]: any;
}

// espanso only recognizes 3 field kinds: plain text (the default when `type`
// is omitted, optionally `multiline`), `choice` (dropdown), and `list` (same
// options, different widget). There is no password/number/date/color/etc -
// this used to list a bunch of HTML-input-flavored types that espanso simply
// doesn't support.
export interface FormField {
  type?: 'text' | 'choice' | 'list';
  // GUI-only - espanso has no per-field label property; a form's visible
  // prompt text comes from whatever literal text surrounds [[field]] in its
  // layout string. This is used to auto-generate that layout, then stripped
  // before writing form_fields out - never sent to espanso as-is.
  label?: string;
  default?: string;
  values?: string[];
  multiline?: boolean;
  [key: string]: any;
}

export interface VarDefinition {
  type: 'date' | 'shell' | 'echo' | 'random' | 'choice' | 'form' | 'clipboard' | 'counter' | 'script';
  params?: any;
  [key: string]: any;
}

export interface MatchFile {
  name: string;
  path: string;
  size: number;
  modified: Date;
  content?: string;
  matches?: EspansoMatch[];
}

export interface EspansoConfig {
  matches?: EspansoMatch[];
  includes?: string[];
  excludes?: string[];
  search_trigger?: string;
  search_shortcut?: string;
  toggle_key?: string;
  backend?: string;
  clipboard_threshold?: number;
  pre_paste_delay?: number;
  paste_shortcut?: string;
  preserve_clipboard?: boolean;
  show_notifications?: boolean;
  show_icon?: boolean;
  win32_keyboard_layouts?: string[];
  [key: string]: any;
}

export interface PackageInfo {
  name: string;
  path: string;
  manifest: string | null;
  title?: string | null;
  version?: string | null;
  description?: string | null;
  author?: string | null;
}

export interface ConfigInfo {
  configDir: string;
  configPath: string;
  matchDir: string;
  packagesDir: string;
  exists: boolean;
}

export interface EspansoStatus {
  installed: boolean;
  version: string | null;
  error: string | null;
}

// Global trigger symbol settings
export interface TriggerSettings {
  symbol: string;
  applyTo: 'new-only' | 'all';
}