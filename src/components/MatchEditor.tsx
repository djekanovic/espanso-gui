import { useMemo, useRef, useState } from 'react'
import {
  IoCloseOutline,
  IoAddOutline,
  IoTrashOutline,
  IoTextOutline,
  IoFlashOutline,
  IoOptionsOutline,
  IoReturnDownBackOutline,
  IoRemoveOutline,
  IoInformationCircleOutline
} from 'react-icons/io5'
import { EspansoMatch, VarDefinition } from '../types'
import { NewlineMode, getDefaultNewlineMode, foldNewlines } from '../utils/prefs'
import { isBareWordTrigger } from '../utils/yaml'

interface Props {
  match: EspansoMatch
  isNew: boolean
  // This file's global_vars - the ONE place any var/form this app creates
  // lives (see migrateToGlobalPool below for why). Managed from the
  // Extensions/Forms tabs under Snippets, not here - this editor only reads
  // them to offer as {{name}} / {{name.field}} chips to insert.
  globalVars: Record<string, VarDefinition>
  onSave: (match: EspansoMatch, updatedGlobalVars: Record<string, VarDefinition>) => void
  onCancel: () => void
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
}

type Tab = 'snippet' | 'extensions' | 'advanced'

// Migrate a legacy match.form/form_fields (the old shorthand-form tab, since
// removed - a snippet's output now always comes from Replacement Text) into
// the equivalent verbose form: a `type: form` variable + {{var.field}} refs
// in place of each [[field]] - the exact equivalence espanso's own docs
// describe (espanso.org/docs/matches/forms - "Using Forms with Script and
// Shell extensions"). Also folds in any legacy per-match `vars:` (this app's
// old local-vars mechanism, or a hand-written file) into the shared pool,
// renaming on collision and rewriting {{oldname...}} refs in `replace` to
// match. Runs once at mount; a no-op for a normal match that already only
// uses global_vars.
//
// Why fold locals into global at all: real espanso evaluates a match's own
// `vars:` unconditionally, just by being declared - referenced in `replace`
// or not. `global_vars:` are evaluated lazily, only when actually
// referenced. A local var nobody reformed to reference (e.g. left over after
// switching to a differently-named global one) still silently fires -
// for a form, that's an extra, confusing dialog every trigger. Keeping
// everything in the one lazy pool makes that bug structurally impossible
// instead of something to warn about after the fact.
function migrateToGlobalPool(match: EspansoMatch, globalVars: Record<string, VarDefinition>) {
  const legacyVars = { ...(match.vars || {}) }
  let replace = match.replace || match.replace_with || ''
  if (match.form) {
    const taken = new Set([...Object.keys(legacyVars), ...Object.keys(globalVars)])
    let varName = 'form'
    let n = 1
    while (taken.has(varName)) {
      n += 1
      varName = `form${n}`
    }
    replace = replace || match.form.replace(/\[\[([a-zA-Z0-9_]+)\]\]/g, (_m, field) => `{{${varName}.${field}}}`)
    legacyVars[varName] = { type: 'form', params: { layout: match.form, fields: match.form_fields } }
  }

  const merged = { ...globalVars }
  for (const [name, def] of Object.entries(legacyVars)) {
    let finalName = name
    if (finalName in merged) {
      let n = 1
      while (`${name}${n}` in merged) n += 1
      finalName = `${name}${n}`
      replace = replace.replace(
        new RegExp(`\\{\\{\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\.|\\s|\\})`, 'g'),
        (_m, tail) => `{{${finalName}${tail}`
      )
    }
    merged[finalName] = def
  }
  return { vars: merged, replace }
}

export default function MatchEditor({ match, isNew, globalVars, onSave, onCancel, showToast }: Props) {
  const [tab, setTab] = useState<Tab>('snippet')
  const [triggers, setTriggers] = useState<string[]>(
    match.triggers || (match.trigger ? [match.trigger] : [''])
  )

  // Legacy match.form and/or match.vars -> folded into the one global pool,
  // computed once at mount (see migrateToGlobalPool's comment for why).
  // Nothing in this editor edits `allVars` after that - managing extensions
  // and forms happens on the dedicated Extensions/Forms tabs under Snippets
  // now, not per-snippet - so this is just what gets handed back on Save.
  const [migrated] = useState(() => migrateToGlobalPool(match, globalVars))
  const [replace, setReplace] = useState(migrated.replace)
  const allVars = migrated.vars

  // Infer 'preserve' for an existing snippet that already has real line
  // breaks; otherwise fall back to the user's configured default.
  const [newlineMode, setNewlineMode] = useState<NewlineMode>(
    /\r|\n/.test(migrated.replace) ? 'preserve' : getDefaultNewlineMode()
  )
  const [label, setLabel] = useState(match.label || '')
  const [propagateCase, setPropagateCase] = useState(match.propagate_case || false)
  const [word, setWord] = useState(match.word || false)
  const [regex, setRegex] = useState(match.regex || '')
  const [useRegex, setUseRegex] = useState(!!match.regex)
  const replaceRef = useRef<HTMLTextAreaElement>(null)

  // Every {{...}} reference Replacement Text could use: plain vars insert as
  // {{name}}; a `type: form` var's fields insert as {{varname.field}} - field
  // names come from its explicit params.fields, plus any [[placeholder]]
  // found in its layout (fields are inferred from the layout by default, so
  // most form vars won't have explicit params.fields at all). Split by type
  // for the Extensions tab's categorized browse list below.
  const { extensionRefs, formRefs } = useMemo(() => {
    const extensionRefs: { label: string; value: string }[] = []
    const formRefs: { form: string; fields: { label: string; value: string }[] }[] = []
    Object.entries(allVars).forEach(([vname, vdef]) => {
      if (vdef.type === 'form') {
        const fieldNames = new Set<string>(Object.keys(vdef.params?.fields || {}))
        const layout: string = vdef.params?.layout || ''
        for (const m of layout.matchAll(/\[\[([a-zA-Z0-9_]+)\]\]/g)) fieldNames.add(m[1])
        formRefs.push({
          form: vname,
          fields: [...fieldNames].map(fname => ({ label: `${vname}.${fname}`, value: `{{${vname}.${fname}}}` }))
        })
      } else {
        extensionRefs.push({ label: vname, value: `{{${vname}}}` })
      }
    })
    return { extensionRefs, formRefs }
  }, [allVars])
  const insertableRefs = useMemo(
    () => [...extensionRefs, ...formRefs.flatMap(f => f.fields)],
    [extensionRefs, formRefs]
  )

  const insertAtCursor = (text: string) => {
    const el = replaceRef.current
    if (!el) {
      setReplace(replace + text)
      return
    }
    const start = el.selectionStart ?? replace.length
    const end = el.selectionEnd ?? replace.length
    setReplace(replace.slice(0, start) + text + replace.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + text.length
      el.setSelectionRange(pos, pos)
    })
  }

  const addTrigger = () => {
    setTriggers([...triggers, ''])
  }

  const removeTrigger = (index: number) => {
    setTriggers(triggers.filter((_, i) => i !== index))
  }

  const updateTrigger = (index: number, value: string) => {
    setTriggers(triggers.map((t, i) => i === index ? value : t))
  }

  const handleSave = () => {
    const cleanTriggers = triggers.map(t => t.trim()).filter(t => t.length > 0)

    if (!useRegex && cleanTriggers.length === 0) {
      showToast('error', 'At least one trigger is required')
      return
    }

    const newMatch: EspansoMatch = { ...match }

    // Clean up old fields
    delete newMatch.trigger
    delete newMatch.triggers
    delete newMatch.replace
    delete newMatch.replace_with
    delete newMatch.regex
    delete newMatch.form
    delete newMatch.form_fields
    delete newMatch.vars
    delete newMatch.label
    delete newMatch.propagate_case
    delete newMatch.word

    if (useRegex) {
      newMatch.regex = regex
    } else if (cleanTriggers.length === 1) {
      newMatch.trigger = cleanTriggers[0]
    } else if (cleanTriggers.length > 1) {
      newMatch.triggers = cleanTriggers
    }

    // Forms are no longer a separate output mechanism - a `type: form`
    // variable referenced via {{var.field}} chips is the only path now, so
    // Replacement Text is always the single output field. Vars/forms are
    // never written onto the match itself anymore (see migrateToGlobalPool)
    // - they all live in global_vars, saved via the updatedGlobalVars arg.
    if (replace) newMatch.replace = newlineMode === 'join' ? foldNewlines(replace) : replace
    if (label) newMatch.label = label
    if (propagateCase) newMatch.propagate_case = true
    if (word) newMatch.word = true

    if (!useRegex && !word) {
      const bare = cleanTriggers.filter(isBareWordTrigger)
      if (bare.length > 0) {
        const shown = bare.map(t => `"${t}"`).join(', ')
        showToast(
          'info',
          `${shown} has no prefix like : or /. Turn on Word Boundary (Advanced) so it doesn't expand inside other words.`
        )
      }
    }

    onSave(newMatch, allVars)
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'snippet', label: 'Snippet', icon: <IoTextOutline size={14} /> },
    { id: 'extensions', label: 'Extensions', icon: <IoFlashOutline size={14} /> },
    { id: 'advanced', label: 'Advanced', icon: <IoOptionsOutline size={14} /> }
  ]

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{isNew ? 'New Snippet' : 'Edit Snippet'}</div>
          <button className="btn btn-icon btn-sm" onClick={onCancel}>
            <IoCloseOutline size={16} />
          </button>
        </div>

        <div className="tabs" style={{ padding: '0 20px', marginBottom: 0 }}>
          {tabs.map(t => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {tab === 'snippet' && (
            <div>
              <div className="form-group">
                <label className="form-label">Triggers</label>
                {triggers.map((trigger, i) => (
                  <div key={i} className="form-input-group mb-2">
                    <input
                      className="form-input font-mono"
                      placeholder=":trigger"
                      value={trigger}
                      onChange={e => updateTrigger(i, e.target.value)}
                    />
                    {triggers.length > 1 && (
                      <button className="btn btn-icon btn-sm" onClick={() => removeTrigger(i)}>
                        <IoTrashOutline size={14} color="var(--danger)" />
                      </button>
                    )}
                  </div>
                ))}
                <button className="btn btn-sm" onClick={addTrigger}>
                  <IoAddOutline size={12} /> Add Trigger
                </button>
                {!useRegex && !word && triggers.some(isBareWordTrigger) && (
                  <div className="word-boundary-hint">
                    <IoInformationCircleOutline size={16} />
                    <span>
                      {triggers.filter(isBareWordTrigger).map(t => t.trim()).filter(Boolean)[0] || 'This trigger'} has no prefix like : or /. Enable Word Boundary so it doesn't fire inside other words.
                    </span>
                    <button className="btn btn-sm btn-primary" onClick={() => setWord(true)}>
                      Enable
                    </button>
                  </div>
                )}
              </div>

              <div className="form-group">
                <div className="flex items-center justify-between mb-2">
                  <label className="form-label" style={{ margin: 0 }}>Replacement Text</label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className={`btn btn-sm ${newlineMode === 'preserve' ? 'btn-primary' : ''}`}
                      title="New lines in the text below become real line breaks in the expansion"
                      onClick={() => setNewlineMode('preserve')}
                    >
                      <IoReturnDownBackOutline size={12} /> Keep line breaks
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${newlineMode === 'join' ? 'btn-primary' : ''}`}
                      title="New lines in the text below are joined with a space when saved"
                      onClick={() => setNewlineMode('join')}
                    >
                      <IoRemoveOutline size={12} /> Join as spaces
                    </button>
                  </div>
                </div>
                <textarea
                  ref={replaceRef}
                  className="form-textarea"
                  placeholder="Text to insert when trigger is typed..."
                  value={replace}
                  onChange={e => setReplace(e.target.value)}
                  rows={5}
                />
                <div className="flex items-center gap-2 mt-2" style={{ flexWrap: 'wrap' }}>
                  <span className="text-xs text-muted">Insert:</span>
                  <button
                    type="button"
                    className="btn btn-sm font-mono"
                    style={{ fontSize: 11 }}
                    title="Insert cursor position hint ($|$) at cursor - controls where the cursor ends up after expansion"
                    onClick={() => insertAtCursor('$|$')}
                  >
                    $|$ cursor
                  </button>
                  {insertableRefs.map(r => (
                    <button
                      key={r.value}
                      type="button"
                      className="btn btn-sm font-mono"
                      style={{ fontSize: 11 }}
                      title={`Insert ${r.value} at cursor`}
                      onClick={() => insertAtCursor(r.value)}
                    >
                      {r.value}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-muted mt-2">
                  Use {'{{var_name}}'} for an extension, or {'{{form_name.field}}'} for a form field - both set up on the Extensions tab
                  {newlineMode === 'join' && ' · line breaks above will be saved as spaces'}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Label (optional)</label>
                <input
                  className="form-input"
                  placeholder="Description shown in search"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                />
              </div>
            </div>
          )}

          {tab === 'extensions' && (
            <div>
              <div className="text-xs text-muted mb-3">
                Browse this file's extensions and forms and click one to insert it into
                Replacement Text. To add, edit, or remove one, use the Extensions / Forms tabs
                under Snippets - they're shared by every snippet in this file.
              </div>

              <div className="text-sm text-secondary mb-2">Extensions</div>
              {extensionRefs.length === 0 ? (
                <div className="text-xs text-muted mb-4">None in this file yet.</div>
              ) : (
                <div className="flex flex-col gap-2 mb-4">
                  {extensionRefs.map(r => (
                    <button
                      key={r.value}
                      type="button"
                      className="btn btn-sm font-mono"
                      style={{ justifyContent: 'flex-start' }}
                      onClick={() => { setTab('snippet'); insertAtCursor(r.value) }}
                    >
                      {r.value}
                    </button>
                  ))}
                </div>
              )}

              <div className="text-sm text-secondary mb-2">Forms</div>
              {formRefs.length === 0 ? (
                <div className="text-xs text-muted">None in this file yet.</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {formRefs.map(f => (
                    <div key={f.form} className="card" style={{ padding: 12 }}>
                      <div className="font-mono mb-2" style={{ color: 'var(--accent)' }}>{f.form}</div>
                      <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                        {f.fields.map(field => (
                          <button
                            key={field.value}
                            type="button"
                            className="btn btn-sm font-mono"
                            onClick={() => { setTab('snippet'); insertAtCursor(field.value) }}
                          >
                            {field.value}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'advanced' && (
            <div>
              <div className="form-group">
                <div className="flex items-center gap-2">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={useRegex}
                      onChange={e => setUseRegex(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                  <span className="form-label" style={{ margin: 0 }}>Use Regular Expression</span>
                </div>
              </div>

              {useRegex && (
                <div className="form-group">
                  <label className="form-label">Regex Pattern</label>
                  <input
                    className="form-input font-mono"
                    placeholder="\b(?:foo|bar)\b"
                    value={regex}
                    onChange={e => setRegex(e.target.value)}
                  />
                  <div className="text-xs text-muted mt-2">
                    The regex will be matched against the text. Use capture groups with {'{{0}}'}, {'{{1}}'}, etc.
                  </div>
                </div>
              )}

              <div className="form-group">
                <div className="flex items-center gap-2">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={propagateCase}
                      onChange={e => setPropagateCase(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                  <span className="form-label" style={{ margin: 0 }}>Propagate Case</span>
                </div>
                <div className="text-xs text-muted mt-2">
                  Automatically match the case of the trigger (e.g. :hello → Hello)
                </div>
              </div>

              <div className="form-group">
                <div className="flex items-center gap-2">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={word}
                      onChange={e => setWord(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                  <span className="form-label" style={{ margin: 0 }}>Word Boundary</span>
                </div>
                <div className="text-xs text-muted mt-2">
                  Only trigger when surrounded by word boundaries
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>
            {isNew ? 'Create Snippet' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
