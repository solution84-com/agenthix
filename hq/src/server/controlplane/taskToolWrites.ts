/**
 * The changes the task tools make to one task, each through the service the screens use for it: its place (type,
 * column, task state, rank: taskColumnService), its sprint (projectSprintService), its custom field values
 * (fieldService) and whether it is archived. None of them starts, stops or queues a run (D6).
 */
import type { TaskState } from '@prisma/client'
import { moveTask } from '../../projects/taskColumnService'
import { planIntoSprint, takeOutOfSprint } from '../../projects/projectSprintService'
import { setTaskFieldValue } from '../../projects/fieldService'
import { archiveTask, unarchiveTask } from '../../projects/taskService'
import type { TaskActor } from '../../projects/taskActivity'
import { asControlPlane } from './asControlPlane'
import { ControlPlaneError } from './types'

export type PlaceArgs = {
  typeId?: string
  columnId?: string
  state?: TaskState
  afterTaskId?: string
  beforeTaskId?: string
}

export function hasPlace(a: PlaceArgs): boolean {
  return a.typeId !== undefined || a.columnId !== undefined || a.state !== undefined || a.afterTaskId !== undefined || a.beforeTaskId !== undefined
}

export async function applyPlace(taskId: string, a: PlaceArgs, actor: TaskActor): Promise<void> {
  if (a.afterTaskId && a.beforeTaskId) {
    throw new ControlPlaneError('invalid', 'Name the task to put it after, or the one to put it before, not both. Nothing was changed.')
  }
  await asControlPlane(() => moveTask(taskId, {
    ...(a.typeId ? { typeId: a.typeId } : {}),
    ...(a.columnId ? { columnId: a.columnId } : {}),
    ...(a.state ? { state: a.state } : {}),
    ...(a.afterTaskId ? { afterTaskId: a.afterTaskId } : {}),
    ...(a.beforeTaskId ? { beforeTaskId: a.beforeTaskId } : {}),
  }, actor))
}

/** Plans the tasks into a sprint of their project (N1 moves a Backlog task to To do), or, with null, takes them out. */
export async function applySprint(projectId: string, taskIds: string[], sprintId: string | null, actor: TaskActor): Promise<void> {
  if (sprintId === null) await asControlPlane(() => takeOutOfSprint(projectId, taskIds, actor))
  else await asControlPlane(() => planIntoSprint(sprintId, taskIds, {}, actor))
}

/** Each field's id to one of its options' ids, or "" to clear it. */
export async function applyFieldValues(taskId: string, values: Record<string, string>, actor: TaskActor): Promise<void> {
  for (const [fieldId, optionId] of Object.entries(values)) {
    await asControlPlane(() => setTaskFieldValue(taskId, fieldId, optionId === '' ? null : optionId, actor))
  }
}

export async function applyArchived(task: { id: string; runState: string }, archived: boolean, actor: TaskActor): Promise<void> {
  if (archived && task.runState === 'RUN_ACTIVE') {
    throw new ControlPlaneError('conflict', 'This task is running: stop it before archiving it. Nothing was changed.')
  }
  if (archived) await archiveTask(task.id, actor)
  else await unarchiveTask(task.id, actor)
}

/**
 * A refusal met after some of a call's changes were made says so, in place of "Nothing was changed.", so the agent
 * never reads that nothing changed when something did.
 */
export function refusalAfter(err: unknown, done: readonly string[]): unknown {
  if (!(err instanceof ControlPlaneError) || done.length === 0) return err
  const said = err.message.replace(/\s*Nothing was changed\.?$/, '')
  return new ControlPlaneError(err.code, `${said} Already changed before this: ${done.join(', ')}.`)
}
