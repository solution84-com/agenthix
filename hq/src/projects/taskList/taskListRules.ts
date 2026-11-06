/**
 * The task lists' rules (T7), for a project's Tasks and for Your tasks: where each task stands for the person reading
 * (its scorecard), the orders it can be sorted in, and the counts the scorecards show. Pure: the query reads the rows
 * and hands them here. The words a row shows come from `taskStateWords` in @agenthix/ui; taskListRules.test.ts holds
 * the two to the same answer.
 */
import { MANIFEST_BLOCKED_REASON, NO_AGENT_REASON } from '../../agents/taskExecutionReasons'

export const TASK_LIST_CARDS = ['needsYou', 'running', 'waiting', 'notStarted', 'done'] as const
export type TaskListCard = (typeof TASK_LIST_CARDS)[number]

export const TASK_LIST_SORTS = ['importance', 'priority', 'planDate', 'updated', 'newest'] as const
export type TaskListSort = (typeof TASK_LIST_SORTS)[number]

/** Where a task stands for the reader; an open epic is never run, so it has no scorecard of its own. */
export type ListState =
  | { card: 'needsYou'; why: 'okay' | 'failed' | 'noAgent' }
  | { card: 'running' }
  | { card: 'waiting'; onUserId: string | null }
  | { card: 'notStarted' }
  | { card: 'done'; finished: boolean }
  | { card: null }

export type StateFields = {
  status: string
  runState: string
  runStateReason: string | null
  assignedAgentId: string | null
  /** Who answers its approvals (adr-0089). */
  onBehalfOfUserId: string
  runCount: number
  isEpic: boolean
}

const waitsToRun = (runState: string) => runState === 'RUN_QUEUED' || runState === 'RUN_THROTTLED'

/**
 * Done first, as the words say it (T1). An approval waits on the person the task is done for: the reader's own is
 * theirs to give, anyone else's is Waiting, on them. Any other stop for a person is a failure, which anyone working
 * in the project may run again. A task whose latest run ended and that no one has moved to a done column is Finished,
 * counted with Done.
 */
export function listStateOf(t: StateFields, viewerId: string): ListState {
  if (t.status === 'DONE') return { card: 'done', finished: false }
  if (t.isEpic) return { card: null }
  if (t.runState === 'RUN_BLOCKED' && t.runStateReason?.startsWith(MANIFEST_BLOCKED_REASON)) {
    return t.onBehalfOfUserId === viewerId ? { card: 'needsYou', why: 'okay' } : { card: 'waiting', onUserId: t.onBehalfOfUserId }
  }
  if (t.runState === 'RUN_BLOCKED' || t.runState === 'RUN_FAILED') return { card: 'needsYou', why: 'failed' }
  if (!t.assignedAgentId && (waitsToRun(t.runState) || (t.runState === 'RUN_NONE' && t.runStateReason === NO_AGENT_REASON))) {
    return { card: 'needsYou', why: 'noAgent' }
  }
  if (t.runState === 'RUN_ACTIVE') return { card: 'running' }
  if (waitsToRun(t.runState)) return { card: 'waiting', onUserId: null }
  if (t.runCount > 0) return { card: 'done', finished: true }
  return { card: 'notStarted' }
}

/** Importance: what needs you, then failed, running, waiting, not started, finished, done (T7 ③). */
export function importanceRank(s: ListState): number {
  switch (s.card) {
    case 'needsYou': return s.why === 'failed' ? 1 : 0
    case 'running': return 2
    case 'waiting': return 3
    case 'notStarted': return 4
    case 'done': return s.finished ? 5 : 6
    default: return 4
  }
}

const PRIORITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }

/** What sorting reads of a row: its rank by importance (an epic's is its most pressing open task's), and its dates. */
export type SortFields = {
  rank: number
  priority: string
  /** An epic's milestone date or its plan date, a task's plan date; null sorts last. */
  planDate: Date | null
  updatedAt: Date
  createdAt: Date
  number: number
}

const byRank = (a: SortFields, b: SortFields) => a.rank - b.rank
const byPriority = (a: SortFields, b: SortFields) => (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)
const byUpdated = (a: SortFields, b: SortFields) => b.updatedAt.getTime() - a.updatedAt.getTime()
const byNewest = (a: SortFields, b: SortFields) => b.createdAt.getTime() - a.createdAt.getTime() || b.number - a.number
function byPlanDate(a: SortFields, b: SortFields): number {
  if (a.planDate && b.planDate) return a.planDate.getTime() - b.planDate.getTime()
  return a.planDate ? -1 : b.planDate ? 1 : 0
}

const ORDERS: Record<TaskListSort, ((a: SortFields, b: SortFields) => number)[]> = {
  importance: [byRank, byPriority, byUpdated],
  priority: [byPriority, byRank, byUpdated],
  planDate: [byPlanDate, byRank, byPriority],
  updated: [byUpdated],
  newest: [byNewest],
}

export function compareRows(sort: TaskListSort): (a: SortFields, b: SortFields) => number {
  const order = [...ORDERS[sort], byNewest]
  return (a, b) => {
    for (const compare of order) {
      const d = compare(a, b)
      if (d !== 0) return d
    }
    return 0
  }
}

/** An epic's importance: its most pressing open task's, or Not started's when it has none open; a done epic is done. */
export function epicRank(own: ListState, children: ListState[]): number {
  if (own.card === 'done') return importanceRank(own)
  const open = children.filter(c => c.card !== 'done' && c.card !== null)
  return open.length === 0 ? importanceRank({ card: 'notStarted' }) : Math.min(...open.map(importanceRank))
}

export type TaskListCounts = {
  all: number
  needsYou: { count: number; okay: number; failed: number; noAgent: number }
  running: { count: number }
  /** `on`: tasks waiting on someone else's okay, by that person, most first. */
  waiting: { count: number; on: { userId: string; count: number }[] }
  notStarted: { count: number }
  /** `finished`: of them, those whose run ended and are not in a done column yet. */
  done: { count: number; finished: number }
}

/** The scorecards' counts over these rows; All counts every row, epics too, while a card counts what stands there. */
export function countRows(states: ListState[]): TaskListCounts {
  const c: TaskListCounts = {
    all: states.length,
    needsYou: { count: 0, okay: 0, failed: 0, noAgent: 0 },
    running: { count: 0 },
    waiting: { count: 0, on: [] },
    notStarted: { count: 0 },
    done: { count: 0, finished: 0 },
  }
  const on = new Map<string, number>()
  for (const s of states) {
    if (s.card === 'needsYou') { c.needsYou.count++; c.needsYou[s.why]++ }
    else if (s.card === 'running') c.running.count++
    else if (s.card === 'waiting') {
      c.waiting.count++
      if (s.onUserId) on.set(s.onUserId, (on.get(s.onUserId) ?? 0) + 1)
    } else if (s.card === 'notStarted') c.notStarted.count++
    else if (s.card === 'done') { c.done.count++; if (s.finished) c.done.finished++ }
  }
  c.waiting.on = [...on].map(([userId, count]) => ({ userId, count })).sort((a, b) => b.count - a.count)
  return c
}

/** "WEB-12", "web-12" or "12": the task number a search names, when it names one. */
export function searchedNumber(search: string, projectKey: string): number | null {
  const m = /^(?:([a-z][a-z0-9]*)-)?(\d{1,9})$/i.exec(search.trim())
  if (!m) return null
  if (m[1] && m[1].toUpperCase() !== projectKey.toUpperCase()) return null
  return Number(m[2])
}

/** A title or key matches the search: words anywhere in the title, or the task's key or number. */
export function matchesSearch(row: { title: string; number: number; projectKey: string }, search: string): boolean {
  const q = search.trim().toLowerCase()
  if (!q) return true
  return row.title.toLowerCase().includes(q) || searchedNumber(q, row.projectKey) === row.number
}
