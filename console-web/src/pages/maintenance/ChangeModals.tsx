import { useState } from 'react'
import type { ScheduledChange } from '@agenthix/core'
import { FormField, Input, Modal, Button } from '@agenthix/ui/primitives'
import { ConfirmModal, Notice, parseWhen } from '../../components'
import { whenIs } from '../dashboard/words'
import { changeTitle, scheduledBy } from './words'
import type { ActionState } from './useScheduleActions'

const toLocal = (iso: string): string => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function ChangeTimeModal({ change, state, onSave, onCancelChange, onClose }: {
  change: ScheduledChange
  state: ActionState
  onSave: (at: string) => void
  onCancelChange: () => void
  onClose: () => void
}) {
  const [at, setAt] = useState(toLocal(change.at))
  const [error, setError] = useState<string | undefined>()
  const working = state.phase === 'working'
  const save = () => {
    const parsed = parseWhen({ mode: 'later', at }, new Date())
    setError(parsed.ok ? undefined : parsed.error)
    if (parsed.ok && parsed.at) onSave(parsed.at)
  }
  const kind = changeTitle(change)
  return (
    <Modal open onClose={onClose} title="Change the time">
      <dl className="mb-4 grid grid-cols-[110px_1fr] gap-y-1.5 text-small">
        <dt className="text-text-muted">What</dt><dd className="text-text-primary">{kind}</dd>
        <dt className="text-text-muted">Scheduled by</dt><dd className="text-text-primary">{scheduledBy(change.scheduledBy)}, {whenIs(change.scheduledAt, new Date())}</dd>
      </dl>
      <FormField label="When" htmlFor="change-at" error={error} hint="In your browser's time.">
        <Input id="change-at" type="datetime-local" value={at} onChange={e => setAt(e.target.value)} />
      </FormField>
      <p className="mt-2 text-small text-text-muted">HQ sends the members an updated notice, the same way as the first.</p>
      {state.phase === 'refused' && <div className="mt-3"><Notice tone="danger" title="Not changed">{state.message}</Notice></div>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <Button variant="danger" type="button" disabled={working} onClick={onCancelChange}>Cancel it</Button>
        <div className="flex gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Keep it as it is</Button>
          <Button variant="primary" type="button" disabled={working} onClick={save}>Save the time</Button>
        </div>
      </div>
    </Modal>
  )
}

export function CancelChangeModal({ change, state, onConfirm, onClose }: {
  change: ScheduledChange
  state: ActionState
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <ConfirmModal open title="Cancel this planned maintenance?" confirmLabel="Cancel it" destructive busy={state.phase === 'working'} onConfirm={onConfirm} onCancel={onClose}>
      <p><b className="font-semibold">{changeTitle(change)}</b> on {change.machine.name} will not run. HQ tells the members it affects that it was cancelled.</p>
      {state.phase === 'refused' && <div className="mt-3"><Notice tone="danger" title="Not cancelled">{state.message}</Notice></div>}
    </ConfirmModal>
  )
}
