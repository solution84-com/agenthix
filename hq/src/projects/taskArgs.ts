/**
 * The task operations' arguments checked against what the client protocol declares (`CreateTaskArgs`,
 * `MoveTaskToColumnArgs`, `AddTaskCommentArgs`, `GetTasksArgs` in `@agenthix/core/client`). Wasp hands an
 * operation whatever the request carried, so a field of the wrong kind is refused here with a 400 rather than
 * failing in the database. Pure: the checks a person's access needs stay in the operations.
 */
import { HttpError } from 'wasp/server'
import { isTaskState as isNewTaskState, type BoardTaskStatus, type CreateTaskArgs } from '@agenthix/core'
import { stateOfColumnArg } from './deprecatedBoardPlace'

const TASK_STATES: readonly string[] = ['TODO', 'IN_PROGRESS', 'DONE'] satisfies BoardTaskStatus[]
const PRIORITIES: readonly string[] = ['LOW', 'MEDIUM', 'HIGH']

const isText = (v: unknown): v is string => typeof v === 'string'
const optionalText = (v: unknown): boolean => v === undefined || v === null || isText(v)
const given = (v: string | null | undefined): string | undefined => v ?? undefined

function refuse(message: string): never {
  throw new HttpError(400, message)
}

type CheckedCreateTaskArgs = {
  [K in Exclude<keyof CreateTaskArgs, 'boardId' | 'column'>]: Exclude<CreateTaskArgs[K], null>
}

/**
 * Only the declared fields, each checked: anything else the request carried is left behind. A task is on no board
 * (adr-0176): the deprecated `boardId` names nothing, and the deprecated `column` is read as the state it stands for
 * (deprecatedBoardPlace.ts), Backlog when it names none, unless the task model's own place is given.
 */
export function createTaskArgs(args: CreateTaskArgs): CheckedCreateTaskArgs {
  const { projectId, title, description, boardId, column, typeId, columnId, state, assignedAgentId, priority, labels } = args
  if (!isText(projectId) || !projectId) refuse('A project id is required')
  if (!isText(title) || !title.trim()) refuse('A task needs a title')
  if (!optionalText(description) || !optionalText(boardId) || !optionalText(column) || !optionalText(assignedAgentId) || !optionalText(typeId) || !optionalText(columnId)) {
    refuse('description, boardId, column, typeId, columnId and assignedAgentId must be text')
  }
  if (state !== undefined && state !== null && !isNewTaskState(state)) refuse('state must be BACKLOG, TODO, IN_PROGRESS or DONE')
  if (priority !== undefined && (!isText(priority) || !PRIORITIES.includes(priority.toUpperCase()))) {
    refuse('priority must be LOW, MEDIUM or HIGH')
  }
  if (labels !== undefined && (!Array.isArray(labels) || !labels.every(isText))) refuse('labels must be a list of words')
  return {
    projectId, title, description: given(description),
    typeId: given(typeId), columnId: given(columnId),
    state: isNewTaskState(state) ? state : typeId || columnId || column == null ? undefined : (stateOfColumnArg(column) ?? 'BACKLOG'),
    assignedAgentId: given(assignedAgentId), priority, labels,
  }
}

/** The deprecated column argument: a column's name or a state, or null for Backlog. */
export function requireColumnArg(column: unknown): string | null {
  if (column !== null && !isText(column)) refuse('column must be a state, or null for Backlog')
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
  status?: BoardTaskStatus
}

/**
 * A task edit's fields, each checked as `createTaskArgs` checks them: only these are kept, a field left out or null
 * is left alone (an agent is cleared with null), and a wrong kind or value is a 400 rather than the
 * database's failure.
 */
export function updateTaskArgs(args: Record<string, unknown>): UpdateTaskFields {
  const { taskId, title, description, assignedAgentId, priority, labels, status } = args
  if (!isText(taskId) || !taskId) refuse('A task id is required')
  if (title !== undefined && title !== null && (!isText(title) || !title.trim())) refuse('A task needs a title')
  if (!optionalText(description) || !optionalText(assignedAgentId)) {
    refuse('description and assignedAgentId must be text')
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
  }
}

export function isTaskState(v: unknown): v is BoardTaskStatus {
  return isText(v) && TASK_STATES.includes(v)
}
