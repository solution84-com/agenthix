import { Link, useNavigate } from 'react-router'
import {
  useQuery, useAction, getProjectAutomation, getRoutine, setTaskSchedule, clearTaskSchedule, makeTaskRoutine,
} from 'wasp/client/operations'
import { TaskScheduleEditor } from '@agenthix/ui/tasks'
import { useMayWork } from '../../shared/hooks/useMayWork'

interface ScheduledTask {
  id: string
  projectId: string
  scheduleAt?: string | Date | null
  scheduleNextDueAt?: string | Date | null
  scheduleSetByAgentId?: string | null
  routineId?: string | null
  roundAt?: string | Date | null
}

const iso = (v: string | Date | null | undefined): string | null => (v ? new Date(v).toISOString() : null)

/**
 * A task's start time on its page, the routine it is a round of, and "Make
 * this a routine…" (spec §3). Setting either is a change to the project, so it
 * takes someone who works in it (adr-0102); the server also holds it to the
 * task's person or a project admin. The actions declare the Task entity, so Wasp refetches the
 * task's own query after each.
 */
export function TaskSchedulePanel({ task }: { task: ScheduledTask }) {
  const canStartRuns = useMayWork(task.projectId)
  const navigate = useNavigate()
  const { data: automation } = useQuery(getProjectAutomation, { projectId: task.projectId })
  const { data: routine } = useQuery(getRoutine, task.routineId ? { routineId: task.routineId } : undefined, { enabled: !!task.routineId })
  const setFn = useAction(setTaskSchedule)
  const clearFn = useAction(clearTaskSchedule)
  const makeRoutineFn = useAction(makeTaskRoutine)
  const roundAt = iso(task.roundAt)

  return (
    <TaskScheduleEditor
      schedule={{
        at: iso(task.scheduleAt),
        nextDueAt: iso(task.scheduleNextDueAt),
        setBy: task.scheduleSetByAgentId ? 'an agent, when asked' : null,
      }}
      routine={task.routineId ? {
        id: task.routineId,
        title: routine?.title ?? 'its routine',
        waitingAt: roundAt && new Date(roundAt).getTime() > Date.now() ? roundAt : null,
      } : null}
      canEdit={canStartRuns}
      automationOn={(automation as { effective?: { enabled: boolean } } | undefined)?.effective?.enabled ?? false}
      onSave={async ({ at }) => {
        await setFn({ taskId: task.id, at })
      }}
      onClear={async () => {
        await clearFn({ taskId: task.id })
      }}
      onMakeRoutine={canStartRuns ? async (schedule) => {
        const { id } = await makeRoutineFn({ taskId: task.id, schedule })
        navigate(`/routines/${id}`)
      } : undefined}
      renderRoutineLink={(routineId, children) => <Link to={`/routines/${routineId}`}>{children}</Link>}
    />
  )
}
