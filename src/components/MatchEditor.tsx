import { useState } from 'react'
import {
  IoCloseOutline,
  IoAddOutline,
  IoTrashOutline,
  IoTextOutline,
  IoFlashOutline,
  IoGridOutline,
  IoOptionsOutline,
  IoReturnDownBackOutline,
  IoRemoveOutline
} from 'react-icons/io5'
import { EspansoMatch, FormField, VarDefinition } from '../types'
import { NewlineMode, getDefaultNewlineMode, foldNewlines } from '../utils/prefs'

interface Props {
  match: EspansoMatch
  isNew: boolean
  onSave: (match: EspansoMatch) => void
  onCancel: () => void
  showToast: (type: 'success' | 'error' | 'info', message: string) => void
}

type Tab = 'basic' | 'dynamic' | 'form' | 'advanced'

const VAR_TYPES = ['date', 'shell', 'echo', 'random', 'choice', 'form', 'clipboard', 'counter', 'script']
const FORM_FIELD_TYPES = ['text', 'password', 'number', 'date', 'time', 'color', 'select', 'textarea', 'toggle', 'radio', 'checkbox']

export default function MatchEditor({ match, isNew, onSave, onCancel, showToast }: Props) {
  const [tab, setTab] = useState<Tab>('basic')
  const [triggers, setTriggers] = useState<string[]>(
    match.triggers || (match.trigger ? [match.trigger] : [''])
  )
  const [replace, setReplace] = useState(match.replace || match.replace_with || '')
  // Infer 'preserve' for an existing snippet that already has real line
  // breaks; otherwise fall back to the user's configured default.
  const [newlineMode, setNewlineMode] = useState<NewlineMode>(
    /\r|\n/.test(match.replace || match.replace_with || '') ? 'preserve' : getDefaultNewlineMode()
  )
  const [label, setLabel] = useState(match.label || '')
  const [propagateCase, setPropagateCase] = useState(match.propagate_case || false)
  const [word, setWord] = useState(match.word || false)
  const [regex, setRegex] = useState(match.regex || '')
  const [useRegex, setUseRegex] = useState(!!match.regex)
  const [formName, setFormName] = useState(match.form || '')
  const [formFields, setFormFields] = useState<Record<string, FormField>>(match.form_fields || {})
  const [vars, setVars] = useState<Record<string, VarDefinition>>(match.vars || {})

  const addTrigger = () => {
    setTriggers([...triggers, ''])
  }

  const removeTrigger = (index: number) => {
    setTriggers(triggers.filter((_, i) => i !== index))
  }

  const updateTrigger = (index: number, value: string) => {
    setTriggers(triggers.map((t, i) => i === index ? value : t))
  }

  const addVar = () => {
    const name = `var${Object.keys(vars).length + 1}`
    setVars({ ...vars, [name]: { type: 'echo', params: { echo: '' } } })
  }

  const removeVar = (name: string) => {
    const next = { ...vars }
    delete next[name]
    setVars(next)
  }

  const updateVarName = (oldName: string, newName: string) => {
    const next: Record<string, VarDefinition> = {}
    Object.entries(vars).forEach(([key, value]) => {
      next[key === oldName ? newName : key] = value
    })
    setVars(next)
  }

  const updateVar = (name: string, updates: Partial<VarDefinition>) => {
    setVars({ ...vars, [name]: { ...vars[name], ...updates } })
  }

  const addFormField = () => {
    const name = `field${Object.keys(formFields).length + 1}`
    setFormFields({ ...formFields, [name]: { type: 'text', label: name } })
  }

  const removeFormField = (name: string) => {
    const next = { ...formFields }
    delete next[name]
    setFormFields(next)
  }

  const updateFormFieldName = (oldName: string, newName: string) => {
    const next: Record<string, FormField> = {}
    Object.entries(formFields).forEach(([key, value]) => {
      next[key === oldName ? newName : key] = value
    })
    setFormFields(next)
  }

  const updateFormField = (name: string, updates: Partial<FormField>) => {
    setFormFields({ ...formFields, [name]: { ...formFields[name], ...updates } })
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

    if (replace) newMatch.replace = newlineMode === 'join' ? foldNewlines(replace) : replace
    if (label) newMatch.label = label
    if (propagateCase) newMatch.propagate_case = true
    if (word) newMatch.word = true

    if (formName) {
      newMatch.form = formName
      if (Object.keys(formFields).length > 0) {
        newMatch.form_fields = formFields
      }
    }

    if (Object.keys(vars).length > 0) {
      newMatch.vars = vars
    }

    onSave(newMatch)
  }

  const renderVarParams = (name: string, varDef: VarDefinition) => {
    switch (varDef.type) {
      case 'date':
        return (
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
              <label className="form-label">Offset</label>
              <input
                className="form-input"
                placeholder="0d"
                value={varDef.params?.offset || ''}
                onChange={e => updateVar(name, { params: { ...varDef.params, offset: e.target.value } })}
              />
            </div>
          </div>
        )
      case 'shell':
        return (
          <div className="form-group">
            <label className="form-label">Shell Command</label>
            <input
              className="form-input"
              placeholder="echo hello"
              value={varDef.params?.cmd || ''}
              onChange={e => updateVar(name, { params: { ...varDef.params, cmd: e.target.value } })}
            />
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
      case 'random':
        return (
          <div className="form-group">
            <label className="form-label">Random Options (comma separated)</label>
            <input
              className="form-input"
              placeholder="option1, option2, option3"
              value={varDef.params?.options?.join(', ') || ''}
              onChange={e => updateVar(name, { params: { ...varDef.params, options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
            />
          </div>
        )
      case 'choice':
        return (
          <div className="form-group">
            <label className="form-label">Choices (comma separated)</label>
            <input
              className="form-input"
              placeholder="choice1, choice2, choice3"
              value={varDef.params?.choices?.join(', ') || ''}
              onChange={e => updateVar(name, { params: { ...varDef.params, choices: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
            />
          </div>
        )
      case 'form':
        return (
          <div className="form-group">
            <label className="form-label">Form Field Name</label>
            <input
              className="form-input"
              placeholder="field_name"
              value={varDef.params?.fields || ''}
              onChange={e => updateVar(name, { params: { ...varDef.params, fields: e.target.value } })}
            />
          </div>
        )
      case 'clipboard':
        return (
          <div className="form-group">
            <label className="form-label">Clipboard Variable</label>
            <input
              className="form-input"
              placeholder="clipboard_var"
              value={varDef.params?.name || ''}
              onChange={e => updateVar(name, { params: { ...varDef.params, name: e.target.value } })}
            />
          </div>
        )
      case 'counter':
        return (
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Start</label>
              <input
                className="form-input"
                type="number"
                value={varDef.params?.start || 0}
                onChange={e => updateVar(name, { params: { ...varDef.params, start: parseInt(e.target.value) || 0 } })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Step</label>
              <input
                className="form-input"
                type="number"
                value={varDef.params?.step || 1}
                onChange={e => updateVar(name, { params: { ...varDef.params, step: parseInt(e.target.value) || 1 } })}
              />
            </div>
          </div>
        )
      case 'script':
        return (
          <div className="form-group">
            <label className="form-label">Script Path</label>
            <input
              className="form-input"
              placeholder="path/to/script.py"
              value={varDef.params?.path || ''}
              onChange={e => updateVar(name, { params: { ...varDef.params, path: e.target.value } })}
            />
          </div>
        )
      default:
        return null
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'basic', label: 'Basic', icon: <IoTextOutline size={14} /> },
    { id: 'dynamic', label: 'Dynamic', icon: <IoFlashOutline size={14} /> },
    { id: 'form', label: 'Form', icon: <IoGridOutline size={14} /> },
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
          {tab === 'basic' && (
            <div>
              <div className="form-group">
                <label className="form-label">Triggers</label>
                {triggers.map((trigger, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      className="form-input font-mono"
                      placeholder=":trigger"
                      value={trigger}
                      onChange={e => updateTrigger(i, e.target.value)}
                    />
                    {triggers.length > 1 && (
                      <button className="btn btn-icon" onClick={() => removeTrigger(i)}>
                        <IoTrashOutline size={14} color="var(--danger)" />
                      </button>
                    )}
                  </div>
                ))}
                <button className="btn btn-sm" onClick={addTrigger}>
                  <IoAddOutline size={12} /> Add Trigger
                </button>
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
                  className="form-textarea"
                  placeholder="Text to insert when trigger is typed..."
                  value={replace}
                  onChange={e => setReplace(e.target.value)}
                  rows={5}
                />
                <div className="text-xs text-muted mt-2">
                  Use {'{{var_name}}'} for dynamic variables, {'{{form.field}}'} for form fields
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

          {tab === 'dynamic' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-secondary">
                  Dynamic variables let you insert dates, shell output, random values, and more.
                </div>
                <button className="btn btn-sm" onClick={addVar}>
                  <IoAddOutline size={12} /> Add Variable
                </button>
              </div>

              {Object.keys(vars).length === 0 ? (
                <div className="empty-state" style={{ padding: 30 }}>
                  <div className="empty-state-icon">
                    <IoFlashOutline size={24} />
                  </div>
                  <div className="empty-state-title">No dynamic variables</div>
                  <div className="empty-state-desc">
                    Add variables to make your snippets dynamic - dates, shell commands, random choices, and more.
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {Object.entries(vars).map(([name, varDef]) => (
                    <div key={name} className="card" style={{ padding: 16 }}>
                      <div className="flex items-center gap-2 mb-3">
                        <input
                          className="form-input font-mono"
                          style={{ width: 160 }}
                          value={name}
                          onChange={e => updateVarName(name, e.target.value)}
                        />
                        <select
                          className="form-select"
                          style={{ width: 140 }}
                          value={varDef.type}
                          onChange={e => updateVar(name, { type: e.target.value as VarDefinition['type'] })}
                        >
                          {VAR_TYPES.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <button className="btn btn-icon" onClick={() => removeVar(name)}>
                          <IoTrashOutline size={14} color="var(--danger)" />
                        </button>
                      </div>
                      {renderVarParams(name, varDef)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'form' && (
            <div>
              <div className="form-group">
                <label className="form-label">Form Name</label>
                <input
                  className="form-input"
                  placeholder="my_form"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                />
                <div className="text-xs text-muted mt-2">
                  Forms show a dialog when the trigger is typed, letting the user fill in fields.
                </div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-secondary">Form Fields</div>
                <button className="btn btn-sm" onClick={addFormField}>
                  <IoAddOutline size={12} /> Add Field
                </button>
              </div>

              {Object.keys(formFields).length === 0 ? (
                <div className="empty-state" style={{ padding: 30 }}>
                  <div className="empty-state-icon">
                    <IoGridOutline size={24} />
                  </div>
                  <div className="empty-state-title">No form fields</div>
                  <div className="empty-state-desc">
                    Add fields to create an interactive form dialog.
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {Object.entries(formFields).map(([name, field]) => (
                    <div key={name} className="card" style={{ padding: 16 }}>
                      <div className="flex items-center gap-2 mb-3">
                        <input
                          className="form-input font-mono"
                          style={{ width: 160 }}
                          value={name}
                          onChange={e => updateFormFieldName(name, e.target.value)}
                        />
                        <select
                          className="form-select"
                          style={{ width: 140 }}
                          value={field.type}
                          onChange={e => updateFormField(name, { type: e.target.value as FormField['type'] })}
                        >
                          {FORM_FIELD_TYPES.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <button className="btn btn-icon" onClick={() => removeFormField(name)}>
                          <IoTrashOutline size={14} color="var(--danger)" />
                        </button>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Label</label>
                          <input
                            className="form-input"
                            value={field.label || ''}
                            onChange={e => updateFormField(name, { label: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Default Value</label>
                          <input
                            className="form-input"
                            value={field.default || ''}
                            onChange={e => updateFormField(name, { default: e.target.value })}
                          />
                        </div>
                      </div>
                      {field.type === 'select' && (
                        <div className="form-group">
                          <label className="form-label">Options (comma separated)</label>
                          <input
                            className="form-input"
                            placeholder="option1, option2, option3"
                            value={field.options?.join(', ') || ''}
                            onChange={e => updateFormField(name, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                          />
                        </div>
                      )}
                      {field.type === 'textarea' && (
                        <div className="form-group">
                          <label className="form-label">Multiline</label>
                          <label className="toggle">
                            <input
                              type="checkbox"
                              checked={field.multiline || false}
                              onChange={e => updateFormField(name, { multiline: e.target.checked })}
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