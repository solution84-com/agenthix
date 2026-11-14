import { useQuery, useAction, getTasks, getMilestones, updateTaskPlan } from 'wasp/client/operations'
import { TaskFact } from '@agenthix/ui/tasks'
import { DateField, NativeSelect } from '@agenthix/ui/primitives'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import { useAttention } from '../../shared/components/AttentionDialog'
import { isEpicTask } from './taskKind'
import { pressFailureWords } from '../../shared/failureWords'

type Plan = {
  id: string
  projectId: string
  type?: { kind: string } | null
  epicId?: string | null
  milestoneId?: string | null
  planStart?: string | Date | null
  planFinish?: string | Date | null
  project?: { key: string }
}

type PlanChange = { planStart?: string | null; planFinish?: string | null; epicId?: string | null; milestoneId?: string | null }

const dayValue = (v: string | Date | null | undefined) => (v ? new Date(v).toISOString().slice(0, 10) : '')


/**
 * A task's plan and where it sits in the plan (adr-0098): its start and finish dates, the epic it belongs to,
 * or — for an epic — its milestone. Changing any of them never starts, stops or queues a run. `part` draws one of
 * them alone, where the page puts the dates and the epic or milestone in different groups (`due`: the finish alone,
 * as Due); a refusal opens the centred dialog.
 */
export function TaskPlanFacts({ task, onChanged, part }: { task: Plan; onChanged: () => void; part?: 'dates' | 'due' | 'link' }) {
  const canChange = useMayWork(task.projectId)
  const planFn = useAction(updateTaskPlan)
  const attention = useAttention()
  const isEpic = isEpicTask(task)
  const { data: tasks } = useQuery(getTasks, { projectId: task.projectId }, { enabled: !isEpic })
  const { data: milestones } = useQuery(getMilestones, { projectId: task.projectId }, { enabled: isEpic })
  const epics = (tasks ?? []).filter(t => isEpicTask(t) && t.id !== task.id)

  const save = async (change: PlanChange): Promise<void> => {
    try {
      await planFn({ taskId: task.id, ...change })
      onChanged()
    } catch (e) {
      attention.show({ title: 'The plan wasn’t changed', text: `${pressFailureWords(e, 'That did not work.')} Nothing was changed.`, retry: () => void save(change) })
    }
  }
  const disabled = !canChange
  const title = disabled ? VIEWER_CANNOT_WORK : undefined

  return (
    <>
      {attention.dialog}
      {part === 'due' && <TaskFact label="Due">
        <DateField
          aria-label="Due" emptyText="None" disabled={disabled} title={title}
          value={dayValue(task.planFinish)} onChange={e => void save({ planFinish: e.target.value || null })}
        />
      </TaskFact>}
      {(part === undefined || part === 'dates') && <TaskFact label="Plan">
        <div className="grid grid-cols-2 gap-2">
          <DateField
            aria-label="Plan start" emptyText="Start" disabled={disabled} title={title ?? 'Plan start'}
            value={dayValue(task.planStart)} onChange={e => void save({ planStart: e.target.value || null })}
          />
          <DateField
            aria-label="Plan finish" emptyText="Finish" disabled={disabled} title={title ?? 'Plan finish'}
            value={dayValue(task.planFinish)} onChange={e => void save({ planFinish: e.target.value || null })}
          />
        </div>
      </TaskFact>}
      {part === 'dates' || part === 'due' ? null : isEpic ? (
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
