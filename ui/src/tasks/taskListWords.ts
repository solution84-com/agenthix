/**
 * What a task list says (T7): its scorecards, the chips of its filters in use, the sorts, and each row's chips and
 * quiet line. Pure, so each is tested as words.
 */
import type {
  TaskListCard, TaskListCounts, TaskListFilters, TaskListKind, TaskListPageData, TaskListRow, TaskListSort,
} from './taskListTypes'

export type Scorecard = { card: TaskListCard | null; label: string; count: number; detail: string | null }

const joined = (parts: (string | null | false)[]) => parts.filter(Boolean).join(' · ') || null

function needsYouDetail(c: TaskListCounts['needsYou']): string | null {
  return joined([c.okay > 0 && `${c.okay} okay`, c.failed > 0 && `${c.failed} failed`, c.noAgent > 0 && `${c.noAgent} no agent`])
}

/** The cards, All first; Your tasks has no Not started, since it holds only what needs you or runs for you. */
export function scorecardsOf(c: TaskListCounts, kind: TaskListKind): Scorecard[] {
  const cards: Scorecard[] = [
    { card: null, label: 'All', count: c.all, detail: kind === 'project' ? 'in this project' : 'for you' },
    { card: 'needsYou', label: 'Needs you', count: c.needsYou.count, detail: needsYouDetail(c.needsYou) },
    { card: 'running', label: 'Running', count: c.running.count, detail: null },
    { card: 'waiting', label: 'Waiting', count: c.waiting.count, detail: joined(c.waitingOn.slice(0, 2).map(w => `${w.count} on ${w.name}`)) },
    { card: 'notStarted', label: 'Not started', count: c.notStarted.count, detail: 'no run yet' },
    { card: 'done', label: 'Done', count: c.done.count, detail: joined(['last 30 days', c.done.finished > 0 && `${c.done.finished} not moved to Done`]) },
  ]
  return kind === 'mine' ? cards.filter(s => s.card !== 'notStarted') : cards
}

export const SORTS: { sort: TaskListSort; label: string; hint: string }[] = [
  { sort: 'importance', label: 'Importance', hint: 'Needs you, failed, running, waiting, not started, done' },
  { sort: 'priority', label: 'Priority', hint: 'High first' },
  { sort: 'planDate', label: 'Plan date', hint: 'Soonest first; an epic by its milestone or plan date' },
  { sort: 'updated', label: 'Recently updated', hint: 'What changed last first' },
  { sort: 'newest', label: 'Newest', hint: 'Made last first' },
]

export const sortLabel = (sort: TaskListSort) => SORTS.find(s => s.sort === sort)?.label ?? 'Importance'

export type FilterKind = 'type' | 'epic' | 'agent' | 'board' | 'priority' | 'queuedBy' | 'waitingOn' | 'archived' | 'project'

export const FILTER_LABEL: Record<FilterKind, string> = {
  type: 'Type', epic: 'Epic', agent: 'Agent', board: 'Board', priority: 'Priority', queuedBy: 'Queued by',
  waitingOn: 'Waiting on', archived: 'Archived', project: 'Project',
}

/** The filters each list offers under ＋ Filter (T7 ④). */
export const FILTER_KINDS: Record<TaskListKind, FilterKind[]> = {
  project: ['type', 'epic', 'agent', 'board', 'priority', 'queuedBy', 'waitingOn', 'archived'],
  mine: ['project', 'agent', 'priority'],
}

const FIELD: Record<Exclude<FilterKind, 'archived'>, keyof TaskListFilters> = {
  type: 'type', epic: 'epicId', agent: 'agentId', board: 'boardId', priority: 'priority',
  queuedBy: 'queuedByUserId', waitingOn: 'waitingOnUserId', project: 'projectId',
}

const PRIORITY_WORD: Record<string, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' }

export type FilterChoice = { value: string; label: string }

/** What one filter can be set to: the values the list holds, or the fixed ones. */
export function filterChoices(kind: FilterKind, options: TaskListPageData['options']): FilterChoice[] {
  const named = (list: { id: string; name: string }[]) => list.map(o => ({ value: o.id, label: o.name }))
  switch (kind) {
    case 'type': return [{ value: 'task', label: 'Task' }, { value: 'epic', label: 'Epic' }]
    case 'priority': return ['HIGH', 'MEDIUM', 'LOW'].map(p => ({ value: p, label: PRIORITY_WORD[p] }))
    case 'archived': return [{ value: 'yes', label: 'Archived tasks' }]
    case 'epic': return named(options.epics)
    case 'agent': return named(options.agents)
    case 'board': return named(options.boards)
    case 'queuedBy': return named(options.queuedBy)
    case 'waitingOn': return named(options.waitingOn)
    case 'project': return named(options.projects)
  }
}

export function withFilter(f: TaskListFilters, kind: FilterKind, value: string | null): TaskListFilters {
  const next = { ...f }
  if (kind === 'archived') {
    if (value) next.archived = true
    else delete next.archived
    return next
  }
  const field = FIELD[kind]
  if (value) (next as Record<string, unknown>)[field] = value
  else delete next[field]
  return next
}

export type FilterChip = { kind: FilterKind; label: string }

/** A chip for each filter in use, with what it is set to; a value the list no longer holds is still named. */
export function filterChips(f: TaskListFilters, kind: TaskListKind, options: TaskListPageData['options']): FilterChip[] {
  return FILTER_KINDS[kind].flatMap((k): FilterChip[] => {
    if (k === 'archived') return f.archived ? [{ kind: k, label: 'Archived' }] : []
    const value = f[FIELD[k]]
    if (typeof value !== 'string') return []
    const named = filterChoices(k, options).find(c => c.value === value)?.label ?? 'one no longer listed'
    return [{ kind: k, label: `${FILTER_LABEL[k]}: ${named}` }]
  })
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
  return dayText(at)
}

const dayText = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export type RowChip = { text: string; kind: 'project' | 'column' | 'priority' | 'epic' | 'date' }

/** The chips beside a row's title (T7 ②): on Your tasks its project first, then its column, priority, and its epic or, on an epic, its date. */
export function rowChips(r: TaskListRow, kind: TaskListKind): RowChip[] {
  const chips: RowChip[] = []
  if (kind === 'mine') chips.push({ text: r.project.name, kind: 'project' })
  chips.push({ text: r.columnLabel ?? 'Backlog', kind: 'column' })
  chips.push({ text: PRIORITY_WORD[r.priority] ?? r.priority, kind: 'priority' })
  if (r.epic && !r.isEpic) chips.push({ text: `◆ ${r.epic.title}`, kind: 'epic' })
  if (r.isEpic && r.epicDate) {
    const day = dayText(new Date(r.epicDate.at))
    chips.push({ text: `${r.epicDate.milestone ?? 'Plan'} · ${day}`, kind: 'date' })
  }
  return chips
}

/** The quiet line under the title: key · board · who queued it · when it last changed; an epic's tasks in place of who queued it. */
export function rowLine(r: TaskListRow, now: Date): string {
  const parts: (string | false | null)[] = [r.key, r.showBoard && r.board.name]
  if (r.isEpic && r.progress) {
    parts.push(`${r.progress.total} task${r.progress.total === 1 ? '' : 's'}`)
    if (r.progress.needsYou > 0) parts.push(`${r.progress.needsYou} need${r.progress.needsYou === 1 ? 's' : ''} you`)
  } else if (r.queuedBy) {
    parts.push(`queued by ${r.queuedBy.you ? 'you' : r.queuedBy.name}`)
  }
  parts.push(`updated ${updatedText(r.updatedAt, now)}`)
  return parts.filter(Boolean).join(' · ')
}
