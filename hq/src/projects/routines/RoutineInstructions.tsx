import { useEffect, useState } from 'react'
import { Button, MarkdownBox } from '@agenthix/ui/primitives'
import { MarkdownMessage } from '../../shared/components/MarkdownMessage'

export const INSTRUCTIONS_PLACEHOLDER = 'What should the agent do each time? Write it as you would ask it in a conversation.'

const preview = (text: string) => <MarkdownMessage content={text} className="text-body leading-relaxed" />

/**
 * A routine's instructions (D15, D21), in the one Markdown editor. On its page they open on Preview, reading as they
 * will to the agent, until clicked into, which opens Write; Cancel and Save show once they are changed. Save is a
 * change, so it may ask first (N6).
 */
export function RoutineInstructions({ value, onSave, readOnlyWhy }: {
  value: string
  /** True when it was saved; false when the person cancelled the question or it was refused. */
  onSave: (text: string) => Promise<boolean>
  readOnlyWhy?: string
}) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  // Each saved or cancelled text starts the box again on Preview.
  const [round, setRound] = useState(0)
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  const changed = editing && draft.trim() !== value.trim()
  const done = () => { setEditing(false); setRound(r => r + 1) }

  const save = async () => {
    if (!changed) return
    setSaving(true)
    const saved = await onSave(draft.trim())
    setSaving(false)
    if (saved) done()
  }

  return (
    <div title={readOnlyWhy}>
      <MarkdownBox
        key={round} defaultTab="preview" disabled={!!readOnlyWhy}
        value={draft} onChange={v => { setDraft(v); setEditing(true) }} label="Instructions" placeholder={INSTRUCTIONS_PLACEHOLDER}
        renderPreview={preview} onSubmit={() => void save()}
        footer={changed ? <>
          <span className="text-micro text-text-muted">Markdown</span>
          <span className="ml-auto flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => { setDraft(value); done() }}>Cancel</Button>
            <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => void save()}>Save</Button>
          </span>
        </> : undefined}
      />
    </div>
  )
}

/** New routine's instructions: the editor open in Write, as a new task's description is. */
export function NewInstructions({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <MarkdownBox fill value={value} onChange={onChange} label="Instructions" placeholder={INSTRUCTIONS_PLACEHOLDER} renderPreview={preview} />
}
