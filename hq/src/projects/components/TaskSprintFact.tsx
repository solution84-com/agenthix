import { useAction, useQuery, addTasksToSprint, getProjectSprints, removeTasksFromSprint } from 'wasp/client/operations'
import { NativeSelect } from '@agenthix/ui/primitives'
import { TaskFact } from '@agenthix/ui/tasks'
import { VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import type { ProjectSprints, SprintSummary } from '../projectSprintView'
import type { TaskChange } from './TaskFactsPanel'
import { isEpicTask } from './taskKind'

type SprintedTask = { id: string; projectId: string; sprintId?: string | null; type?: { kind: string } | null }

export const EPIC_HAS_NO_SPRINT = 'An epic is not planned into a sprint: plan its tasks instead.'
export const FINISHED_SPRINT_KEEPS = 'Its sprint is finished, and keeps its record as it was.'
export const NO_SPRINTS_YET = 'This project has no sprints yet: start them on Sprints.'

/** The sprints a task can be planned into: the current one and those planned ahead, never a finished one (N7). */
export function sprintChoices(series: ProjectSprints | undefined): SprintSummary[] {
  return series ? [...(series.current ? [series.current] : []), ...series.upcoming] : []
}

function useSprints(projectId: string | undefined) {
  const { data } = useQuery(getProjectSprints, projectId ? { projectId } : undefined, { enabled: !!projectId })
  return data as ProjectSprints | undefined
}

/** Why the task's sprint cannot be changed here, if it cannot; null when it can. */
export function sprintFixedWhy(task: SprintedTask, series: ProjectSprints | undefined, canChange: boolean): string | null {
  if (!canChange) return VIEWER_CANNOT_WORK
  if (isEpicTask(task)) return EPIC_HAS_NO_SPRINT
  if (task.sprintId && series?.past.some(s => s.id === task.sprintId)) return FINISHED_SPRINT_KEEPS
  if (series && !series.current) return NO_SPRINTS_YET
  return null
}

/**
 * A task's sprint in Details (D8, D13): one of the project's sprints or none, by name; its dates show only on
 * Sprints. Choosing one plans the task into it (a Backlog task moves to To do, N1); None takes it out, its state as
 * it is. A finished sprint keeps its record, so a task in one stays.
 */
export function TaskSprintFact({ task, canChange, change, onChanged }: {
  task: SprintedTask
  canChange: boolean
  change: TaskChange
  onChanged: () => void
}) {
  const series = useSprints(task.projectId)
  const plan = useAction(addTasksToSprint)
  const takeOut = useAction(removeTasksFromSprint)
  const choices = sprintChoices(series)
  const current = task.sprintId ? [series?.current, ...(series?.upcoming ?? []), ...(series?.past ?? [])].find(s => s?.id === task.sprintId) : null
  const why = sprintFixedWhy(task, series, canChange)
  const choose = (sprintId: string) => change('The sprint', async () => {
    if (sprintId) await plan({ sprintId, taskIds: [task.id] })
    else await takeOut({ projectId: task.projectId, taskIds: [task.id] })
    onChanged()
  })
  return (
    <TaskFact label="Sprint">
      <span title={why ?? undefined} className="block">
        <NativeSelect size="sm" aria-label="Sprint" value={task.sprintId ?? ''} disabled={!series || !!why} onChange={e => choose(e.target.value)}>
          <option value="">None</option>
          {current && !choices.includes(current) && <option value={current.id}>{current.title}</option>}
          {choices.map(s => <option key={s.id} value={s.id}>{s.title}{s.status === 'current' ? ' (current)' : ''}</option>)}
        </NativeSelect>
      </span>
    </TaskFact>
  )
}

/** The task's sprint by name; null when it is in none, or while it is read. */
export function useTaskSprintName(task: SprintedTask | null | undefined): string | null {
  const series = useSprints(task?.sprintId ? task.projectId : undefined)
  if (!task?.sprintId || !series) return null
  return [series.current, ...series.upcoming, ...series.past].find(s => s?.id === task.sprintId)?.title ?? null
}
