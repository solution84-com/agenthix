import { useAction, setTaskSchedule, clearTaskSchedule } from 'wasp/client/operations'
import { TaskScheduleEditor } from '@agenthix/ui/tasks'
import { useMayWork } from '../../shared/hooks/useMayWork'

interface ScheduledTask {
  id: string
  projectId: string
  scheduleAt?: string | Date | null
  scheduleNextDueAt?: string | Date | null
  scheduleSetByAgentId?: string | null
}

const iso = (v: string | Date | null | undefined): string | null => (v ? new Date(v).toISOString() : null)

/**
 * A task's start time on its page (Run at…). Setting it is a change to the project, so it takes someone who works in
 * it (adr-0102). A routine makes no task (adr-0177), so a task is never one's round. The actions declare the Task
 * entity, so Wasp refetches the task's own query after each.
 */
export function TaskSchedulePanel({ task }: { task: ScheduledTask }) {
  const canStartRuns = useMayWork(task.projectId)
  const setFn = useAction(setTaskSchedule)
  const clearFn = useAction(clearTaskSchedule)

  return (
    <TaskScheduleEditor
      schedule={{
        at: iso(task.scheduleAt),
        nextDueAt: iso(task.scheduleNextDueAt),
        setBy: task.scheduleSetByAgentId ? 'an agent, when asked' : null,
      }}
      routine={null}
      canEdit={canStartRuns}
      onSave={async ({ at }) => {
        await setFn({ taskId: task.id, at })
      }}
      onClear={async () => {
        await clearFn({ taskId: task.id })
      }}
    />
  )
}
