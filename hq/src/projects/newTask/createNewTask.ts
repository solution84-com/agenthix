import type { NewTaskValues } from './newTaskState'

/** The operations making a task takes, passed in so the order and the retry can be tested without a server. */
export interface NewTaskActions {
  createTask: (args: Record<string, unknown>) => Promise<{ id: string; number: number }>
  updateTaskPlan: (args: { taskId: string; planFinish?: string | null; epicId?: string | null }) => Promise<unknown>
  setTaskSchedule: (args: { taskId: string; at: string }) => Promise<unknown>
  addTasksToSprint: (args: { sprintId: string; taskIds: string[] }) => Promise<unknown>
  setTaskFieldValue: (args: { taskId: string; fieldId: string; optionId: string | null }) => Promise<unknown>
  uploadFile: (taskId: string, file: File) => Promise<unknown>
}

/**
 * What a creation has done so far. A step after the task's making can fail with the task already there: the next
 * try carries on from `taskId` and the steps not in `done`, so a retry never makes the task twice.
 */
export interface NewTaskProgress { taskId: string | null; number: number; done: Set<string> }

export const freshProgress = (): NewTaskProgress => ({ taskId: null, number: 0, done: new Set() })

/**
 * The arguments of the task's making: what the server's create takes, the rest is applied to the made task. Its type,
 * and the column it was added from; with no column it starts in its type's Backlog column, at the bottom of the
 * project's order (D11, D14, N2).
 */
export function createArgs(projectId: string, v: NewTaskValues, workspaceId: string | null): Record<string, unknown> {
  return {
    projectId, title: v.title.trim(),
    ...(v.description.trim() ? { description: v.description } : {}),
    priority: v.priority,
    typeId: v.typeId,
    ...(v.columnId ? { columnId: v.columnId } : {}),
    ...(v.agentId ? { assignedAgentId: v.agentId } : {}),
    ...(v.agentId && v.modelChoice ? { modelChoice: v.modelChoice } : {}),
    ...(workspaceId ? { workspaceId } : {}),
  }
}

const startIso = (v: NewTaskValues): string | null => (v.startsAt ? new Date(v.startsAt).toISOString() : null)

/**
 * Makes the task, then its due date and epic, its sprint (a Backlog task moves to To do, N1), its custom fields, its
 * start time, and its files, each once. Throws at the step that failed.
 */
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
  if (v.due || v.epicId) {
    await step('plan', () => a.updateTaskPlan({
      taskId, ...(v.due ? { planFinish: v.due } : {}), ...(v.epicId ? { epicId: v.epicId } : {}),
    }))
  }
  if (v.sprintId) {
    await step('sprint', () => a.addTasksToSprint({ sprintId: v.sprintId, taskIds: [taskId] }))
  }
  for (const [fieldId, optionId] of Object.entries(v.fields)) {
    if (optionId) await step(`field:${fieldId}`, () => a.setTaskFieldValue({ taskId, fieldId, optionId }))
  }
  if (v.startsAt) {
    await step('start', () => a.setTaskSchedule({ taskId, at: startIso(v)! }))
  }
  for (const [i, file] of v.files.entries()) await step(`file:${i}`, () => a.uploadFile(taskId, file))
  return { id: taskId, number: progress.number }
}
