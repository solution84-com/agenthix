import { useState, type ReactNode } from 'react'
import {
  DEFAULT_ROUTINE_SCHEDULE, FIELD_INPUT, RoutineRuleFields, formatWhen, localTimezone, scheduleInputOf, toLocalInput,
  type RoutineScheduleValue, type ScheduleRuleInput,
} from './RoutineRuleFields'

/**
 * A task's start time (spec §3): once — at that time it starts as if a person
 * pressed Run. Work that repeats is a routine: beside the start time, a task
 * offers "Make this a routine…", and a round of a routine links to it.
 */

export interface TaskScheduleView {
  at: string | null
  nextDueAt: string | null
  /** Who set it, already worded by the caller ("you", "AgentX in a chat with Dana"). */
  setBy?: string | null
}

export interface TaskRoutineView {
  id: string
  title: string
  /** The round's time, while it is still to come. */
  waitingAt: string | null
}

export interface TaskScheduleEditorProps {
  schedule: TaskScheduleView
  /** The routine this task is a round of, if it is one. */
  routine?: TaskRoutineView | null
  canEdit: boolean
  /** Whether the project's automation is on; off, a task that falls due is queued instead of started. */
  automationOn: boolean
  onSave: (input: { at: string }) => Promise<void>
  onClear: () => Promise<void>
  /** Creates a routine from this task; absent when the viewer may not. */
  onMakeRoutine?: (schedule: { rule: ScheduleRuleInput; at: string | null; timezone: string }) => Promise<void>
  /** Wraps the routine's name in the consumer's own link to its page. */
  renderRoutineLink?: (routineId: string, children: ReactNode) => ReactNode
}

type Editing = null | 'start' | 'routine'

export function TaskScheduleEditor({
  schedule, routine, canEdit, automationOn, onSave, onClear, onMakeRoutine, renderRoutineLink,
}: TaskScheduleEditorProps) {
  const [editing, setEditing] = useState<Editing>(null)
  const [at, setAt] = useState(toLocalInput(schedule.at))
  const [routineSchedule, setRoutineSchedule] = useState<RoutineScheduleValue>(DEFAULT_ROUTINE_SCHEDULE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
  const link = (children: ReactNode) => (routine && renderRoutineLink ? renderRoutineLink(routine.id, children) : children)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-micro font-medium uppercase tracking-wide text-text-muted">Start time</span>
        {canEdit && editing === null && (
          <div className="flex gap-3">
            <button type="button" onClick={() => setEditing('start')} className="text-small text-text-secondary hover:text-text-primary">
              {pending ? 'Change' : 'Set a start time'}
            </button>
            {onMakeRoutine && !routine && (
              <button type="button" onClick={() => setEditing('routine')} className="text-small text-text-secondary hover:text-text-primary">
                Make this a routine…
              </button>
            )}
          </div>
        )}
      </div>

      {routine && (
        <div className="text-small text-text-secondary">
          <span aria-hidden>↻ </span>A round of {link(<span className="text-accent hover:underline">{routine.title}</span>)}
          {routine.waitingAt && <span className="text-text-muted"> · its time is {formatWhen(routine.waitingAt)}</span>}
        </div>
      )}

      {editing === null && (
        pending ? (
          <div className="text-small text-text-secondary space-y-0.5">
            <div>Starts {formatWhen(schedule.nextDueAt)}{schedule.setBy ? <span className="text-text-muted"> · set by {schedule.setBy}</span> : null}</div>
            {!automationOn && (
              <div className="text-warning">This project's automation is off: at its time it is queued, not started.</div>
            )}
          </div>
        ) : (
          !routine && <div className="text-small text-text-muted">{schedule.at ? `Started at its time, ${formatWhen(schedule.at)}.` : 'Not scheduled.'}</div>
        )
      )}

      {editing === 'start' && (
        <div className="space-y-2 text-small text-text-secondary">
          <label className="flex items-center gap-2">
            At <input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} className={FIELD_INPUT} />
          </label>
          <div className="text-text-muted">Times are in {localTimezone()}. It starts once, in whatever column it is in.</div>
          {error && <div className="text-danger">{error}</div>}
          <div className="flex gap-2">
            <button
              type="button" disabled={busy || !at}
              onClick={() => void run(() => onSave({ at: new Date(at).toISOString() }))}
              className="px-3 py-1 rounded-lg bg-accent hover:bg-accent-hover text-on-accent font-medium disabled:opacity-40"
            >
              Save
            </button>
            {pending && (
              <button type="button" disabled={busy} onClick={() => void run(onClear)} className="px-3 py-1 rounded-lg bg-surface-2 text-danger disabled:opacity-40">
                Remove start time
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => setEditing(null)} className="px-3 py-1 text-text-muted hover:text-text-primary">
              Cancel
            </button>
          </div>
        </div>
      )}

      {editing === 'routine' && onMakeRoutine && (
        <div className="space-y-2 text-small text-text-secondary">
          <div className="text-text-muted">
            A routine keeps its next round — a copy of this task — ready for its next time.{' '}
            {pending ? 'This task becomes its first round, at its start time.' : 'This task is linked to it; the first round comes at its next time.'}
          </div>
          <RoutineRuleFields value={routineSchedule} onChange={setRoutineSchedule} />
          {error && <div className="text-danger">{error}</div>}
          <div className="flex gap-2">
            <button
              type="button" disabled={busy}
              onClick={() => void run(() => onMakeRoutine(scheduleInputOf(routineSchedule)))}
              className="px-3 py-1 rounded-lg bg-accent hover:bg-accent-hover text-on-accent font-medium disabled:opacity-40"
            >
              Make it a routine
            </button>
            <button type="button" disabled={busy} onClick={() => setEditing(null)} className="px-3 py-1 text-text-muted hover:text-text-primary">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
