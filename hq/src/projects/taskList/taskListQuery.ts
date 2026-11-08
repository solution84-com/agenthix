/**
 * The two task lists (spec T1–T5, Y1): a project's Tasks (`getTaskList`) and Your tasks (`getMyTaskList`), each one
 * query with its filters, order, scorecard counts and paging. A list holds what is open and what was done in the
 * last 30 days; with Archived, the archived tasks instead. Your tasks is the person's planned work: the tasks whose
 * *For* is them (ADR-0095), in every project they may see, epics aside (D9). What needs the person is in Runs.
 */
import { HttpError, prisma } from 'wasp/server'
import type { GetTaskList, GetMyTaskList } from 'wasp/server/operations'
import type { Prisma } from '@prisma/client'
import { TASK_STATE_LABELS, type ExecutionState, type TaskTypeKind } from '@agenthix/core'
import { entitledProjectsFilter } from '../membership'
import { requireProjectVisible } from '../resourceEntitlement'
import { withDisplayReasons } from '../taskReasonDisplay'
import { DONE_WINDOW_MS } from '../myTasksQueries'
import { parseTaskListArgs, type ProjectTaskListArgs, type TaskListArgs } from './taskListArgs'
import { isLate } from './taskListRules'
import { pageOf, type ListedRow } from './taskListPage'
import type { TaskListFieldOption, TaskListOption, TaskListPageWire, TaskListRowWire } from './taskListWire'

const SELECT = {
  id: true, number: true, title: true, priority: true, state: true, executionState: true, runState: true,
  runStateReason: true, rank: true, epicId: true, sprintId: true, projectId: true, assignedAgentId: true,
  planFinish: true, createdAt: true, updatedAt: true,
  type: { select: { name: true, icon: true, kind: true } },
  typeColumn: { select: { id: true, name: true } },
  assignedAgent: { select: { id: true, name: true, handle: true } },
  epic: { select: { id: true, title: true } },
  sprint: { select: { id: true, number: true, name: true } },
  milestone: { select: { date: true } },
  project: { select: { id: true, key: true, name: true } },
  fieldValues: { select: { fieldId: true, optionId: true, option: { select: { name: true } } } },
} satisfies Prisma.TaskSelect

type Row = Prisma.TaskGetPayload<{ select: typeof SELECT }>
type Listed = ListedRow & { row: Row }

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** The reader's day, as the browser says it; else the server's, in UTC. Only Late reads it. */
function todayOf(raw: unknown): string {
  const given = (raw as { today?: unknown } | null)?.today
  return typeof given === 'string' && DAY.test(given) ? given : new Date().toISOString().slice(0, 10)
}

export const getTaskList: GetTaskList<ProjectTaskListArgs & { today?: string }, TaskListPageWire> = async (raw, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const projectId = (raw as { projectId?: unknown } | null)?.projectId
  if (typeof projectId !== 'string' || !projectId) throw new HttpError(400, 'projectId is required. Nothing was changed.')
  const args = parseTaskListArgs(raw)
  await requireProjectVisible(projectId, context.user.id)
  return readTaskList({ projectId }, args, todayOf(raw), projectId)
}

export const getMyTaskList: GetMyTaskList<(TaskListArgs & { today?: string }) | void, TaskListPageWire> = async (raw, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const args = parseTaskListArgs(raw)
  const me = context.user.id
  return readTaskList({ onBehalfOfUserId: me, NOT: { type: { is: { kind: 'EPIC' } } }, project: entitledProjectsFilter(me) }, args, todayOf(raw), null)
}

const dayOf = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)
const sprintName = (s: { number: number; name: string | null }) => s.name || `Sprint ${s.number}`

/** A task written before its type was is a Task. */
function typeOf(row: Row): { name: string; icon: string; kind: TaskTypeKind } {
  if (row.type) return { name: row.type.name, icon: row.type.icon, kind: row.type.kind }
  return { name: 'Task', icon: 'task', kind: 'TASK' }
}

/** `projectId` is the project a project's list is of: only then are its custom fields read. */
async function readTaskList(scope: Prisma.TaskWhereInput, args: TaskListArgs, today: string, projectId: string | null): Promise<TaskListPageWire> {
  const since = new Date(Date.now() - DONE_WINDOW_MS)
  const where: Prisma.TaskWhereInput = args.archived
    ? { ...scope, archived: true }
    : { ...scope, archived: false, OR: [{ state: { not: 'DONE' } }, { doneAt: { gte: since } }] }
  const rows = await prisma.task.findMany({ where, select: SELECT })

  const epicIds = rows.filter(r => typeOf(r).kind === 'EPIC').map(r => r.id)
  const children = epicIds.length === 0 ? [] : await prisma.task.findMany({
    where: { epicId: { in: epicIds }, archived: false }, select: { epicId: true, state: true },
  })
  const progress = new Map<string, NonNullable<TaskListRowWire['progress']>>()
  for (const c of children) {
    const p = progress.get(c.epicId!) ?? { done: 0, total: 0, backlog: 0, todo: 0, inProgress: 0 }
    p.total++
    if (c.state === 'DONE') p.done++
    else if (c.state === 'BACKLOG') p.backlog++
    else if (c.state === 'TODO') p.todo++
    else p.inProgress++
    progress.set(c.epicId!, p)
  }

  const listed = rows.map(listedOf)
  const page = pageOf(listed, args, today, projectId ? 'rank' : 'due')
  const pageRows = await withDisplayReasons(page.rows.map(r => r.row))

  return {
    rows: pageRows.map((row, i) => rowWire(row, page.rows[i], today, progress.get(row.id) ?? null)),
    hasMore: page.hasMore,
    total: listed.length,
    counts: page.counts,
    options: { ...optionsOf(listed), fields: projectId ? await fieldsOf(projectId) : [] },
  }
}

function listedOf(row: Row): Listed {
  const type = typeOf(row)
  const due = dayOf((type.kind === 'EPIC' ? row.milestone?.date : null) ?? row.planFinish)
  return {
    row, id: row.id, title: row.title, number: row.number, projectId: row.projectId, projectKey: row.project.key,
    typeName: type.name, columnName: row.typeColumn?.name ?? TASK_STATE_LABELS[row.state],
    state: row.state, due, agentId: row.assignedAgentId, epicId: row.epicId, sprintId: row.sprintId,
    optionIds: row.fieldValues.map(v => v.optionId), priority: row.priority, rank: row.rank,
    updatedAt: row.updatedAt, createdAt: row.createdAt,
  }
}

const RING_DETAIL = new Set<ExecutionState>(['NEEDS_YOU', 'FAILED', 'WAITING'])

function rowWire(row: Row, listed: Listed, today: string, progress: TaskListRowWire['progress']): TaskListRowWire {
  const type = typeOf(row)
  return {
    id: row.id, key: `${row.project.key}-${row.number}`, number: row.number, title: row.title, priority: row.priority,
    state: row.state, executionState: row.executionState, type,
    column: { id: row.typeColumn?.id ?? null, name: listed.columnName },
    project: row.project, agent: row.assignedAgent,
    runDetail: RING_DETAIL.has(row.executionState) ? row.runStateReason : null,
    epic: row.epic, sprint: row.sprint ? { id: row.sprint.id, name: sprintName(row.sprint) } : null,
    due: listed.due, late: isLate(listed, today),
    fields: Object.fromEntries(row.fieldValues.map(v => [v.fieldId, { optionId: v.optionId, name: v.option.name }])),
    updatedAt: row.updatedAt.toISOString(), createdAt: row.createdAt.toISOString(),
    progress: type.kind === 'EPIC' ? (progress ?? { done: 0, total: 0, backlog: 0, todo: 0, inProgress: 0 }) : null,
  }
}

/** A project's single-select fields, with their options, in their order: the Fields menu and the field filter. */
async function fieldsOf(projectId: string): Promise<TaskListFieldOption[]> {
  const fields = await prisma.customField.findMany({
    where: { projectId, archivedAt: null }, orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, options: { select: { id: true, name: true }, orderBy: { order: 'asc' } } },
  })
  return fields
}

const byName = (a: TaskListOption, b: TaskListOption) => a.name.localeCompare(b.name)
function distinct(pairs: [string, string][]): TaskListOption[] {
  return [...new Map(pairs)].map(([id, name]) => ({ id, name })).sort(byName)
}
const named = (names: string[]) => distinct(names.map(n => [n, n]))

/** What each filter offers: the values the list's rows hold, before any filter. */
function optionsOf(listed: Listed[]): Omit<TaskListPageWire['options'], 'fields'> {
  return {
    types: named(listed.map(r => r.typeName)),
    columns: named(listed.map(r => r.columnName)),
    epics: distinct(listed.flatMap(r => (typeOf(r.row).kind === 'EPIC' ? [[r.id, r.title] as [string, string]] : r.row.epic ? [[r.row.epic.id, r.row.epic.title] as [string, string]] : []))),
    sprints: distinct(listed.flatMap(r => (r.row.sprint ? [[r.row.sprint.id, sprintName(r.row.sprint)] as [string, string]] : []))),
    agents: distinct(listed.flatMap(r => (r.row.assignedAgent ? [[r.row.assignedAgent.id, r.row.assignedAgent.name] as [string, string]] : []))),
    projects: distinct(listed.map(r => [r.projectId, r.row.project.name] as [string, string])),
  }
}
