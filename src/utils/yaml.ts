import yaml from 'js-yaml';
import { EspansoMatch, MatchFile } from '../types';

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

// Extract matches from a match file content
export function extractMatches(content: string): EspansoMatch[] {
  try {
    const parsed = yaml.load(content) as any;
    if (parsed && Array.isArray(parsed.matches)) {
      return parsed.matches;
    }
    return [];
  } catch {
    return [];
  }
}

// Build match file content from matches
export function buildMatchFileContent(matches: EspansoMatch[], headerComment?: string): string {
  const doc: any = { matches };
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
  if (match.form) return `[Form: ${match.form}]`;
  return '';
}

// Detect if a match uses dynamic features
export function getMatchType(match: EspansoMatch): 'static' | 'form' | 'dynamic' | 'regex' {
  if (match.form) return 'form';
  if (match.regex) return 'regex';
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

// Detect the symbol most commonly used to prefix existing match triggers
// (e.g. ':' in ':hello'). This is a convention observed in the user's own
// snippets - unrelated to espanso's `search_trigger` config option, which
// only controls the character that opens the search bar.
export function detectTriggerSymbol(matches: EspansoMatch[]): string {
  const counts: Record<string, number> = {};
  for (const match of matches) {
    for (const trigger of getMatchTriggers(match)) {
      const symbolMatch = trigger.match(/^[:;\/!?.,]+/);
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
      const cleaned = t.replace(/^[:;\/!?.,]+/, '');
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
  const cleaned = trigger.replace(/^[:;\/!?.,]+/, '');
  return `${symbol}${cleaned}`;
}