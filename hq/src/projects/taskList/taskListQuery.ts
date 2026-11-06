/**
 * The two task lists (T7): a project's Tasks (`getTaskList`) and Your tasks (`getMyTaskList`), each one query with
 * its filters, order, scorecard counts and paging. A list holds what is open and what was finished in the last 30
 * days; with Archived, the archived tasks instead. Your tasks holds only the tasks done on the reader's behalf that
 * need them or run for them: not one that has never run, and no epic, which is never run.
 */
import { HttpError, prisma } from 'wasp/server'
import type { GetTaskList, GetMyTaskList } from 'wasp/server/operations'
import type { Prisma } from '@prisma/client'
import { entitledProjectsFilter } from '../membership'
import { requireProjectVisible } from '../resourceEntitlement'
import { withDisplayReasons } from '../taskReasonDisplay'
import { usernames } from '../onBehalfOfOperations'
import { wireColumns } from '../boardColumns'
import { DONE_WINDOW_MS } from '../myTasksQueries'
import { parseTaskListArgs, type ProjectTaskListArgs, type TaskListArgs } from './taskListArgs'
import { epicRank, importanceRank, listStateOf, type ListState } from './taskListRules'
import { pageOf, type ListedRow } from './taskListPage'
import type { TaskListOption, TaskListPageWire, TaskListRowWire } from './taskListWire'

const SELECT = {
  id: true, number: true, title: true, priority: true, status: true, runState: true, runStateReason: true,
  assignedAgentId: true, onBehalfOfUserId: true, runCount: true, isEpic: true, epicId: true, column: true,
  boardId: true, projectId: true, queuedByUserId: true, queuedByAgentId: true, lastWorkedAt: true,
  planStart: true, planFinish: true, createdAt: true, updatedAt: true,
  assignedAgent: { select: { id: true, name: true, handle: true } },
  board: { select: { id: true, name: true, columns: true } },
  epic: { select: { id: true, title: true } },
  milestone: { select: { name: true, date: true } },
  project: { select: { id: true, key: true, name: true } },
} satisfies Prisma.TaskSelect

type Row = Prisma.TaskGetPayload<{ select: typeof SELECT }>
type Listed = ListedRow & { row: Row }

const CHILD_SELECT = {
  epicId: true, status: true, runState: true, runStateReason: true, assignedAgentId: true, onBehalfOfUserId: true,
  runCount: true, isEpic: true,
} satisfies Prisma.TaskSelect

export const getTaskList: GetTaskList<ProjectTaskListArgs, TaskListPageWire> = async (raw, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const projectId = (raw as { projectId?: unknown } | null)?.projectId
  if (typeof projectId !== 'string' || !projectId) throw new HttpError(400, 'projectId is required. Nothing was changed.')
  const args = parseTaskListArgs(raw)
  await requireProjectVisible(projectId, context.user.id)
  return readTaskList({ projectId }, args, context.user.id, false)
}

export const getMyTaskList: GetMyTaskList<TaskListArgs | void, TaskListPageWire> = async (raw, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const args = parseTaskListArgs(raw)
  const me = context.user.id
  return readTaskList({ onBehalfOfUserId: me, isEpic: false, project: entitledProjectsFilter(me) }, args, me, true)
}

async function readTaskList(scope: Prisma.TaskWhereInput, args: TaskListArgs, me: string, mine: boolean): Promise<TaskListPageWire> {
  const since = new Date(Date.now() - DONE_WINDOW_MS)
  const where: Prisma.TaskWhereInput = args.archived
    ? { ...scope, archived: true }
    : { ...scope, archived: false, OR: [{ status: { not: 'DONE' } }, { doneAt: { gte: since } }] }
  const rows = await prisma.task.findMany({ where, select: SELECT })

  const epicIds = rows.filter(r => r.isEpic).map(r => r.id)
  const children = epicIds.length === 0 ? [] : await prisma.task.findMany({
    where: { epicId: { in: epicIds }, archived: false }, select: CHILD_SELECT,
  })
  const childStates = new Map<string, ListState[]>()
  for (const c of children) {
    const list = childStates.get(c.epicId!) ?? []
    list.push(listStateOf(c, me))
    childStates.set(c.epicId!, list)
  }

  const listed: Listed[] = rows
    .map(row => listedOf(row, me, childStates.get(row.id) ?? []))
    // Your tasks: what needs the reader or runs for them, so a task never run is not theirs to see here.
    .filter(r => !mine || (r.state.card !== 'notStarted' && r.state.card !== null))
  const page = pageOf(listed, args)

  const pageRows = await withDisplayReasons(page.rows.map(r => r.row))
  const userIds = new Set<string>()
  for (const r of listed) {
    if (r.queuedByUserId) userIds.add(r.queuedByUserId)
    if (r.state.card === 'waiting' && r.state.onUserId) userIds.add(r.state.onUserId)
  }
  const names = await usernames([...userIds])
  const agentNames = await queuingAgentNames(pageRows)
  const multiBoard = await projectsWithBoards(rows)

  return {
    rows: pageRows.map((row, i) => rowWire(row, page.rows[i].state, me, {
      names, agentNames, showBoard: multiBoard.has(row.projectId), children: childStates.get(row.id) ?? null,
    })),
    hasMore: page.hasMore,
    counts: {
      ...page.counts,
      waitingOn: page.counts.waiting.on.map(o => ({ name: names.get(o.userId) ?? 'someone', count: o.count })),
    },
    options: optionsOf(listed, names, await boardsOf(rows, mine)),
  }
}

function listedOf(row: Row, me: string, children: ListState[]): Listed {
  const state = listStateOf(row, me)
  return {
    row, state, id: row.id, title: row.title, number: row.number, projectId: row.projectId, projectKey: row.project.key,
    isEpic: row.isEpic, epicId: row.epicId, agentId: row.assignedAgentId, boardId: row.boardId,
    queuedByUserId: row.queuedByUserId, priority: row.priority,
    rank: row.isEpic ? epicRank(state, children) : importanceRank(state),
    planDate: (row.isEpic ? row.milestone?.date : null) ?? row.planFinish ?? row.planStart,
    updatedAt: row.updatedAt, createdAt: row.createdAt,
  }
}

function columnLabel(row: Row): string | null {
  if (!row.column) return null
  return wireColumns(row.board.columns).find(c => c.name === row.column)?.label ?? row.column
}

function rowWire(row: Row, state: ListState, me: string, ctx: {
  names: Map<string, string>; agentNames: Map<string, string>; showBoard: boolean; children: ListState[] | null
}): TaskListRowWire {
  const queuedBy = row.queuedByUserId
    ? (row.queuedByUserId === me ? { you: true as const } : { you: false as const, name: ctx.names.get(row.queuedByUserId) ?? 'someone' })
    : row.queuedByAgentId && ctx.agentNames.has(row.queuedByAgentId) ? { you: false as const, name: ctx.agentNames.get(row.queuedByAgentId)! } : null
  const waitsOn: TaskListRowWire['waitsOn'] = state.card === 'needsYou' && state.why === 'okay'
    ? { what: 'okay', who: 'you' }
    : state.card === 'waiting' && state.onUserId ? { what: 'okay', who: { name: ctx.names.get(state.onUserId) ?? 'someone' } } : null
  const epicAt = row.isEpic ? (row.milestone?.date ?? row.planFinish ?? row.planStart) : null
  return {
    id: row.id, key: `${row.project.key}-${row.number}`, number: row.number, title: row.title,
    priority: row.priority, status: row.status, runState: row.runState, runStateReason: row.runStateReason,
    isEpic: row.isEpic, columnLabel: columnLabel(row), board: { id: row.board.id, name: row.board.name },
    showBoard: ctx.showBoard, project: row.project, agent: row.assignedAgent, epic: row.epic, queuedBy, waitsOn,
    waitsForAgent: state.card === 'needsYou' && state.why === 'noAgent',
    latestRunCompleted: row.runCount > 0,
    workingSince: row.runState === 'RUN_ACTIVE' ? (row.lastWorkedAt ?? row.updatedAt).toISOString() : null,
    updatedAt: row.updatedAt.toISOString(), createdAt: row.createdAt.toISOString(),
    epicDate: epicAt ? { milestone: row.milestone?.date ? row.milestone.name : null, at: epicAt.toISOString() } : null,
    progress: row.isEpic && ctx.children ? {
      total: ctx.children.length,
      done: ctx.children.filter(c => c.card === 'done' && !c.finished).length,
      needsYou: ctx.children.filter(c => c.card === 'needsYou').length,
    } : null,
  }
}

async function queuingAgentNames(rows: Row[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.flatMap(r => (r.queuedByUserId || !r.queuedByAgentId ? [] : [r.queuedByAgentId])))]
  if (ids.length === 0) return new Map()
  const agents = await prisma.agent.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
  return new Map(agents.map(a => [a.id, a.name]))
}

/** The projects with more than one board in use: only there does a row name its board. */
async function projectsWithBoards(rows: Row[]): Promise<Set<string>> {
  const projectIds = [...new Set(rows.map(r => r.projectId))]
  if (projectIds.length === 0) return new Set()
  const counts = await prisma.board.groupBy({
    by: ['projectId'], where: { projectId: { in: projectIds }, archivedAt: null }, _count: { _all: true },
  })
  return new Set(counts.filter(c => c._count._all > 1).map(c => c.projectId))
}

/** A project's boards, for the Board filter; Your tasks has none. */
async function boardsOf(rows: Row[], mine: boolean): Promise<TaskListOption[]> {
  if (mine || rows.length === 0) return []
  const boards = await prisma.board.findMany({
    where: { projectId: rows[0].projectId, archivedAt: null }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' },
  })
  return boards
}

const byName = (a: TaskListOption, b: TaskListOption) => a.name.localeCompare(b.name)
function distinct(pairs: [string, string][]): TaskListOption[] {
  return [...new Map(pairs)].map(([id, name]) => ({ id, name })).sort(byName)
}

/** What each filter offers: the values the list's rows hold, before any filter. */
function optionsOf(listed: Listed[], names: Map<string, string>, boards: TaskListOption[]): TaskListPageWire['options'] {
  return {
    agents: distinct(listed.flatMap(r => (r.row.assignedAgent ? [[r.row.assignedAgent.id, r.row.assignedAgent.name] as [string, string]] : []))),
    boards,
    epics: distinct(listed.flatMap(r => (r.isEpic ? [[r.id, r.title] as [string, string]] : r.row.epic ? [[r.row.epic.id, r.row.epic.title] as [string, string]] : []))),
    queuedBy: distinct(listed.flatMap(r => (r.queuedByUserId ? [[r.queuedByUserId, names.get(r.queuedByUserId) ?? 'someone'] as [string, string]] : []))),
    waitingOn: distinct(listed.flatMap(r => (r.state.card === 'waiting' && r.state.onUserId ? [[r.state.onUserId, names.get(r.state.onUserId) ?? 'someone'] as [string, string]] : []))),
    projects: distinct(listed.map(r => [r.projectId, r.row.project.name] as [string, string])),
  }
}
