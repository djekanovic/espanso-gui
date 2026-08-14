import yaml from 'js-yaml';
import { EspansoMatch, MatchFile, VarDefinition } from '../types';

// espanso's real `vars:`/`global_vars:` shape is a YAML SEQUENCE of
// {name, type, params} objects - NOT a mapping keyed by name. The editor
// keeps the keyed-by-name shape in memory (much nicer for rename-in-place
// UI), so every load/save needs to convert at this boundary. Getting this
// wrong means espanso can't parse the file at all - it silently rejects a
// `vars:` mapping since it expects a sequence.
export function normalizeVars(raw: any): Record<string, VarDefinition> {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const record: Record<string, VarDefinition> = {};
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object' || !entry.name) continue;
      const { name, ...rest } = entry;
      record[name] = rest as VarDefinition;
    }
    return record;
  }
  // Already a plain object - either passed straight from in-memory state, or
  // (self-healing) a file an earlier, buggy version of this app corrupted
  // into the wrong shape. Either way, this is already the shape we want.
  if (typeof raw === 'object') return raw as Record<string, VarDefinition>;
  return {};
}

// A `type: form` var's params.fields carries a GUI-only `label` per field
// (see the FormField comment in types.ts) used to auto-generate `layout` -
// espanso has no such property and would just carry it around as inert
// clutter, so it's stripped here, at the only place every var is guaranteed
// to pass through on its way to disk.
function stripGuiOnlyFormFieldData(def: VarDefinition): VarDefinition {
  if (def.type !== 'form' || !def.params?.fields) return def;
  const fields: Record<string, any> = {};
  for (const [fieldName, field] of Object.entries<any>(def.params.fields)) {
    const { label, ...rest } = field || {};
    fields[fieldName] = rest;
  }
  return { ...def, params: { ...def.params, fields } };
}

export function denormalizeVars(record: Record<string, VarDefinition> | undefined): any[] {
  if (!record) return [];
  return Object.entries(record).map(([name, def]) => ({ name, ...stripGuiOnlyFormFieldData(def) }));
}

// Parse YAML content into a JS object
export function parseYaml<T>(content: string): T {
  try {
    return yaml.load(content) as T;
  } catch (err) {
    throw new Error(`Failed to parse YAML: ${(err as Error).message}`);
  }
}

// Serialize a JS object to YAML
export function serializeYaml(obj: any): string {
  try {
    return yaml.dump(obj, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      sortKeys: false
    });
  } catch (err) {
    throw new Error(`Failed to serialize YAML: ${(err as Error).message}`);
  }
}

// Extract matches from a match file content. Each match's `vars` (a real
// YAML sequence on disk) is normalized to a name-keyed object for the editor.
export function extractMatches(content: string): EspansoMatch[] {
  return parseMatchFile(content).matches;
}

export interface ParsedMatchFile {
  matches: EspansoMatch[];
  globalVars: Record<string, VarDefinition>;
  extra: Record<string, any>;
}

function normalizeMatch(m: EspansoMatch): EspansoMatch {
  if (!m || m.vars === undefined) return m;
  return { ...m, vars: normalizeVars(m.vars) };
}

// Parse a whole match file so unknown top-level keys (imports, etc.) survive
// a GUI save instead of being dropped.
export function parseMatchFile(content: string): ParsedMatchFile {
  try {
    const parsed = yaml.load(content) as any;
    if (!parsed || typeof parsed !== 'object') {
      return { matches: [], globalVars: {}, extra: {} };
    }
    const { matches, global_vars, ...extra } = parsed;
    return {
      matches: Array.isArray(matches) ? matches.map(normalizeMatch) : [],
      globalVars: normalizeVars(global_vars),
      extra
    };
  } catch {
    return { matches: [], globalVars: {}, extra: {} };
  }
}

// Extract a match file's global_vars (shared by every match in that file -
// see espanso.org/docs/matches/basics/#global-variables), normalized the
// same way as match-local vars.
export function extractGlobalVars(content: string): Record<string, VarDefinition> {
  return parseMatchFile(content).globalVars;
}

// Build match file content from matches (+ optional file-wide global_vars).
// Denormalizes both back to espanso's real sequence shape before serializing.
// `extra` is merged first so imports and other top-level keys are preserved.
export function buildMatchFileContent(
  matches: EspansoMatch[],
  globalVars?: Record<string, VarDefinition>,
  extra?: Record<string, any>,
  headerComment?: string
): string {
  const denormalizedMatches = matches.map(m => {
    if (!m || m.vars === undefined) return m;
    return { ...m, vars: denormalizeVars(m.vars as any) };
  });

  const doc: any = { ...(extra || {}) };
  if (globalVars && Object.keys(globalVars).length > 0) {
    doc.global_vars = denormalizeVars(globalVars);
  } else {
    delete doc.global_vars;
  }
  doc.matches = denormalizedMatches;

  const yamlStr = serializeYaml(doc);
  if (headerComment) {
    return `${headerComment}\n${yamlStr}`;
  }
  return yamlStr;
}

// Get a display label for a match
export function getMatchLabel(match: EspansoMatch): string {
  if (match.label) return match.label;
  const trigger = match.trigger || (match.triggers && match.triggers[0]) || '';
  return trigger || 'Untitled';
}

// Get all triggers for a match
export function getMatchTriggers(match: EspansoMatch): string[] {
  if (match.triggers && match.triggers.length > 0) return match.triggers;
  if (match.trigger) return [match.trigger];
  return [];
}

// Get the replacement text for a match
export function getMatchReplacement(match: EspansoMatch): string {
  if (match.replace) return match.replace;
  if (match.replace_with) return match.replace_with;
  if (match.markdown) return match.markdown;
  if (match.html) return String(match.html);
  if (match.image_path) return `[Image: ${match.image_path}]`;
  if (match.form) return `[Form: ${match.form}]`;
  return '';
}

// Detect if a match uses dynamic features
export function getMatchType(match: EspansoMatch): 'static' | 'form' | 'dynamic' | 'regex' {
  if (match.form) return 'form'; // legacy shorthand, pre-migration
  if (match.regex) return 'regex';
  if (match.vars && Object.values(match.vars).some(v => v.type === 'form')) return 'form';
  if (match.vars && Object.keys(match.vars).length > 0) return 'dynamic';
  return 'static';
}

// Check if a trigger already exists in a list of matches
export function triggerExists(matches: EspansoMatch[], trigger: string, excludeIndex?: number): boolean {
  return matches.some((m, i) => {
    if (i === excludeIndex) return false;
    return getMatchTriggers(m).includes(trigger);
  });
}

// Format a date for display
export function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Format file size
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Parse the main config to extract settings
export function parseConfigSettings(content: string): Record<string, any> {
  try {
    const parsed = yaml.load(content) as any;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

// Build config content from settings object. If originalContent is given,
// any comment/blank lines it contains (espanso's default documentation
// notes, or the user's own) are preserved as a block below the freshly
// serialized settings, instead of being wiped out by the YAML round-trip
// (js-yaml has no concept of comments, so a plain dump() loses them).
export function buildConfigContent(settings: Record<string, any>, originalContent?: string): string {
  const activeYaml = serializeYaml(settings).trimEnd();

  if (!originalContent) {
    return `${activeYaml}\n`;
  }

  const commentLines = originalContent
    .split('\n')
    .filter(line => line.trim() === '' || line.trim().startsWith('#'));

  // Collapse repeated blank lines and trim leading/trailing ones so we don't
  // accumulate whitespace across repeated saves.
  const notes: string[] = [];
  for (const line of commentLines) {
    if (line.trim() === '' && notes[notes.length - 1] === '') continue;
    notes.push(line);
  }
  while (notes.length > 0 && notes[0].trim() === '') notes.shift();
  while (notes.length > 0 && notes[notes.length - 1].trim() === '') notes.pop();

  if (notes.length === 0) {
    return `${activeYaml}\n`;
  }

  return `${activeYaml}\n\n${notes.join('\n')}\n`;
}

// Prefix characters people type before a trigger so it doesn't fire mid-word
// (e.g. ':' in ':hello'). Same set used when detecting / rewriting the
// global trigger symbol. Unrelated to espanso's `search_trigger` config
// option, which only controls the character that opens the search bar.
export const TRIGGER_PREFIX_RE = /^[:;\/!?.,]+/;

export function isBareWordTrigger(trigger: string): boolean {
  const t = trigger.trim();
  return t.length > 0 && !TRIGGER_PREFIX_RE.test(t);
}

export function detectTriggerSymbol(matches: EspansoMatch[]): string {
  const counts: Record<string, number> = {};
  for (const match of matches) {
    for (const trigger of getMatchTriggers(match)) {
      const symbolMatch = trigger.match(TRIGGER_PREFIX_RE);
      if (symbolMatch) {
        counts[symbolMatch[0]] = (counts[symbolMatch[0]] || 0) + 1;
      }
    }
  }
  const entries = Object.entries(counts)
  if (entries.length === 0) return ':';
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

// Apply a new global trigger symbol to all matches
export function applyTriggerSymbolToAll(matches: EspansoMatch[], newSymbol: string): EspansoMatch[] {
  return matches.map(match => {
    const triggers = getMatchTriggers(match);
    if (triggers.length === 0) return match;
    
    const newTriggers = triggers.map(t => {
      // Remove existing trigger symbols (common ones: : ; / ! ? . ,)
      const cleaned = t.replace(TRIGGER_PREFIX_RE, '');
      return `${newSymbol}${cleaned}`;
    });
    
    const newMatch = { ...match };
    if (match.triggers) {
      newMatch.triggers = newTriggers;
    } else if (match.trigger) {
      newMatch.trigger = newTriggers[0];
    }
    return newMatch;
  });
}

// Apply a new global trigger symbol to new matches only (just store the preference)
export function getDefaultTrigger(symbol: string, trigger: string): string {
  const cleaned = trigger.replace(TRIGGER_PREFIX_RE, '');
  return `${symbol}${cleaned}`;
}