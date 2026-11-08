/**
 * One page of a task list from the rows it may show: the filters, then the counts (which follow every filter but the
 * chosen scorecard), then the scorecard, the order and the page. Pure; the query reads the rows.
 */
import { compareRows, countRows, matchesSearch, onCard, type CardFields, type SortFields, type TaskListCounts } from './taskListRules'
import type { TaskListArgs } from './taskListArgs'

/** A row as the page works it out: what the filters read, its card and how it sorts. */
export type ListedRow = SortFields & CardFields & {
  id: string
  title: string
  projectId: string
  projectKey: string
  typeName: string
  columnName: string
  epicId: string | null
  sprintId: string | null
  optionIds: string[]
}

function passes(r: ListedRow, a: TaskListArgs): boolean {
  if (a.type && r.typeName !== a.type) return false
  if (a.column && r.columnName !== a.column) return false
  if (a.state && r.state !== a.state) return false
  if (a.epicId && r.epicId !== a.epicId) return false
  if (a.sprintId && r.sprintId !== a.sprintId) return false
  if (a.agentId && r.agentId !== a.agentId) return false
  if (a.priority && r.priority !== a.priority) return false
  if (a.optionId && !r.optionIds.includes(a.optionId)) return false
  if (a.projectId && r.projectId !== a.projectId) return false
  return !a.search || matchesSearch({ title: r.title, number: r.number, projectKey: r.projectKey }, a.search)
}

/** `today` is `YYYY-MM-DD`: what Late is measured against. */
export function pageOf<R extends ListedRow>(rows: R[], a: TaskListArgs, today: string, defaultSort: NonNullable<TaskListArgs['sort']>): {
  rows: R[]; hasMore: boolean; counts: TaskListCounts
} {
  const filtered = rows.filter(r => passes(r, a))
  const counts = countRows(filtered, today)
  const card = a.card
  const chosen = card ? filtered.filter(r => onCard(r, card, today)) : filtered
  const sorted = [...chosen].sort(compareRows(a.sort ?? defaultSort))
  const limit = a.limit ?? sorted.length
  return { rows: sorted.slice(0, limit), hasMore: sorted.length > limit, counts }
}
