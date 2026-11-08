import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button, MarkdownBox } from '@agenthix/ui/primitives'
import { MarkdownMessage } from '../../shared/components/MarkdownMessage'
import { LINK_BUTTON } from './routineStyles'

export const INSTRUCTIONS_PLACEHOLDER = 'What should the agent do each time? Write it as you would ask it in a conversation.'

const preview = (text: string) => <MarkdownMessage content={text} className="text-body leading-relaxed" />

/**
 * A routine's instructions (D15, D21), in the one Markdown editor. On its page they read as they will to the agent
 * until clicked into, as a task's description does; Save is a change, so it may ask first (N6).
 */
export function RoutineInstructions({ value, onSave, readOnlyWhy }: {
  value: string
  /** True when it was saved; false when the person cancelled the question or it was refused. */
  onSave: (text: string) => Promise<boolean>
  readOnlyWhy?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])

  const save = async () => {
    if (draft.trim() === value.trim()) { setEditing(false); return }
    setSaving(true)
    const saved = await onSave(draft.trim())
    setSaving(false)
    if (saved) setEditing(false)
  }

  if (!editing) {
    const text = value
      ? <MarkdownMessage content={value} className="text-body leading-relaxed text-text-primary" />
      : <p className="text-body italic text-text-muted">No instructions yet.</p>
    if (readOnlyWhy) return <div className="rounded-xl border border-border px-3 py-2.5" title={readOnlyWhy}>{text}</div>
    return (
      <div>
        <div
          role="button" tabIndex={0} aria-label="Instructions. Edit" onClick={() => setEditing(true)}
          onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setEditing(true) } }}
          className="cursor-text rounded-xl border border-border px-3 py-2.5 hover:border-accent"
        >
          {text}
        </div>
        <button type="button" onClick={() => setEditing(true)} className={`${LINK_BUTTON} mt-1 text-text-muted`}><Pencil size={12} aria-hidden />Edit</button>
      </div>
    )
  }
  return (
    <MarkdownBox
      value={draft} onChange={setDraft} label="Instructions" placeholder={INSTRUCTIONS_PLACEHOLDER} autoFocus
      renderPreview={preview} onSubmit={() => void save()}
      footer={<>
        <span className="text-micro text-text-muted">Markdown</span>
        <span className="ml-auto flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => { setDraft(value); setEditing(false) }}>Cancel</Button>
          <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => void save()}>Save</Button>
        </span>
      </>}
    />
  )
}

/** New routine's instructions: the editor open in Write, as a new task's description is. */
export function NewInstructions({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <MarkdownBox fill value={value} onChange={onChange} label="Instructions" placeholder={INSTRUCTIONS_PLACEHOLDER} renderPreview={preview} />
}
