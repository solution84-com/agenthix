import { useState } from 'react'
import { useQuery, useAction, getTasks, getMilestones, updateTaskPlan } from 'wasp/client/operations'
import { TaskFact } from '@agenthix/ui/tasks'
import { NativeSelect } from '@agenthix/ui/primitives'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'

type Plan = {
  id: string
  projectId: string
  isEpic?: boolean
  epicId?: string | null
  milestoneId?: string | null
  planStart?: string | Date | null
  planFinish?: string | Date | null
  project?: { key: string }
}

type PlanChange = { planStart?: string | null; planFinish?: string | null; epicId?: string | null; milestoneId?: string | null }

const dayValue = (v: string | Date | null | undefined) => (v ? new Date(v).toISOString().slice(0, 10) : '')

const DATE_INPUT =
  'w-full rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-small text-text-primary focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60'

/**
 * A task's plan and where it sits in the plan (adr-0098): its start and finish dates, the epic it belongs to,
 * or — for an epic — its milestone. Changing any of them never starts, stops or queues a run.
 */
export function TaskPlanFacts({ task, onChanged }: { task: Plan; onChanged: () => void }) {
  const canChange = useMayWork(task.projectId)
  const planFn = useAction(updateTaskPlan)
  const [error, setError] = useState('')
  const isEpic = !!task.isEpic
  const { data: tasks } = useQuery(getTasks, { projectId: task.projectId }, { enabled: !isEpic })
  const { data: milestones } = useQuery(getMilestones, { projectId: task.projectId }, { enabled: isEpic })
  const epics = (tasks ?? []).filter(t => t.isEpic && t.id !== task.id)

  const save = async (change: PlanChange) => {
    setError('')
    try {
      await planFn({ taskId: task.id, ...change })
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work')
    }
  }
  const disabled = !canChange
  const title = disabled ? VIEWER_CANNOT_WORK : undefined

  return (
    <>
      <TaskFact label="Plan">
        <div className="space-y-1.5">
          <label className="block space-y-0.5">
            <span className="text-micro text-text-muted">Start</span>
            <input
              type="date" aria-label="Plan start" className={DATE_INPUT} disabled={disabled} title={title}
              value={dayValue(task.planStart)} onChange={e => void save({ planStart: e.target.value || null })}
            />
          </label>
          <label className="block space-y-0.5">
            <span className="text-micro text-text-muted">Finish</span>
            <input
              type="date" aria-label="Plan finish" className={DATE_INPUT} disabled={disabled} title={title}
              value={dayValue(task.planFinish)} onChange={e => void save({ planFinish: e.target.value || null })}
            />
          </label>
          {error && <p role="alert" className="text-micro text-danger">{error}</p>}
        </div>
      </TaskFact>
      {isEpic ? (
        <TaskFact label="Milestone">
          <NativeSelect
            size="sm" aria-label="Milestone" disabled={disabled} title={title} value={task.milestoneId ?? ''}
            onChange={e => void save({ milestoneId: e.target.value || null })}
          >
            <option value="">None</option>
            {(milestones ?? []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </NativeSelect>
        </TaskFact>
      ) : (
        <TaskFact label="Epic">
          <NativeSelect
            size="sm" aria-label="Epic" disabled={disabled} title={title} value={task.epicId ?? ''}
            onChange={e => void save({ epicId: e.target.value || null })}
          >
            <option value="">None</option>
            {epics.map(e => <option key={e.id} value={e.id}>{task.project ? `${task.project.key}-${e.number} · ` : ''}{e.title}</option>)}
          </NativeSelect>
        </TaskFact>
      )}
    </>
  )
}
