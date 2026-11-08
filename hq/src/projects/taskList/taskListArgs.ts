/**
 * What a task list is asked for (spec T3): the scorecard chosen, the filters, the order and how many rows. Read from
 * the browser, so every field is checked here and anything else is refused; a filter left empty filters nothing.
 */
import { HttpError } from 'wasp/server'
import { TASK_STATES, COLUMN_NAME_MAX_LENGTH, TASK_TYPE_NAME_MAX_LENGTH, type TaskState } from '@agenthix/core'
import { TASK_LIST_CARDS, TASK_LIST_SORTS, type TaskListCard, type TaskListSort } from './taskListRules'

export type TaskListFilters = {
  /** A type by name, so on Your tasks one filter holds every project's type of that name. */
  type?: string
  /** A column by name, for the same reason. */
  column?: string
  state?: TaskState
  epicId?: string
  sprintId?: string
  agentId?: string
  priority?: 'LOW' | 'MEDIUM' | 'HIGH'
  /** One custom field's option: the tasks whose value in that field is it. */
  optionId?: string
  /** Your tasks only. */
  projectId?: string
  /** Only archived tasks, in place of the open ones. */
  archived?: boolean
  search?: string
}

export type TaskListArgs = TaskListFilters & {
  card?: TaskListCard
  sort?: TaskListSort
  /** How many rows to answer; Show more asks again for more. */
  limit?: number
}

export type ProjectTaskListArgs = TaskListArgs & { projectId: string }

export const TASK_LIST_PAGE = 50
const MAX_LIMIT = 500
const MAX_SEARCH = 200
const ID = /^[A-Za-z0-9_-]{1,64}$/

const bad = (what: string) => new HttpError(400, `${what}. Nothing was changed.`)

function idOf(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !ID.test(value)) throw bad(`${name} is not an id`)
  return value
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], name: string): T | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) throw bad(`${name} must be one of ${allowed.join(', ')}`)
  return value as T
}

function nameOf(value: unknown, max: number, name: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.length > max) throw bad(`${name} must be a name of at most ${max} characters`)
  return value
}

export function parseTaskListArgs(raw: unknown): TaskListArgs {
  const a = (raw ?? {}) as Record<string, unknown>
  if (typeof a !== 'object' || Array.isArray(a)) throw bad('The list was asked for in a form hq does not read')
  if (a.search !== undefined && a.search !== null && typeof a.search !== 'string') throw bad('search must be text')
  if (a.archived !== undefined && a.archived !== null && typeof a.archived !== 'boolean') throw bad('archived must be true or false')
  const limit = a.limit === undefined || a.limit === null ? TASK_LIST_PAGE : a.limit
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) throw bad('limit must be a whole number above 0')
  const search = typeof a.search === 'string' ? a.search.trim().slice(0, MAX_SEARCH) : ''
  return {
    card: oneOf(a.card, TASK_LIST_CARDS, 'card'),
    sort: oneOf(a.sort, TASK_LIST_SORTS, 'sort'),
    type: nameOf(a.type, TASK_TYPE_NAME_MAX_LENGTH, 'type'),
    column: nameOf(a.column, COLUMN_NAME_MAX_LENGTH, 'column'),
    state: oneOf(a.state, TASK_STATES, 'state'),
    priority: oneOf(a.priority, ['LOW', 'MEDIUM', 'HIGH'] as const, 'priority'),
    epicId: idOf(a.epicId, 'epicId'),
    sprintId: idOf(a.sprintId, 'sprintId'),
    agentId: idOf(a.agentId, 'agentId'),
    optionId: idOf(a.optionId, 'optionId'),
    projectId: idOf(a.projectId, 'projectId'),
    archived: a.archived === true,
    search: search || undefined,
    limit: Math.min(limit, MAX_LIMIT),
  }
}
