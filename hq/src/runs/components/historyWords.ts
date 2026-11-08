/** How the Runs history and a run's page word their numbers and names. Pure. */
import { costText, lineWhyText } from '../../projects/workroom/workroomWords'
import type { HistoryCounts, HistoryKind, HistoryKindOfRow, HistorySort, HistoryStarter, HistoryState, HistoryWhen, HistoryWhose, RunHistoryResult, RunHistoryRow } from '../historyTypes'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "20 s", "6 min", "1 h 5 min"; "—" before it started. */
export function tookText(ms: number | null): string {
  if (ms === null) return '—'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  return minutes % 60 === 0 ? `${h} h` : `${h} h ${minutes % 60} min`
}

export function rowCost(cost: number | null): string {
  return cost === null ? '—' : costText(cost)
}

/** "WEB-14 · 1" for a task's run, "Run 15" for a routine's, "—" for a reply. */
export function runRef(row: Pick<RunHistoryRow, 'kind' | 'taskKey' | 'number'>): string {
  if (row.kind === 'task') return row.taskKey ? `${row.taskKey}${row.number ? ` · ${row.number}` : ''}` : '—'
  if (row.kind === 'routine') return row.number ? `Run ${row.number}` : '—'
  return '—'
}

export const KIND_TAG: Record<HistoryKindOfRow, string> = { task: 'task', reply: 'conversation', routine: 'routine run' }

export const TAB_LABEL: Record<HistoryState, string> = { all: 'All', running: 'Running', waiting: 'Waiting', needs: 'Needs you', finished: 'Finished' }
export const TABS: HistoryState[] = ['all', 'running', 'waiting', 'needs', 'finished']

export const KIND_CHOICES: { value: HistoryKind; label: string }[] = [
  { value: 'any', label: 'Kind: all' }, { value: 'task', label: 'Tasks' }, { value: 'routine', label: 'Routine runs' }, { value: 'reply', label: 'Replies in conversations' },
]
export const WHEN_CHOICES: { value: HistoryWhen; label: string }[] = [
  { value: 'any', label: 'When: any time' }, { value: 'today', label: 'Today' }, { value: 'week', label: 'Last 7 days' }, { value: 'month', label: 'Last 30 days' },
]
export const STARTER_CHOICES: { value: HistoryStarter; label: string }[] = [
  { value: 'any', label: 'Started by: anyone' }, { value: 'me', label: 'You' }, { value: 'people', label: 'Other people' }, { value: 'agents', label: 'Agents' }, { value: 'schedule', label: 'A schedule' },
]
export const WHOSE_CHOICES: { value: HistoryWhose; label: string }[] = [
  { value: 'all', label: 'Whose: all of mine' }, { value: 'started', label: 'Started by me' }, { value: 'behalf', label: 'On my behalf' },
]
export const SORT_CHOICES: { value: HistorySort; label: string }[] = [
  { value: 'newest', label: 'newest first' }, { value: 'cost', label: 'cost' }, { value: 'took', label: 'how long it took' },
]

/** "Needs you 5: 3 tasks · 1 failed · 1 routine"; null when nothing needs the person. */
export function needsLine(counts: HistoryCounts, needs: RunHistoryResult['needs']): string | null {
  if (counts.needs === 0) return null
  const parts = [
    needs.asks ? plural(needs.asks, 'task') : null,
    needs.failed ? `${needs.failed} failed` : null,
    needs.routines ? plural(needs.routines, 'routine') : null,
  ].filter(Boolean)
  return parts.length ? `Needs you ${counts.needs}: ${parts.join(' · ')}` : null
}

/** "1–20 of 124 · newest first"; "of 500+" when only the newest were read. */
export function pagerText(r: Pick<RunHistoryResult, 'total' | 'page' | 'pageSize' | 'capped'>, sort: HistorySort): string {
  if (r.total === 0) return ''
  const from = (r.page - 1) * r.pageSize + 1
  const to = Math.min(r.total, r.page * r.pageSize)
  const sorted = SORT_CHOICES.find(c => c.value === sort)?.label ?? 'newest first'
  return `${from}–${to} of ${r.total}${r.capped ? '+' : ''} · ${sort === 'newest' ? sorted : `by ${sorted}`}`
}

/** The phone's second line: "WEB-14 · Run 1 · task · 1 min · $0.01 · you". */
export function phoneLine(row: RunHistoryRow, opts: { withPlace: boolean }): string {
  if (row.why) return [opts.withPlace ? row.place.name : null, row.taskKey, lineWhyText(row.why, true)].filter(Boolean).join(' · ')
  if (row.note?.tone === 'danger') {
    return [`Failed${row.note.text ? `: ${row.note.text}` : ''}`, row.taskKey, row.number ? `Run ${row.number}` : null, row.startedBy].filter(Boolean).join(' · ')
  }
  return [
    opts.withPlace ? row.place.name : null,
    row.taskKey, row.number ? `Run ${row.number}` : null,
    opts.withPlace ? null : KIND_TAG[row.kind],
    tookText(row.tookMs), rowCost(row.cost), opts.withPlace ? null : row.startedBy,
  ].filter(Boolean).join(' · ')
}

/** Time against its limit: "1 min of 60 min", "40 s of 30 min", "3 h of 4 h". */
export function limitText(ms: number | null, limitMinutes: number): string {
  const limit = limitMinutes % 60 === 0 && limitMinutes >= 120 ? `${limitMinutes / 60} h` : `${limitMinutes} min`
  return `${tookText(ms ?? 0)} of ${limit}`
}

/** "18k · about $0.02". */
export function tokensText(tokens: number | null, cost: number | null): string {
  if (tokens === null) return 'none reported'
  const k = tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(tokens)
  return cost === null ? k : `${k} · about ${costText(cost)}`
}
