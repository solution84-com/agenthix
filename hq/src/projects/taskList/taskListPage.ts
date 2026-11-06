/**
 * One page of a task list from the rows it may show: the filters, then the counts (which follow every filter but the
 * chosen scorecard), then the scorecard, the order and the page. Pure; the query reads the rows.
 */
import { compareRows, countRows, matchesSearch, type ListState, type SortFields, type TaskListCounts } from './taskListRules'
import type { TaskListArgs } from './taskListArgs'

/** A row as the page works it out: what the filters read, where it stands, and how it sorts. */
export type ListedRow = SortFields & {
  id: string
  title: string
  projectId: string
  projectKey: string
  isEpic: boolean
  epicId: string | null
  agentId: string | null
  boardId: string
  queuedByUserId: string | null
  state: ListState
}

function passes(r: ListedRow, a: TaskListArgs): boolean {
  if (a.type === 'task' && r.isEpic) return false
  if (a.type === 'epic' && !r.isEpic) return false
  if (a.epicId && r.epicId !== a.epicId) return false
  if (a.agentId && r.agentId !== a.agentId) return false
  if (a.boardId && r.boardId !== a.boardId) return false
  if (a.priority && r.priority !== a.priority) return false
  if (a.queuedByUserId && r.queuedByUserId !== a.queuedByUserId) return false
  if (a.waitingOnUserId && !(r.state.card === 'waiting' && r.state.onUserId === a.waitingOnUserId)) return false
  if (a.projectId && r.projectId !== a.projectId) return false
  return !a.search || matchesSearch({ title: r.title, number: r.number, projectKey: r.projectKey }, a.search)
}

export function pageOf<R extends ListedRow>(rows: R[], a: TaskListArgs): { rows: R[]; hasMore: boolean; counts: TaskListCounts } {
  const filtered = rows.filter(r => passes(r, a))
  const counts = countRows(filtered.map(r => r.state))
  const chosen = a.card ? filtered.filter(r => r.state.card === a.card) : filtered
  const sorted = [...chosen].sort(compareRows(a.sort ?? 'importance'))
  const limit = a.limit ?? sorted.length
  return { rows: sorted.slice(0, limit), hasMore: sorted.length > limit, counts }
}
