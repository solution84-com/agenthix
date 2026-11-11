import { useState } from 'react'
import { FIELD, FOCUS_RING } from '../primitives/controlStyles'
import { BUTTON_PRIMARY } from '../primitives/buttonStyles'
import { useAttentionWhen } from '../attention/useAttentionWhen'

/** A task's start time (spec §3): once — at that time it starts as if a person pressed Run. */

const FIELD_INPUT =
  `${FIELD} rounded-lg px-2 py-1 text-body`

const localTimezone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const formatWhen = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''

export interface TaskScheduleView {
  at: string | null
  nextDueAt: string | null
  /** Who set it, already worded by the caller ("you", "AgentX in a chat with Dana"). */
  setBy?: string | null
}

export interface TaskScheduleEditorProps {
  schedule: TaskScheduleView
  canEdit: boolean
  onSave: (input: { at: string }) => Promise<void>
  onClear: () => Promise<void>
}

type Editing = null | 'start'

const TEXT_BUTTON = `whitespace-nowrap text-left text-small text-link hover:underline rounded ${FOCUS_RING}`

export function TaskScheduleEditor({ schedule, canEdit, onSave, onClear }: TaskScheduleEditorProps) {
  const [editing, setEditing] = useState<Editing>(null)
  const [at, setAt] = useState(toLocalInput(schedule.at))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const errorDialog = useAttentionWhen(error)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const pending = schedule.nextDueAt !== null

  return (
    <div className="space-y-2">
      <p className="text-micro font-medium uppercase tracking-wide text-text-muted">Start time</p>

      {editing === null && (
        pending ? (
          <div className="text-small text-text-secondary space-y-0.5">
            <div>Starts {formatWhen(schedule.nextDueAt)}{schedule.setBy ? <span className="text-text-muted"> · set by {schedule.setBy}</span> : null}</div>
          </div>
        ) : (
          <div className="text-small text-text-muted">{schedule.at ? `Started at its time, ${formatWhen(schedule.at)}.` : 'Not scheduled.'}</div>
        )
      )}

      {canEdit && editing === null && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <button type="button" onClick={() => { setAt(toLocalInput(schedule.at)); setError(''); setEditing('start') }} className={TEXT_BUTTON}>
            {pending ? 'Change' : 'Set a start time'}
          </button>
        </div>
      )}

      {editing === 'start' && (
        <div className="space-y-2 text-small text-text-secondary">
          <label className="flex items-center gap-2">
            At <input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} className={FIELD_INPUT} />
          </label>
          <div className="text-text-muted">Times are in {localTimezone()}. It starts once, in whatever column it is in.</div>
          {errorDialog}
          <div className="flex gap-2">
            <button
              type="button" disabled={busy || !at}
              onClick={() => void run(() => onSave({ at: new Date(at).toISOString() }))}
              className={`px-3 py-1 rounded-lg font-medium ${BUTTON_PRIMARY}`}
            >
              Save
            </button>
            {pending && (
              <button type="button" disabled={busy} onClick={() => void run(onClear)} className="px-3 py-1 rounded-lg bg-surface-2 text-danger disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none">
                Remove start time
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => setEditing(null)} className="px-3 py-1 text-text-secondary hover:text-text-primary">
              Cancel
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
