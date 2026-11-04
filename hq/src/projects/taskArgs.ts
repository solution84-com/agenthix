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
  if (!isText(title) || !title.trim()) refuse('A task needs a title')
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

/** What opens the comment hq writes when a run ends with tools waiting for approval; only hq writes one. */
export const APPROVAL_COMMENT_PREFIX = '__MANIFEST_APPROVAL__:'

export function requireCommentContent(content: unknown): string {
  if (!isText(content)) refuse('A comment must be text')
  if (content.trimStart().startsWith(APPROVAL_COMMENT_PREFIX)) refuse('A comment cannot begin with that marker: it is how hq records a tool request')
  return content
}

export type UpdateTaskFields = {
  taskId: string
  title?: string
  description?: string
  assignedAgentId?: string | null
  priority?: string
  labels?: string[]
  status?: TaskState
  result?: string | null
}

/**
 * A task edit's fields, each checked as `createTaskArgs` checks them: only these are kept, a field left out or null
 * is left alone (an agent is cleared with null, and a result), and a wrong kind or value is a 400 rather than the
 * database's failure.
 */
export function updateTaskArgs(args: Record<string, unknown>): UpdateTaskFields {
  const { taskId, title, description, assignedAgentId, priority, labels, status, result } = args
  if (!isText(taskId) || !taskId) refuse('A task id is required')
  if (title !== undefined && title !== null && (!isText(title) || !title.trim())) refuse('A task needs a title')
  if (!optionalText(description) || !optionalText(assignedAgentId) || !optionalText(result)) {
    refuse('description, assignedAgentId and result must be text')
  }
  if (priority !== undefined && priority !== null && (!isText(priority) || !PRIORITIES.includes(priority.toUpperCase()))) {
    refuse('priority must be LOW, MEDIUM or HIGH')
  }
  if (labels !== undefined && labels !== null && (!Array.isArray(labels) || !labels.every(isText))) refuse('labels must be a list of words')
  if (status !== undefined && status !== null && !isTaskState(status)) refuse('status must be TODO, IN_PROGRESS or DONE')
  return {
    taskId,
    ...(isText(title) ? { title } : {}),
    ...(isText(description) ? { description } : {}),
    ...(assignedAgentId !== undefined ? { assignedAgentId: given(assignedAgentId as string | null) ?? null } : {}),
    ...(isText(priority) ? { priority } : {}),
    ...(Array.isArray(labels) ? { labels: labels as string[] } : {}),
    ...(isTaskState(status) ? { status } : {}),
    ...(result !== undefined ? { result: given(result as string | null) ?? null } : {}),
  }
}

export function isTaskState(v: unknown): v is TaskState {
  return isText(v) && TASK_STATES.includes(v)
}
