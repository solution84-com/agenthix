import { useId, useState } from 'react'
import { useQuery, getCustomFieldUse } from 'wasp/client/operations'
import { Button, CONTROL_HEIGHT, Modal } from '@agenthix/ui/primitives'
import { INPUT } from '../Part'
import { CUSTOM_FIELD_NAME_MAX_LENGTH, deleteFieldWords, nameProblem, optionLines, optionLinesProblem } from './fieldRules'

const LABEL = 'mb-1.5 block text-small text-text-secondary'

function Foot({ onCancel, confirm, disabled, why, danger }: { onCancel: () => void; confirm: string; disabled?: boolean; why?: string | null; danger?: boolean }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={disabled} title={why ?? undefined}>{confirm}</Button>
    </div>
  )
}

/** New field: a single-select field's name, and its first options, one per line. */
export function NewFieldDialog({ taken, onCancel, onCreate }: {
  taken: string[]
  onCancel: () => void
  onCreate: (name: string, options: string[]) => void
}) {
  const nameId = useId()
  const optionsId = useId()
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const lines = optionLines(text)
  const why = nameProblem(name, CUSTOM_FIELD_NAME_MAX_LENGTH, taken, 'field') ?? optionLinesProblem(lines)
  return (
    <Modal open onClose={onCancel} title="New field">
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (!why) onCreate(name.trim(), lines) }}>
        <p className="text-small text-text-muted">A single choice from a list, such as Launch stage or Channel. A field is a way of looking at tasks: it never changes a task's state.</p>
        <div>
          <label htmlFor={nameId} className={LABEL}>Name</label>
          <input id={nameId} autoFocus value={name} maxLength={CUSTOM_FIELD_NAME_MAX_LENGTH} onChange={e => setName(e.target.value)} className={`${INPUT} ${CONTROL_HEIGHT} py-0`} />
        </div>
        <div>
          <label htmlFor={optionsId} className={LABEL}>Options, one per line</label>
          <textarea id={optionsId} rows={5} value={text} onChange={e => setText(e.target.value)} placeholder={'Copy to write\nDesign\nReview'} className={INPUT} />
          <p className="mt-1 text-micro text-text-muted">More can be added later, by anyone who works in the project.</p>
        </div>
        <Foot onCancel={onCancel} confirm="Add field" disabled={!!why} why={name.trim() ? why : null} />
      </form>
    </Modal>
  )
}

/** Rename a field, add an option or rename one: one name, checked here and again by the server. */
export function NameDialog({ title, initial, confirm, max, taken, what, onCancel, onConfirm }: {
  title: string
  initial: string
  confirm: string
  max: number
  /** The other names in the list, which this one may not repeat. */
  taken: string[]
  what: 'field' | 'option'
  onCancel: () => void
  onConfirm: (name: string) => void
}) {
  const id = useId()
  const [name, setName] = useState(initial)
  const unchanged = name.trim() === initial
  const why = unchanged ? null : nameProblem(name, max, taken, what)
  return (
    <Modal open onClose={onCancel} title={title}>
      <form onSubmit={e => { e.preventDefault(); if (!why && !unchanged) onConfirm(name.trim()) }}>
        <label htmlFor={id} className={LABEL}>Name</label>
        <input id={id} autoFocus value={name} maxLength={max} onChange={e => setName(e.target.value)} className={`${INPUT} ${CONTROL_HEIGHT} py-0`} />
        {why && name.trim() !== '' && <p className="mt-1.5 text-small text-text-muted">{why}</p>}
        <Foot onCancel={onCancel} confirm={confirm} disabled={unchanged || !!why} />
      </form>
    </Modal>
  )
}

/** Delete a field: says what goes with it (its values and its boards), and that archiving keeps them. */
export function DeleteFieldDialog({ field, onCancel, onDelete }: { field: { id: string; name: string }; onCancel: () => void; onDelete: () => void }) {
  const { data: use } = useQuery(getCustomFieldUse, { fieldId: field.id })
  return (
    <Modal open onClose={onCancel} title={`Delete the field ${field.name}?`}>
      <form onSubmit={e => { e.preventDefault(); onDelete() }}>
        <p className="text-body text-text-secondary">{deleteFieldWords(field.name, use)}</p>
        <Foot onCancel={onCancel} confirm="Delete field" danger disabled={!use} />
      </form>
    </Modal>
  )
}

/** Remove an option: the tasks that had it are left with none. */
export function RemoveOptionDialog({ option, field, onCancel, onRemove }: { option: string; field: string; onCancel: () => void; onRemove: () => void }) {
  return (
    <Modal open onClose={onCancel} title={`Remove ${option}?`}>
      <form onSubmit={e => { e.preventDefault(); onRemove() }}>
        <p className="text-body text-text-secondary">Tasks set to {option} are left with no value in {field}. Nothing else about them changes.</p>
        <Foot onCancel={onCancel} confirm="Remove option" danger />
      </form>
    </Modal>
  )
}
