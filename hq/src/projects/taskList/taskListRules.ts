/**
 * The task lists' rules (spec T1–T3, D2, D14), for a project's Tasks and for Your tasks: the scorecard each task
 * counts under (its task state, and whether it is late or has no agent), the orders a list can be sorted in, and the
 * counts. Never a run state: what an agent is doing is the avatar's ring, and what needs the person is in Runs (D9).
 * Pure: the query reads the rows and hands them here.
 */
import { compareRanks, type TaskState } from '@agenthix/core'

export const TASK_LIST_CARDS = ['backlog', 'todo', 'inProgress', 'done', 'late', 'noAgent'] as const
export type TaskListCard = (typeof TASK_LIST_CARDS)[number]

export const TASK_LIST_SORTS = ['rank', 'priority', 'due', 'updated', 'newest'] as const
export type TaskListSort = (typeof TASK_LIST_SORTS)[number]

const STATE_CARD: Record<TaskState, TaskListCard> = { BACKLOG: 'backlog', TODO: 'todo', IN_PROGRESS: 'inProgress', DONE: 'done' }

/** What a card and the counts read of a row. */
export type CardFields = {
  state: TaskState
  /** `YYYY-MM-DD`, the day it is due; null when it has none. */
  due: string | null
  agentId: string | null
}

/** Late: due before today and not done. `today` is `YYYY-MM-DD` in the reader's day. */
export function isLate(r: CardFields, today: string): boolean {
  return r.state !== 'DONE' && r.due !== null && r.due < today
}

/** No agent: open work nobody's agent holds. A done task needs none. */
export function hasNoAgent(r: CardFields): boolean {
  return r.state !== 'DONE' && !r.agentId
}

export function onCard(r: CardFields, card: TaskListCard, today: string): boolean {
  if (card === 'late') return isLate(r, today)
  if (card === 'noAgent') return hasNoAgent(r)
  return STATE_CARD[r.state] === card
}

export type TaskListCounts = { all: number } & Record<TaskListCard, number>

/** The scorecards' counts over these rows: All, each task state, Late and No agent. */
export function countRows(rows: CardFields[], today: string): TaskListCounts {
  const c: TaskListCounts = { all: rows.length, backlog: 0, todo: 0, inProgress: 0, done: 0, late: 0, noAgent: 0 }
  for (const r of rows) {
    c[STATE_CARD[r.state]]++
    if (isLate(r, today)) c.late++
    if (hasNoAgent(r)) c.noAgent++
  }
  return c
}

const PRIORITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }

/** What sorting reads of a row. */
export type SortFields = {
  /** Its place in the project's one order; null (not placed yet) sorts last. */
  rank: string | null
  priority: string
  due: string | null
  updatedAt: Date
  createdAt: Date
  number: number
}

function byRank(a: SortFields, b: SortFields): number {
  if (a.rank !== null && b.rank !== null) return compareRanks(a.rank, b.rank)
  return a.rank !== null ? -1 : b.rank !== null ? 1 : 0
}
const byPriority = (a: SortFields, b: SortFields) => (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)
const byUpdated = (a: SortFields, b: SortFields) => b.updatedAt.getTime() - a.updatedAt.getTime()
const byNewest = (a: SortFields, b: SortFields) => b.createdAt.getTime() - a.createdAt.getTime() || b.number - a.number
function byDue(a: SortFields, b: SortFields): number {
  if (a.due && b.due) return a.due < b.due ? -1 : a.due > b.due ? 1 : 0
  return a.due ? -1 : b.due ? 1 : 0
}
const byNumber = (a: SortFields, b: SortFields) => a.number - b.number

const ORDERS: Record<TaskListSort, ((a: SortFields, b: SortFields) => number)[]> = {
  rank: [byRank, byNumber],
  priority: [byPriority, byRank],
  due: [byDue, byRank],
  updated: [byUpdated],
  newest: [byNewest],
}

export function compareRows(sort: TaskListSort): (a: SortFields, b: SortFields) => number {
  const order = [...ORDERS[sort], byNumber]
  return (a, b) => {
    for (const compare of order) {
      const d = compare(a, b)
      if (d !== 0) return d
    }
    return 0
  }
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
