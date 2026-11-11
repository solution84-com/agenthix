import { useEffect, useId, useState } from 'react'
import { useQuery, getTypeColumnTasks } from 'wasp/client/operations'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { Button, CONTROL_HEIGHT, Modal, NativeSelect } from '@agenthix/ui/primitives'
import { COLUMN_NAME_MAX_LENGTH, TASK_STATE_LABELS, type TaskState, type TypeColumnFields } from '@agenthix/core'
import { INPUT } from '../Part'
import { moveColumnWords, otherStates, otherStatesHint } from './typeRules'

function Foot({ onCancel, label, onConfirm, disabled, danger }: { onCancel: () => void; label: string; onConfirm: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      <Button variant={danger ? 'danger' : 'primary'} disabled={disabled} onClick={onConfirm}>{label}</Button>
    </div>
  )
}

/** Add column, or Rename: one name, checked again by the server, which says when it is taken. */
export function ColumnNameDialog({ title, initial, confirm, onCancel, onConfirm }: {
  title: string
  initial: string
  confirm: string
  onCancel: () => void
  onConfirm: (name: string) => void
}) {
  const id = useId()
  const [name, setName] = useState(initial)
  useEffect(() => setName(initial), [initial])
  const ready = name.trim() !== '' && name.trim() !== initial
  return (
    <Modal open onClose={onCancel} title={title}>
      <form onSubmit={e => { e.preventDefault(); if (ready) onConfirm(name.trim()) }}>
        <label htmlFor={id} className="mb-1.5 block text-small text-text-secondary">Name</label>
        <input id={id} autoFocus value={name} maxLength={COLUMN_NAME_MAX_LENGTH} onChange={e => setName(e.target.value)} className={`${INPUT} ${CONTROL_HEIGHT} py-0`} />
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={!ready}>{confirm}</Button>
        </div>
      </form>
    </Modal>
  )
}

/** Move to another state…: the state, then the tasks whose state changes, named before anything changes (D2: Done means done). */
export function MoveColumnDialog({ column, projectKey, onCancel, onConfirm }: {
  column: TypeColumnFields
  projectKey: string
  onCancel: () => void
  onConfirm: (state: TaskState) => void
}) {
  const id = useId()
  const choices = otherStates(column.state)
  const [state, setState] = useState<TaskState>(choices[choices.length - 1]!)
  const tasksQuery = useQuery(getTypeColumnTasks, { columnId: column.id })
  const { data: tasks } = tasksQuery
  const read = useBackgroundRead(tasksQuery, { what: 'The tasks it holds' })
  const named = (tasks ?? []).map(t => ({ key: `${projectKey}-${t.number}`, title: t.title }))
  return (
    <Modal open onClose={onCancel} title={`Move ${column.name} to ${TASK_STATE_LABELS[state]}?`} closeLabel="Close">
      <div className="space-y-4">
        <div>
          <label htmlFor={id} className="mb-1.5 block text-small text-text-secondary">Move it to</label>
          <NativeSelect id={id} value={state} onChange={e => setState(e.target.value as TaskState)}>
            {choices.map(s => <option key={s} value={s}>{TASK_STATE_LABELS[s]}</option>)}
          </NativeSelect>
          <p className="mt-1.5 text-micro text-text-muted">{otherStatesHint(column)}</p>
        </div>
        {read.failedWithoutData ? read.nudge : <p className="text-body text-text-secondary">{tasks ? moveColumnWords(column, state, named) : 'Reading the tasks it holds…'}</p>}
      </div>
      <Foot onCancel={onCancel} label="Move column" disabled={!tasks} onConfirm={() => onConfirm(state)} />
    </Modal>
  )
}

/** Remove the column: only an empty one, and never a state's last; the ✕ is greyed with why otherwise. */
export function RemoveColumnDialog({ column, onCancel, onConfirm }: { column: TypeColumnFields; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal open onClose={onCancel} title={`Remove the column ${column.name}?`} closeLabel="Close">
      <p className="text-body text-text-secondary">
        It holds no tasks. {column.defaultForState ? `Another column in ${TASK_STATE_LABELS[column.state]} becomes its default.` : `${TASK_STATE_LABELS[column.state]} keeps its other columns.`}
      </p>
      <Foot onCancel={onCancel} label="Remove column" danger onConfirm={onConfirm} />
    </Modal>
  )
}
