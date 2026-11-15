/**
 * The task operations' arguments checked against what the client protocol declares (`CreateTaskArgs`,
 * `MoveTaskToColumnArgs`, `AddTaskCommentArgs`, `GetTasksArgs` in `@agenthix/core/client`). Wasp hands an
 * operation whatever the request carried, so a field of the wrong kind is refused here with a 400 rather than
 * failing in the database. Pure: the checks a person's access needs stay in the operations.
 */
import { HttpError } from 'wasp/server'
import { isTaskState, type CreateTaskArgs } from '@agenthix/core'

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
  const { projectId, title, description, typeId, columnId, state, assignedAgentId, priority, labels } = args
  if (!isText(projectId) || !projectId) refuse('A project id is required')
  if (!isText(title) || !title.trim()) refuse('A task needs a title')
  if (!optionalText(description) || !optionalText(assignedAgentId) || !optionalText(typeId) || !optionalText(columnId)) {
    refuse('description, typeId, columnId and assignedAgentId must be text')
  }
  if (state !== undefined && state !== null && !isTaskState(state)) refuse('state must be BACKLOG, TODO, IN_PROGRESS or DONE')
  if (priority !== undefined && (!isText(priority) || !PRIORITIES.includes(priority.toUpperCase()))) {
    refuse('priority must be LOW, MEDIUM or HIGH')
  }
  if (labels !== undefined && (!Array.isArray(labels) || !labels.every(isText))) refuse('labels must be a list of words')
  return {
    projectId, title, description: given(description),
    typeId: given(typeId), columnId: given(columnId),
    state: isTaskState(state) ? state : undefined,
    assignedAgentId: given(assignedAgentId), priority, labels,
  }
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
}

/**
 * A task edit's fields, each checked as `createTaskArgs` checks them: only these are kept, a field left out or null
 * is left alone (an agent is cleared with null), and a wrong kind or value is a 400 rather than the
 * database's failure.
 */
export function updateTaskArgs(args: Record<string, unknown>): UpdateTaskFields {
  const { taskId, title, description, assignedAgentId, priority, labels } = args
  if (!isText(taskId) || !taskId) refuse('A task id is required')
  if (title !== undefined && title !== null && (!isText(title) || !title.trim())) refuse('A task needs a title')
  if (!optionalText(description) || !optionalText(assignedAgentId)) {
    refuse('description and assignedAgentId must be text')
  }
  if (priority !== undefined && priority !== null && (!isText(priority) || !PRIORITIES.includes(priority.toUpperCase()))) {
    refuse('priority must be LOW, MEDIUM or HIGH')
  }
  if (labels !== undefined && labels !== null && (!Array.isArray(labels) || !labels.every(isText))) refuse('labels must be a list of words')
  return {
    taskId,
    ...(isText(title) ? { title } : {}),
    ...(isText(description) ? { description } : {}),
    ...(assignedAgentId !== undefined ? { assignedAgentId: given(assignedAgentId as string | null) ?? null } : {}),
    ...(isText(priority) ? { priority } : {}),
    ...(Array.isArray(labels) ? { labels: labels as string[] } : {}),
  }
}
