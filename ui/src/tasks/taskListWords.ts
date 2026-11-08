/**
 * What a task list says (spec T1–T3, Y1): its scorecards, its sorts, the chips of its filters in use, and each line's
 * quiet words and due date. Pure, so each is tested as words.
 */
import { TASK_STATE_LABELS, TASK_STATES, type TaskState } from '@agenthix/core'
import { dayLabel } from '../primitives/DateField'
import type {
  TaskListCard, TaskListCounts, TaskListFilters, TaskListKind, TaskListPageData, TaskListRow, TaskListSort,
} from './taskListTypes'

export type Scorecard = { card: TaskListCard | null; label: string; count: number; detail: string | null }

/** A line under a list's title only while it is narrowed: "4 of 33 tasks". */
export function narrowedLine(narrowed: { shown: number; total: number } | null): string | null {
  if (!narrowed) return null
  return `${narrowed.shown} of ${narrowed.total} task${narrowed.total === 1 ? '' : 's'}`
}

/** The counts before a list is read: the scorecards keep their place, each count shown as "…". */
export const NO_COUNTS: TaskListCounts = { all: 0, backlog: 0, todo: 0, inProgress: 0, done: 0, late: 0, noAgent: 0 }

/** How many rows a list shows for its scorecard: the card's count, or every row its filters let through. */
export function shownCount(c: TaskListCounts, card: TaskListCard | null): number {
  return card ? c[card] : c.all
}

/**
 * The cards (T1): All, then the task states with Backlog first (D11), then Late and No agent. Your tasks has no No
 * agent card, since its tasks are the person's own to plan; and no run state is ever a card (D9).
 */
export function scorecardsOf(c: TaskListCounts, kind: TaskListKind): Scorecard[] {
  const project = kind === 'project'
  const cards: Scorecard[] = [
    { card: null, label: 'All', count: c.all, detail: project ? 'in this project' : 'for you' },
    { card: 'backlog', label: 'Backlog', count: c.backlog, detail: project ? 'not committed yet' : null },
    { card: 'todo', label: 'To do', count: c.todo, detail: null },
    { card: 'inProgress', label: 'In progress', count: c.inProgress, detail: null },
    { card: 'done', label: 'Done', count: c.done, detail: 'last 30 days' },
    { card: 'late', label: 'Late', count: c.late, detail: project ? 'past its due date' : null },
    { card: 'noAgent', label: 'No agent', count: c.noAgent, detail: null },
  ]
  return project ? cards : cards.filter(s => s.card !== 'noAgent')
}

export type TaskSortChoice = { sort: TaskListSort; label: string; hint?: string }

/**
 * The orders each list offers (T3, D14): a project's Tasks by its one rank first; Your tasks by due date, with no
 * Rank, since each project has its own.
 */
export const SORTS: Record<TaskListKind, TaskSortChoice[]> = {
  project: [
    { sort: 'rank', label: 'Rank', hint: 'Your order, the same on every board' },
    { sort: 'priority', label: 'Priority', hint: 'High first' },
    { sort: 'due', label: 'Due date', hint: 'Soonest first; no date last' },
    { sort: 'updated', label: 'Recently updated' },
    { sort: 'newest', label: 'Newest' },
  ],
  mine: [
    { sort: 'due', label: 'Due date', hint: 'Soonest first; no date last; broken by when' },
    { sort: 'priority', label: 'Priority', hint: 'High first' },
    { sort: 'updated', label: 'Recently updated' },
    { sort: 'newest', label: 'Newest' },
  ],
}

export const DEFAULT_SORT: Record<TaskListKind, TaskListSort> = { project: 'rank', mine: 'due' }

/** A filter: a fixed one, or one custom field's options (`field:<id>`). */
export type FilterKind = 'type' | 'column' | 'state' | 'epic' | 'sprint' | 'agent' | 'priority' | 'project' | 'archived' | `field:${string}`

const FIXED_LABEL: Record<Exclude<FilterKind, `field:${string}`>, string> = {
  type: 'Type', column: 'Column', state: 'Task state', epic: 'Epic', sprint: 'Sprint', agent: 'Agent', priority: 'Priority',
  project: 'Project', archived: 'Archived',
}

const isField = (k: FilterKind): k is `field:${string}` => k.startsWith('field:')
const fieldOf = (k: `field:${string}`, options: TaskListPageData['options']) => options.fields.find(f => `field:${f.id}` === k)

export function filterLabel(k: FilterKind, options: TaskListPageData['options']): string {
  return isField(k) ? fieldOf(k, options)?.name ?? 'Field' : FIXED_LABEL[k]
}

/** The filters each list offers under ＋ Filter (T3): a project's custom fields after its own, Archived last. */
export function filterKindsOf(kind: TaskListKind, options: TaskListPageData['options']): FilterKind[] {
  if (kind === 'mine') return ['project', 'type', 'column', 'epic', 'sprint', 'agent', 'priority']
  return ['type', 'column', 'state', 'epic', 'sprint', 'agent', 'priority', ...options.fields.map(f => `field:${f.id}` as const), 'archived']
}

type FilterField = Exclude<keyof TaskListFilters, 'archived'>
const FIELD_OF: Record<Exclude<FilterKind, 'archived' | `field:${string}`>, FilterField> = {
  type: 'type', column: 'column', state: 'state', epic: 'epicId', sprint: 'sprintId', agent: 'agentId',
  priority: 'priority', project: 'projectId',
}

/** The field of `TaskListFilters` a filter sets; every custom field sets `optionId`, one at a time. */
export function filterFieldOf(k: Exclude<FilterKind, 'archived'>): FilterField {
  return isField(k) ? 'optionId' : FIELD_OF[k]
}

const PRIORITY_WORD: Record<string, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' }

export type FilterChoice = { value: string; label: string }

/** What one filter can be set to: the values the list holds, or the fixed ones. */
export function filterChoices(k: FilterKind, options: TaskListPageData['options']): FilterChoice[] {
  const named = (list: { id: string; name: string }[]) => list.map(o => ({ value: o.id, label: o.name }))
  if (isField(k)) return named(fieldOf(k, options)?.options ?? [])
  switch (k) {
    case 'state': return TASK_STATES.map((s: TaskState) => ({ value: s, label: TASK_STATE_LABELS[s] }))
    case 'priority': return ['HIGH', 'MEDIUM', 'LOW'].map(p => ({ value: p, label: PRIORITY_WORD[p] }))
    case 'archived': return [{ value: 'yes', label: 'Archived tasks' }]
    case 'type': return named(options.types)
    case 'column': return named(options.columns)
    case 'epic': return named(options.epics)
    case 'sprint': return named(options.sprints)
    case 'agent': return named(options.agents)
    case 'project': return named(options.projects)
  }
}

export function withFilter(f: TaskListFilters, k: FilterKind, value: string | null): TaskListFilters {
  const next = { ...f }
  if (k === 'archived') {
    if (value) next.archived = true
    else delete next.archived
    return next
  }
  const field = filterFieldOf(k)
  if (value) (next as Record<string, unknown>)[field] = value
  else delete next[field]
  return next
}

export type FilterChip = { kind: FilterKind; label: string }

/** A chip for each filter in use, with what it is set to; a value the list no longer holds is still named. */
export function filterChips(f: TaskListFilters, kind: TaskListKind, options: TaskListPageData['options']): FilterChip[] {
  const kinds = filterKindsOf(kind, options)
  const chips = kinds.flatMap((k): FilterChip[] => {
    if (k === 'archived') return f.archived ? [{ kind: k, label: 'Archived' }] : []
    const value = f[filterFieldOf(k)]
    if (typeof value !== 'string') return []
    const choice = filterChoices(k, options).find(c => c.value === value)
    if (isField(k) && !choice) return []
    return [{ kind: k, label: `${filterLabel(k, options)}: ${choice?.label ?? 'one no longer listed'}` }]
  })
  // An option whose field is gone still shows, so it can be cleared.
  if (kind === 'project' && f.optionId && !chips.some(c => isField(c.kind))) {
    chips.push({ kind: 'field:', label: 'Field: one no longer listed' })
  }
  return chips
}

/** "just now", "12 min ago", "3 h ago", "yesterday", "4 Nov". */
export function updatedText(iso: string, now: Date): string {
  const at = new Date(iso)
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (at.getTime() >= startOfToday) return `${Math.floor(minutes / 60)} h ago`
  if (at.getTime() >= startOfToday - 24 * 60 * 60 * 1000) return 'yesterday'
  return dayLabel(at, now)
}

const tasks = (n: number) => `${n} task${n === 1 ? '' : 's'}`

/** An epic's tasks by state, for planning: "2 in progress · 1 to do", "all in Backlog", "all done". */
export function epicStateText(p: NonNullable<TaskListRow['progress']>): string | null {
  if (p.total === 0) return null
  if (p.done === p.total) return 'all done'
  if (p.backlog === p.total) return 'all in Backlog'
  return [p.inProgress && `${p.inProgress} in progress`, p.todo && `${p.todo} to do`, p.backlog && `${p.backlog} in Backlog`]
    .filter(Boolean).join(' · ') || null
}

/**
 * The quiet line under the title (T2): key · type · when it last changed; an epic's tasks after its type. While
 * planning epics (`byState`), an epic's tasks by state in place of when it changed. Your tasks leaves out when.
 */
export function rowLine(r: TaskListRow, now: Date, opts: { kind?: TaskListKind; byState?: boolean } = {}): string {
  const parts: (string | null | false)[] = [r.key, r.type.name]
  const isEpic = r.type.kind === 'EPIC'
  if (isEpic && r.progress) parts.push(tasks(r.progress.total))
  if (opts.byState && isEpic && r.progress) parts.push(epicStateText(r.progress))
  else if (opts.kind !== 'mine') parts.push(`updated ${updatedText(r.updatedAt, now)}`)
  return parts.filter(Boolean).join(' · ')
}

const dayOf = (iso: string) => new Date(`${iso}T00:00`)

/** A line's due date: "12 Nov", "Late · 6 Nov"; null when it has none. */
export function dueText(r: Pick<TaskListRow, 'due' | 'late'>, now: Date): string | null {
  if (!r.due) return null
  const day = dayLabel(dayOf(r.due), now)
  return r.late ? `Late · ${day}` : day
}

export type DueGroup = 'Late' | 'This week' | 'Next week' | 'Later' | 'No date'
export const DUE_GROUPS: readonly DueGroup[] = ['Late', 'This week', 'Next week', 'Later', 'No date']

/** Monday of the week `now` is in, at midnight. */
function weekStart(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

/**
 * Your tasks' breaks by due date (Y1): Late, This week, Next week, Later, No date. A done task dated before this week
 * is not late, and stays with this week.
 */
export function dueGroupOf(r: Pick<TaskListRow, 'due' | 'late'>, now: Date): DueGroup {
  if (!r.due) return 'No date'
  if (r.late) return 'Late'
  const next = weekStart(now)
  next.setDate(next.getDate() + 7)
  const after = new Date(next)
  after.setDate(after.getDate() + 7)
  const day = dayOf(r.due)
  if (day < next) return 'This week'
  return day < after ? 'Next week' : 'Later'
}

/** The rows in their due groups, in order, each group only when it holds a row. */
export function groupByDue<R extends Pick<TaskListRow, 'due' | 'late'>>(rows: R[], now: Date): { group: DueGroup; rows: R[] }[] {
  const by = new Map<DueGroup, R[]>()
  for (const r of rows) {
    const g = dueGroupOf(r, now)
    by.set(g, [...(by.get(g) ?? []), r])
  }
  return DUE_GROUPS.flatMap(group => (by.has(group) ? [{ group, rows: by.get(group)! }] : []))
}

/** Today in the reader's day, `YYYY-MM-DD`, as hq measures Late against it. */
export function todayText(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}
