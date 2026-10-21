import { useEffect, useState, type ReactNode } from 'react'
import { SaveMark, usePartSave, type PartSave } from './usePartSave'

export const INPUT = 'w-full bg-surface-1 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-1 focus:ring-accent'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-4 border-t border-border-subtle space-y-4 first:pt-0 first:border-t-0">
      <h2 className="text-micro font-medium text-text-muted uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  )
}

/** A labelled part with the save mark beside its label and a hint under it. */
export function Part({ label, htmlFor, save, hint, children }: {
  label: string; htmlFor?: string; save?: PartSave; hint?: ReactNode; children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-small text-text-secondary">{label}</label>
        {save && <SaveMark save={save} />}
      </div>
      {children}
      {hint && <div className="text-micro text-text-muted">{hint}</div>}
    </div>
  )
}

/** A part someone may only read: its value as text. */
export function ReadOnlyValue({ id, children, mono }: { id?: string; children: ReactNode; mono?: boolean }) {
  return <div id={id} className={`text-body text-text-primary ${mono ? 'font-mono' : ''}`}>{children}</div>
}

/**
 * A text part saved on leaving it. What was typed stays when the save is refused,
 * and the problem shows beside the part.
 */
export function TextPart({ label, id, value, canEdit, onSave, multiline, mono, hint, placeholder, normalize, validate, emptyText }: {
  label: string
  id: string
  value: string
  canEdit: boolean
  onSave: (next: string) => Promise<unknown>
  multiline?: boolean
  mono?: boolean
  hint?: ReactNode
  placeholder?: string
  normalize?: (raw: string) => string
  validate?: (next: string) => string | null
  emptyText?: string
}) {
  const [draft, setDraft] = useState(value)
  const save = usePartSave()
  useEffect(() => setDraft(value), [value])

  if (!canEdit) {
    return (
      <Part label={label} htmlFor={id} hint={hint}>
        <ReadOnlyValue id={id} mono={mono}>{value || <span className="text-text-muted">{emptyText ?? 'None'}</span>}</ReadOnlyValue>
      </Part>
    )
  }

  const commit = async () => {
    const next = draft.trim()
    if (next === value) { save.clear(); return }
    const problem = validate?.(next) ?? null
    if (problem) { save.fail(problem); return }
    await save.save(() => onSave(next))
  }
  const common = {
    id, value: draft, placeholder, onBlur: () => void commit(),
    className: `${INPUT} ${mono ? 'font-mono' : ''} ${multiline ? 'resize-none' : ''}`,
  }
  return (
    <Part label={label} htmlFor={id} save={save} hint={hint}>
      {multiline ? (
        <textarea {...common} rows={3} onChange={e => setDraft(e.target.value)} />
      ) : (
        <input
          {...common}
          onChange={e => setDraft(normalize ? normalize(e.target.value) : e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
      )}
    </Part>
  )
}
