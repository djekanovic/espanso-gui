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

export interface FormField {
  type: 'text' | 'password' | 'number' | 'date' | 'time' | 'color' | 'select' | 'textarea' | 'toggle' | 'radio' | 'checkbox';
  label?: string;
  default?: string;
  options?: string[];
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
  match?: string[];
  includes?: string[];
  search_trigger?: string;
  search_shortcut?: string;
  toggle_key?: string;
  backend?: string;
  clipboard_threshold?: number;
  pre_paste_delay?: number;
  paste_shortcut?: string;
  restore_clipboard?: boolean;
  show_notifications?: boolean;
  show_icon?: boolean;
  win32_keyboard_layouts?: string[];
  [key: string]: any;
}

export interface PackageInfo {
  name: string;
  path: string;
  manifest: string | null;
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