import type { ScheduleRuleInput } from '@agenthix/ui/tasks'
import { REPEAT_RULES, type NewTaskValues } from './newTaskState'

/** The operations making a task takes, passed in so the order and the retry can be tested without a server. */
export interface NewTaskActions {
  createTask: (args: Record<string, unknown>) => Promise<{ id: string; number: number }>
  updateTaskPlan: (args: { taskId: string; planStart?: string | null; planFinish?: string | null; epicId?: string | null }) => Promise<unknown>
  setTaskSchedule: (args: { taskId: string; at: string }) => Promise<unknown>
  makeTaskRoutine: (args: { taskId: string; schedule: { rule: ScheduleRuleInput; at: string | null; timezone: string } }) => Promise<unknown>
  uploadFile: (taskId: string, file: File) => Promise<unknown>
}

/**
 * What a creation has done so far. A step after the task's making can fail with the task already there: the next
 * try carries on from `taskId` and the steps not in `done`, so a retry never makes the task twice.
 */
export interface NewTaskProgress { taskId: string | null; number: number; done: Set<string> }

export const freshProgress = (): NewTaskProgress => ({ taskId: null, number: 0, done: new Set() })

/** The arguments of the task's making: what the server's create takes, the rest is applied to the made task. */
export function createArgs(projectId: string, v: NewTaskValues, workspaceId: string | null): Record<string, unknown> {
  return {
    projectId, title: v.title.trim(),
    ...(v.description.trim() ? { description: v.description } : {}),
    priority: v.priority,
    ...(v.agentId ? { assignedAgentId: v.agentId } : {}),
    ...(v.agentId && v.modelChoice ? { modelChoice: v.modelChoice } : {}),
    ...(v.boardId ? { boardId: v.boardId, column: v.column || undefined } : {}),
    ...(workspaceId ? { workspaceId } : {}),
  }
}

const localTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
const startIso = (v: NewTaskValues): string | null => (v.startsAt ? new Date(v.startsAt).toISOString() : null)

/** Makes the task, then its plan, epic, start or repeat, and files, each once. Throws at the step that failed. */
export async function createNewTask(
  projectId: string, v: NewTaskValues, workspaceId: string | null, a: NewTaskActions, progress: NewTaskProgress,
): Promise<{ id: string; number: number }> {
  if (!progress.taskId) {
    const made = await a.createTask(createArgs(projectId, v, workspaceId))
    progress.taskId = made.id
    progress.number = made.number
  }
  const taskId = progress.taskId
  const step = async (name: string, run: () => Promise<unknown>) => {
    if (progress.done.has(name)) return
    await run()
    progress.done.add(name)
  }
  if (v.planStart || v.planFinish || v.epicId) {
    await step('plan', () => a.updateTaskPlan({
      taskId, ...(v.planStart ? { planStart: v.planStart } : {}), ...(v.planFinish ? { planFinish: v.planFinish } : {}),
      ...(v.epicId ? { epicId: v.epicId } : {}),
    }))
  }
  if (v.repeat) {
    await step('routine', () => a.makeTaskRoutine({ taskId, schedule: { rule: REPEAT_RULES[v.repeat as Exclude<typeof v.repeat, ''>].rule, at: startIso(v), timezone: localTimezone() } }))
  } else if (v.startsAt) {
    await step('start', () => a.setTaskSchedule({ taskId, at: startIso(v)! }))
  }
  for (const [i, file] of v.files.entries()) await step(`file:${i}`, () => a.uploadFile(taskId, file))
  return { id: taskId, number: progress.number }
}
