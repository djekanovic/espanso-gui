import { useEffect, useState } from 'react'
import { IoAddOutline, IoTrashOutline, IoChevronDown, IoChevronForward, IoFlashOutline, IoListOutline } from 'react-icons/io5'
import { FormField, VarDefinition } from '../types'

// A name input whose typed value lives in local state, only committing
// (calling onCommit) on blur/Enter - NOT on every keystroke.
//
// Why: every list here is keyed by name (`key={name}`, since that IS the
// data's real identity - both in the React tree and in the eventual YAML).
// A naive `value={name} onChange={e => rename(name, e.target.value)}`
// changes that key on every keystroke, so React unmounts the old input and
// mounts a brand new DOM node each time - which necessarily has no focus,
// so the field appears to kick you out after one letter. Deferring the
// actual rename to blur means the key (and the DOM node) stays put while
// typing; it only changes once, after you're done and have moved on anyway.
function RenameInput({
  value,
  onCommit,
  className,
  style,
  placeholder
}: {
  value: string
  onCommit: (newValue: string) => boolean | void
  className?: string
  style?: React.CSSProperties
  placeholder?: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  return (
    <input
      className={className}
      style={style}
      placeholder={placeholder}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === value) return
        const ok = onCommit(draft)
        if (ok === false) setDraft(value) // collision or other rejection - revert
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') { setDraft(value); (e.target as HTMLInputElement).blur() }
      }}
    />
  )
}

// --- espanso terminology, kept straight on purpose (this trips people up) ---
// An "Extension" is a capability - date, shell, echo, random, choice,
// clipboard, script, or form (espanso.org/docs/matches/extensions). A
// "Variable" is technically the surrounding declaration (name + type +
// params) that a Extension's output gets attached to
// (espanso.org/docs/matches/variables: "Variables ... can be used to insert
// the output of an Extension inside a match") - but in practice what a user
// is doing, every time, is picking an Extension and naming it. So the UI
// leads with "Extension" throughout; "variable"/"vars"/"global_vars" only
// show up in code/comments where they describe espanso's actual YAML keys.
// Forms get their own tab below even though a form is itself just another
// extension (the Form extension) - it gets split out because it carries a
// lot more to configure (a whole template + a field list) than, say, a
// one-line date format.

// espanso's real extension list (espanso.org/docs/matches/extensions) - no
// "counter" extension exists, that was fabricated in an earlier version of
// this editor. "form" is excluded here since it gets its own tab/flow, and
// "random" is folded into "choice" below (a toggle, not a separate entry)
// since from a user's perspective it's the same idea - pick from a list -
// just automatic instead of via a dialog.
export const VAR_TYPES = ['date', 'shell', 'echo', 'choice', 'clipboard', 'script']
// espanso's form fields only come in 3 kinds - see the FormField comment in types.ts
export const FORM_FIELD_TYPES = ['text', 'choice', 'list']

interface Props {
  vars: Record<string, VarDefinition>
  onChange: (next: Record<string, VarDefinition>) => void
  // Names already taken elsewhere - blocked from being (re)used here so the
  // same name never means two different things in the same file.
  reservedNames?: string[]
  showToast?: (type: 'success' | 'error' | 'info', message: string) => void
  // Locks the Extensions/Forms sub-tab to one side and hides the switcher -
  // used when this instance is embedded in a page that already has its own
  // "Extensions" / "Forms" tab one level up (Snippets), so there's no need
  // for a second switcher inside.
  forcedSubTab?: 'extensions' | 'forms'
}

// A form's dialog prompt text isn't a real espanso field property - it's
// just whatever literal text surrounds [[name]] in the layout string
// (espanso.org/docs/matches/forms has no per-field "label" key at all).
// Building the layout ourselves from an ordered field list + Label means the
// user never has to hand-write [[placeholder]] syntax: one line per field,
// "{label}: [[{name}]]" (or bare "[[{name}]]" with no label).
function buildLayoutFromFields(fields: Record<string, FormField>): string {
  return Object.entries(fields)
    .map(([fieldName, field]) => {
      const label = field.label?.trim()
      return label ? `${label}: [[${fieldName}]]` : `[[${fieldName}]]`
    })
    .join('\n')
}

// Best-effort recovery of each field's Label from an existing layout string
// - needed the first time a form built some other way (hand-written, or a
// migrated legacy match.form) is opened here, since it won't have Labels
// recorded anywhere yet. Lines shaped like "Label: [[name]]" recover a
// clean label; anything messier (multiple placeholders on one line, no
// surrounding text) just gets an empty label - never loses the field itself.
function parseFieldsFromLayout(layout: string): Record<string, { label: string }> {
  const result: Record<string, { label: string }> = {}
  for (const line of layout.split('\n')) {
    const clean = line.match(/^\s*(.*?)\s*:?\s*\[\[([a-zA-Z0-9_]+)\]\]\s*$/)
    if (clean) {
      result[clean[2]] = { label: clean[1].trim() }
      continue
    }
    for (const m of line.matchAll(/\[\[([a-zA-Z0-9_]+)\]\]/g)) {
      if (!(m[1] in result)) result[m[1]] = { label: '' }
    }
  }
  return result
}

// The field list for one form variable. Order matters here (it drives the
// generated layout's line order) - relies on normal JS string-key insertion
// order, same assumption already made for vars/global_vars display order.
function FormFieldsEditor({
  fields,
  onChange
}: {
  fields: Record<string, FormField>
  onChange: (next: Record<string, FormField>) => void
}) {
  const addField = () => {
    const name = `field${Object.keys(fields).length + 1}`
    onChange({ ...fields, [name]: { type: 'text', label: '' } })
  }
  const removeField = (name: string) => {
    const next = { ...fields }
    delete next[name]
    onChange(next)
  }
  const renameField = (oldName: string, newName: string) => {
    const next: Record<string, FormField> = {}
    Object.entries(fields).forEach(([key, value]) => {
      next[key === oldName ? newName : key] = value
    })
    onChange(next)
  }
  const patchField = (name: string, updates: Partial<FormField>) => {
    onChange({ ...fields, [name]: { ...fields[name], ...updates } })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-secondary">Fields</div>
        <button className="btn btn-sm" onClick={addField}>
          <IoAddOutline size={12} /> Add Field
        </button>
      </div>
      {Object.keys(fields).length === 0 ? (
        <div className="text-xs text-muted">
          Add a field to get started - each one shows up in the dialog in order, using its Label
          as the prompt text.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {Object.entries(fields).map(([name, field]) => (
            <div key={name} className="card" style={{ padding: 12 }}>
              {/* Delete sits on its own row at the top of the card, out of
                  the way of the field settings below. */}
              <div className="flex justify-end mb-2">
                <button
                  className="btn btn-icon btn-sm"
                  onClick={() => removeField(name)}
                  title="Delete field"
                >
                  <IoTrashOutline size={14} color="var(--danger)" />
                </button>
              </div>
              <div className="form-group-tight">
                <label className="form-label">Field Type</label>
                <select
                  className="form-select"
                  value={field.type || 'text'}
                  onChange={e => patchField(name, { type: e.target.value as FormField['type'] })}
                >
                  {FORM_FIELD_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="form-group-tight">
                <label className="form-label">Field Label</label>
                <input
                  className="form-input"
                  placeholder="Prompt shown in the form dialog"
                  value={field.label || ''}
                  onChange={e => patchField(name, { label: e.target.value })}
                />
              </div>
              <div className="form-group-tight">
                <label className="form-label">Var Name</label>
                <RenameInput
                  className="form-input font-mono"
                  value={name}
                  onCommit={newName => { renameField(name, newName); return true }}
                />
              </div>
              <div className="form-group-tight" style={{ marginBottom: 0 }}>
                <label className="form-label">Default Value</label>
                <input
                  className="form-input"
                  value={field.default || ''}
                  onChange={e => patchField(name, { default: e.target.value })}
                />
              </div>
              {(field.type === 'choice' || field.type === 'list') && (
                <div className="form-group-tight" style={{ marginTop: 10, marginBottom: 0 }}>
                  <label className="form-label">Values (one per line)</label>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    placeholder={'Apples\nBananas\nCherries'}
                    value={field.values?.join('\n') || ''}
                    // Don't trim/filter per keystroke - splitting off a
                    // trailing empty line on every change means the moment
                    // you press Enter, the blank line you just made gets
                    // stripped before you can type into it, snapping the
                    // textarea back to a single line. Clean up on blur
                    // instead, once you're actually done editing.
                    onChange={e => patchField(name, { values: e.target.value.split('\n') })}
                    onBlur={e => patchField(name, { values: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
                  />
                </div>
              )}
              {(!field.type || field.type === 'text') && (
                <div
                  className="flex items-center gap-1 mt-2"
                  title="Allow multiple lines in this field's answer"
                >
                  <span className="text-xs text-muted">Multiline</span>
                  <label className="toggle toggle-sm" style={{ cursor: 'pointer', marginBottom: 0 }}>
                    <input
                      type="checkbox"
                      checked={field.multiline || false}
                      onChange={e => patchField(name, { multiline: e.target.checked })}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function renderVarParams(name: string, varDef: VarDefinition, updateVar: (name: string, updates: Partial<VarDefinition>) => void) {
  switch (varDef.type) {
    case 'date':
      return (
        <div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Format</label>
            <input
              className="form-input"
              placeholder="%Y-%m-%d"
              value={varDef.params?.format || ''}
              onChange={e => updateVar(name, { params: { ...varDef.params, format: e.target.value } })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Offset (seconds)</label>
            <input
              className="form-input"
              type="number"
              placeholder="86400"
              value={varDef.params?.offset ?? ''}
              onChange={e => {
                const v = e.target.value
                updateVar(name, {
                  params: { ...varDef.params, offset: v === '' ? undefined : Number(v) }
                })
              }}
            />
          </div>
        </div>
        <div className="text-xs text-muted" style={{ marginTop: -8 }}>
          Offset is seconds from now. 86400 is tomorrow, -86400 is yesterday.
        </div>
        </div>
      )
    case 'shell':
      return (
        <div>
          <div className="form-group">
            <label className="form-label">Shell Command</label>
            <input
              className="form-input"
              placeholder="echo hello"
              value={varDef.params?.cmd || ''}
              onChange={e => updateVar(name, { params: { ...varDef.params, cmd: e.target.value } })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Shell</label>
            <select
              className="form-select"
              style={{ width: 200 }}
              value={varDef.params?.shell || ''}
              onChange={e => {
                const shell = e.target.value
                const params = { ...varDef.params }
                if (shell) params.shell = shell
                else delete params.shell
                updateVar(name, { params })
              }}
            >
              <option value="">Default for this OS</option>
              <option value="cmd">cmd (Windows)</option>
              <option value="powershell">powershell</option>
              <option value="pwsh">pwsh</option>
              <option value="wsl">wsl</option>
              <option value="bash">bash</option>
              <option value="sh">sh</option>
              <option value="nu">nu</option>
            </select>
          </div>
        </div>
      )
    case 'echo':
      return (
        <div className="form-group">
          <label className="form-label">Echo Text</label>
          <input
            className="form-input"
            placeholder="Hello World"
            value={varDef.params?.echo || ''}
            onChange={e => updateVar(name, { params: { ...varDef.params, echo: e.target.value } })}
          />
        </div>
      )
    case 'choice':
    case 'random': {
      // Two real, separate espanso extensions that share the same idea -
      // pick one value from a list - so the GUI presents them as one
      // control with a mode toggle rather than two separate dropdown
      // entries. Choice espanso key is `values` (opens a picker dialog;
      // also supports the documented "Advanced use with IDs" - a list of
      // {label, id} objects so the shown text can differ from what's
      // inserted). Random espanso key is `choices` (auto-picks, no dialog,
      // and doesn't support the label/id split - it has no dialog to show a
      // label in).
      const isRandom = varDef.type === 'random'
      const rawList: any[] = (isRandom ? varDef.params?.choices : varDef.params?.values) || []
      const isAdvanced = !isRandom && rawList.length > 0 && typeof rawList[0] === 'object'

      const setList = (next: any[]) => {
        updateVar(name, { params: { ...varDef.params, [isRandom ? 'choices' : 'values']: next } })
      }

      const togglePickMode = () => {
        if (isRandom) {
          updateVar(name, { type: 'choice', params: { values: rawList } })
        } else {
          const plain = isAdvanced ? rawList.map(v => v.id ?? v.label ?? '') : rawList
          updateVar(name, { type: 'random', params: { choices: plain } })
        }
      }

      const toggleAdvanced = () => {
        if (isAdvanced) {
          setList(rawList.map(v => v.label ?? v.id ?? ''))
        } else {
          const advanced = rawList.map(v => ({ label: v, id: v }))
          setList(advanced.length ? advanced : [{ label: '', id: '' }])
        }
      }

      return (
        <div className="form-group">
          <div className="flex items-center justify-between mb-2">
            <label className="form-label" style={{ margin: 0 }}>{isRandom ? 'Choices' : 'Values'}</label>
            <div className="flex gap-1">
              {!isRandom && (
                <button type="button" className="btn btn-sm" onClick={toggleAdvanced}>
                  {isAdvanced ? 'Use simple list' : 'Advanced (custom label)'}
                </button>
              )}
              <button
                type="button"
                className="btn btn-sm"
                onClick={togglePickMode}
                title={isRandom
                  ? 'Show a dialog to pick a value, instead of choosing automatically'
                  : 'Pick a value automatically at random, instead of showing a dialog'}
              >
                {isRandom ? 'Show dialog instead' : 'Pick randomly instead'}
              </button>
            </div>
          </div>
          {isAdvanced ? (
            <div className="flex flex-col gap-2">
              {rawList.map((v, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="form-input"
                    placeholder="Label shown in the picker"
                    value={v.label || ''}
                    onChange={e => {
                      const next = [...rawList]
                      next[i] = { ...next[i], label: e.target.value }
                      setList(next)
                    }}
                  />
                  <input
                    className="form-input font-mono"
                    placeholder="Value inserted"
                    value={v.id || ''}
                    onChange={e => {
                      const next = [...rawList]
                      next[i] = { ...next[i], id: e.target.value }
                      setList(next)
                    }}
                  />
                  <button className="btn btn-icon" onClick={() => setList(rawList.filter((_, j) => j !== i))}>
                    <IoTrashOutline size={14} color="var(--danger)" />
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-sm" onClick={() => setList([...rawList, { label: '', id: '' }])}>
                <IoAddOutline size={12} /> Add Value
              </button>
            </div>
          ) : (
            <textarea
              className="form-textarea"
              rows={3}
              placeholder={isRandom ? 'option1\noption2\noption3' : 'value1\nvalue2\nvalue3'}
              value={rawList.join('\n')}
              // Same fix as the form-field Values textarea: don't trim/filter
              // per keystroke, or the trailing blank line Enter just created
              // gets stripped before you can type into it.
              onChange={e => setList(e.target.value.split('\n'))}
              onBlur={e => setList(e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
            />
          )}
          <div className="text-xs text-muted mt-2">
            {isRandom
              ? 'Picks one at random every time the trigger expands - no dialog shown.'
              : isAdvanced
                ? 'Opens a dialog showing each Label; selecting one inserts its Value instead.'
                : 'Opens a dialog letting you pick which value to insert.'}
          </div>
        </div>
      )
    }
    case 'clipboard':
      // Takes no parameters at all - just inserts current clipboard content.
      return (
        <div className="text-xs text-muted">No configuration needed - inserts the current clipboard content.</div>
      )
    case 'script':
      // espanso key is `args`: an argv array, e.g. [python, /path/to/script.py]
      return (
        <div className="form-group">
          <label className="form-label">Command (comma separated argv)</label>
          <input
            className="form-input font-mono"
            placeholder="python, /path/to/script.py"
            value={varDef.params?.args?.join(', ') || ''}
            onChange={e => updateVar(name, { params: { ...varDef.params, args: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
          />
          <div className="text-xs text-muted mt-2">
            First item is the interpreter/executable, the rest are its arguments - same as an argv array.
          </div>
        </div>
      )
    default:
      return (
        <div className="text-xs text-muted">Unrecognized extension - check the raw YAML.</div>
      )
  }
}

export default function VarEditor({ vars, onChange, reservedNames = [], showToast, forcedSubTab }: Props) {
  const [ownSubTab, setOwnSubTab] = useState<'extensions' | 'forms'>('extensions')
  const subTab = forcedSubTab ?? ownSubTab
  const setSubTab = setOwnSubTab
  const [expandedForms, setExpandedForms] = useState<Set<string>>(new Set())

  const isReserved = (name: string) => reservedNames.includes(name)
  const allNames = () => new Set([...Object.keys(vars), ...reservedNames])

  // base is a prefix without a number (e.g. "var", "form") - tries
  // "{base}1", "{base}2", ... until one's free.
  const uniqueName = (base: string) => {
    const taken = allNames()
    let n = 1
    let name = `${base}${n}`
    while (taken.has(name)) {
      n += 1
      name = `${base}${n}`
    }
    return name
  }

  const removeVar = (name: string) => {
    const next = { ...vars }
    delete next[name]
    onChange(next)
    setExpandedForms(prev => {
      const next2 = new Set(prev)
      next2.delete(name)
      return next2
    })
  }

  const updateVarName = (oldName: string, newName: string): boolean => {
    if (!newName.trim()) {
      showToast?.('error', 'Name can\'t be empty.')
      return false
    }
    if (newName !== oldName && (newName in vars || isReserved(newName))) {
      showToast?.('error', `An extension named "${newName}" already exists in this file - pick a different name.`)
      return false
    }
    const next: Record<string, VarDefinition> = {}
    Object.entries(vars).forEach(([key, value]) => {
      next[key === oldName ? newName : key] = value
    })
    onChange(next)
    if (expandedForms.has(oldName)) {
      setExpandedForms(prev => {
        const next2 = new Set(prev)
        next2.delete(oldName)
        next2.add(newName)
        return next2
      })
    }
    return true
  }

  const updateVar = (name: string, updates: Partial<VarDefinition>) => {
    onChange({ ...vars, [name]: { ...vars[name], ...updates } })
  }

  const addExtension = () => {
    const name = uniqueName('var')
    onChange({ ...vars, [name]: { type: 'echo', params: { echo: '' } } })
  }

  const addForm = () => {
    const name = uniqueName('form')
    onChange({ ...vars, [name]: { type: 'form', params: {} } })
    setExpandedForms(prev => new Set(prev).add(name))
  }

  const toggleFormExpanded = (name: string) => {
    const willOpen = !expandedForms.has(name)
    setExpandedForms(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
    // First time a form with an existing layout but no recorded field list
    // gets opened here (a hand-written form, or a migrated legacy
    // match.form) - recover Labels from the layout's own text so the field
    // list isn't empty, then let it drive the layout from here on.
    if (willOpen) {
      const def = vars[name]
      const hasFields = def?.params?.fields && Object.keys(def.params.fields).length > 0
      const layout: string = def?.params?.layout || ''
      if (!hasFields && layout.trim()) {
        const recovered = parseFieldsFromLayout(layout)
        if (Object.keys(recovered).length > 0) {
          updateVar(name, { params: { ...def.params, fields: recovered, layout: buildLayoutFromFields(recovered) } })
        }
      }
    }
  }

  // Object key order is insertion order (oldest first) - reversed here so
  // the most recently added extension/form shows at the top of its list,
  // right where you're looking after just adding one. Display-only; the
  // underlying record (and what gets written to YAML) keeps insertion
  // order untouched.
  const extensionEntries = Object.entries(vars).filter(([, def]) => def.type !== 'form').reverse()
  const formEntries = Object.entries(vars).filter(([, def]) => def.type === 'form').reverse()

  return (
    <div>
      {!forcedSubTab && (
        <div className="tabs" style={{ marginBottom: 16 }}>
          <button className={`tab ${subTab === 'extensions' ? 'active' : ''}`} onClick={() => setSubTab('extensions')}>
            Extensions{extensionEntries.length > 0 && ` (${extensionEntries.length})`}
          </button>
          <button className={`tab ${subTab === 'forms' ? 'active' : ''}`} onClick={() => setSubTab('forms')}>
            Forms{formEntries.length > 0 && ` (${formEntries.length})`}
          </button>
        </div>
      )}

      {subTab === 'extensions' && (
        <div>
          {extensionEntries.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <IoFlashOutline size={22} />
              </div>
              <div className="empty-state-title">No extensions yet</div>
              <div className="empty-state-desc">
                Extensions add dynamic content - a date, shell output, a random pick - reusable
                as {'{{name}}'} in any snippet's Replacement Text.
              </div>
              <button className="btn btn-lg btn-primary" onClick={addExtension}>
                <IoAddOutline size={16} /> Add Extension
              </button>
            </div>
          ) : (
            <>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-secondary">
                {extensionEntries.length} extension{extensionEntries.length === 1 ? '' : 's'}
              </div>
              <button className="btn btn-sm" onClick={addExtension}>
                <IoAddOutline size={12} /> Add Extension
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {extensionEntries.map(([name, varDef]) => (
                <div key={name} className="card" style={{ padding: 16 }}>
                  <div className="flex items-center gap-2 mb-3">
                    <RenameInput
                      className="form-input font-mono"
                      style={{ flex: 1, minWidth: 120 }}
                      value={name}
                      onCommit={newName => updateVarName(name, newName)}
                    />
                    <select
                      className="form-select"
                      style={{ width: 150, flexShrink: 0 }}
                      value={varDef.type}
                      onChange={e => updateVar(name, { type: e.target.value as VarDefinition['type'], params: {} })}
                    >
                      {/* "random" isn't offered as a fresh pick (it's a toggle inside "choice"
                          instead), but if this var is already random - e.g. toggled there, or
                          loaded from a file that has one - it still needs a matching <option> or
                          the browser silently displays the first VAR_TYPES entry instead, lying
                          about the actual type. */}
                      {(VAR_TYPES.includes(varDef.type) ? VAR_TYPES : [varDef.type, ...VAR_TYPES]).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <button className="btn btn-icon" style={{ flexShrink: 0 }} onClick={() => removeVar(name)}>
                      <IoTrashOutline size={14} color="var(--danger)" />
                    </button>
                  </div>
                  {renderVarParams(name, varDef, updateVar)}
                </div>
              ))}
            </div>
            </>
          )}
        </div>
      )}

      {subTab === 'forms' && (
        <div>
          {formEntries.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <IoListOutline size={22} />
              </div>
              <div className="empty-state-title">No forms yet</div>
              <div className="empty-state-desc">
                A form shows a fill-in dialog before a snippet expands, then inserts each
                answered field as {'{{form.field}}'}.
              </div>
              <button className="btn btn-lg btn-primary" onClick={addForm}>
                <IoAddOutline size={16} /> Add Form
              </button>
            </div>
          ) : (
            <>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-secondary">
                {formEntries.length} form{formEntries.length === 1 ? '' : 's'}
              </div>
              <button className="btn btn-sm" onClick={addForm}>
                <IoAddOutline size={12} /> Add Form
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {formEntries.map(([name, varDef]) => {
                const isOpen = expandedForms.has(name)
                const fieldCount = Object.keys(varDef.params?.fields || {}).length
                return (
                  <div key={name} className="card" style={{ padding: 16 }}>
                    <div
                      className="flex items-center justify-between"
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleFormExpanded(name)}
                    >
                      <div className="flex items-center gap-2">
                        {isOpen ? <IoChevronDown size={16} /> : <IoChevronForward size={16} />}
                        <span className="font-mono" style={{ color: 'var(--accent)' }}>{name || '(unnamed)'}</span>
                        <span className="text-xs text-muted">
                          {fieldCount} field{fieldCount === 1 ? '' : 's'}
                        </span>
                      </div>
                      <button
                        className="btn btn-icon btn-sm"
                        onClick={e => { e.stopPropagation(); removeVar(name) }}
                      >
                        <IoTrashOutline size={14} color="var(--danger)" />
                      </button>
                    </div>
                    {isOpen && (
                      <div className="mt-4">
                        <div className="form-group">
                          <label className="form-label">Name</label>
                          <RenameInput
                            className="form-input font-mono"
                            value={name}
                            onCommit={newName => updateVarName(name, newName)}
                          />
                        </div>
                        <FormFieldsEditor
                          fields={varDef.params?.fields || {}}
                          onChange={next => updateVar(name, { params: { ...varDef.params, fields: next, layout: buildLayoutFromFields(next) } })}
                        />
                        <div className="text-xs text-muted mt-3">
                          Reference a submitted field elsewhere with {'{{' + name + '.field_name}}'}.
                        </div>
                        {varDef.params?.layout && (
                          <div className="form-group mt-3">
                            <label className="form-label">Preview</label>
                            <pre
                              className="font-mono text-xs"
                              style={{
                                margin: 0,
                                padding: '10px 12px',
                                border: '1px solid var(--border-light)',
                                borderRadius: 6,
                                color: 'var(--text-secondary)',
                                whiteSpace: 'pre-wrap'
                              }}
                            >
                              {varDef.params.layout}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
