/**
 * The task operations' arguments checked against what the client protocol declares (`CreateTaskArgs`,
 * `MoveTaskToColumnArgs`, `AddTaskCommentArgs`, `GetTasksArgs` in `@agenthix/core/client`). Wasp hands an
 * operation whatever the request carried, so a field of the wrong kind is refused here with a 400 rather than
 * failing in the database. Pure: the checks a person's access needs stay in the operations.
 */
import { HttpError } from 'wasp/server'
import type { CreateTaskArgs, TaskState } from '@agenthix/core'

const TASK_STATES: readonly string[] = ['TODO', 'IN_PROGRESS', 'DONE'] satisfies TaskState[]
const PRIORITIES: readonly string[] = ['LOW', 'MEDIUM', 'HIGH']

const isText = (v: unknown): v is string => typeof v === 'string'
const optionalText = (v: unknown): boolean => v === undefined || v === null || isText(v)
const given = (v: string | null | undefined): string | undefined => v ?? undefined

function refuse(message: string): never {
  throw new HttpError(400, message)
}

type CheckedCreateTaskArgs = {
  [K in keyof CreateTaskArgs]: Exclude<CreateTaskArgs[K], null>
}

/** Only the declared fields, each checked: anything else the request carried is left behind. */
export function createTaskArgs(args: CreateTaskArgs): CheckedCreateTaskArgs {
  const { projectId, title, description, boardId, column, assignedAgentId, priority, labels } = args
  if (!isText(projectId) || !projectId) refuse('A project id is required')
  if (!isText(title)) refuse('A task needs a title')
  if (!optionalText(description) || !optionalText(boardId) || !optionalText(column) || !optionalText(assignedAgentId)) {
    refuse('description, boardId, column and assignedAgentId must be text')
  }
  if (priority !== undefined && (!isText(priority) || !PRIORITIES.includes(priority.toUpperCase()))) {
    refuse('priority must be LOW, MEDIUM or HIGH')
  }
  if (labels !== undefined && (!Array.isArray(labels) || !labels.every(isText))) refuse('labels must be a list of words')
  return {
    projectId, title, description: given(description), boardId: given(boardId), column: given(column),
    assignedAgentId: given(assignedAgentId), priority, labels,
  }
}

/** A column's name, or null for the board's Backlog. */
export function requireColumnArg(column: unknown): string | null {
  if (column !== null && !isText(column)) refuse('column must be a column name, or null for the Backlog')
  return column
}

export function requireCommentContent(content: unknown): string {
  if (!isText(content)) refuse('A comment must be text')
  return content
}

export function isTaskState(v: unknown): v is TaskState {
  return isText(v) && TASK_STATES.includes(v)
}
