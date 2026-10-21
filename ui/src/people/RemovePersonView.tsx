import { useState } from 'react'
import { TasksViewHeader, TASK_BUTTON, TASK_BUTTON_PRIMARY } from '../tasks/TasksToolParts'
import { Section } from '../agents/ProjectAgentParts'
import type { OpenTasksChoice, PersonData } from './types'

export interface RemovePersonViewProps {
  /** `remove` is a manager removing someone; `leave` is a person leaving, which asks nothing about their tasks. */
  mode: 'remove' | 'leave'
  person: PersonData
  projectName: string
  /** Their tasks that are not done: the ones the choice is about. */
  openTaskCount: number
  doneTaskCount: number
  /** The other members who could take the tasks over. */
  others: PersonData[]
  busy: boolean
  error?: string
  onConfirm: (choice: OpenTasksChoice) => void
  onCancel: () => void
}

type Picked = 'person' | 'wait' | null

/** Whether Remove may be pressed: nothing is chosen for the person, so open tasks need a choice first. */
export function canConfirmRemoval(openTaskCount: number, picked: Picked, takerId: string): boolean {
  if (openTaskCount === 0) return true
  return picked === 'wait' || (picked === 'person' && takerId !== '')
}

/** Remove a person from a project, or leave it: what becomes of their open tasks is asked, never assumed. */
export function RemovePersonView(p: RemovePersonViewProps) {
  const [picked, setPicked] = useState<Picked>(null)
  const [takerId, setTakerId] = useState('')
  const leaving = p.mode === 'leave'
  const asks = !leaving && p.openTaskCount > 0
  const ok = leaving || canConfirmRemoval(p.openTaskCount, picked, takerId)
  const title = leaving ? `Leave ${p.projectName}` : `Remove ${p.person.name} from this project`

  const confirm = () => p.onConfirm(picked === 'person' ? { kind: 'person', userId: takerId } : { kind: 'wait' })

  return (
    <div className="pb-6">
      <TasksViewHeader back={leaving ? 'Back' : p.person.name} onBack={p.onCancel} title={title} />
      <Section title="Open tasks">
        {p.openTaskCount === 0 ? (
          <p className="text-small text-text-secondary">No open tasks are done on {leaving ? 'your' : `${p.person.name}'s`} behalf here. {p.doneTaskCount} done {p.doneTaskCount === 1 ? 'stays' : 'stay'} as {p.doneTaskCount === 1 ? 'it is' : 'they are'}.</p>
        ) : (
          <p className="text-small text-text-secondary">
            <b>{p.openTaskCount} open {p.openTaskCount === 1 ? 'task' : 'tasks'}</b> here {p.openTaskCount === 1 ? 'is' : 'are'} done on {leaving ? 'your' : `${p.person.name}'s`} behalf. {p.doneTaskCount} done {p.doneTaskCount === 1 ? 'stays' : 'stay'} as {p.doneTaskCount === 1 ? 'it is' : 'they are'}.
          </p>
        )}
      </Section>

      {asks && (
        <fieldset className="mx-4 mt-3 space-y-2">
          <legend className="text-small font-medium text-text-primary">What happens to the open tasks</legend>
          <label className={`block cursor-pointer rounded-xl border px-3 py-2 text-small ${picked === 'person' ? 'border-accent bg-accent-subtle' : 'border-border-subtle'}`}>
            <span className="flex items-center gap-2">
              <input type="radio" name="open-tasks" checked={picked === 'person'} onChange={() => setPicked('person')} />
              <span className="font-medium text-text-primary">Done on behalf of</span>
            </span>
            <select
              aria-label="Another person here"
              value={takerId}
              disabled={picked !== 'person'}
              onChange={e => setTakerId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border bg-surface-2 px-2 py-1 text-small text-text-primary focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            >
              <option value="">Another person here</option>
              {p.others.map(o => <option key={o.userId} value={o.userId}>{o.name}</option>)}
            </select>
          </label>
          <label className={`block cursor-pointer rounded-xl border px-3 py-2 text-small ${picked === 'wait' ? 'border-accent bg-accent-subtle' : 'border-border-subtle'}`}>
            <span className="flex items-center gap-2">
              <input type="radio" name="open-tasks" checked={picked === 'wait'} onChange={() => setPicked('wait')} />
              <span className="font-medium text-text-primary">Leave them waiting</span>
            </span>
            <span className="ml-6 block text-text-muted">They do not run until someone takes them on.</span>
          </label>
        </fieldset>
      )}

      {p.error && <p role="alert" className="px-4 pt-3 text-small text-danger">{p.error}</p>}
      <div className="flex items-center gap-2 px-4 pt-4">
        <button type="button" className={TASK_BUTTON_PRIMARY} disabled={!ok || p.busy} onClick={confirm}>
          {p.busy ? 'Working…' : leaving ? 'Leave' : 'Remove'}
        </button>
        <button type="button" className={TASK_BUTTON} onClick={p.onCancel}>Cancel</button>
      </div>
      <p className="px-4 pt-3 text-micro text-text-muted">
        {leaving ? 'Your' : 'Their'} conversations here stay private. A run in progress finishes first. In an open project, anyone in the organisation can join again.
      </p>
    </div>
  )
}
