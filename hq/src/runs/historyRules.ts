/**
 * The Runs history's pure rules: what the browser asked for, kept to what is known; where each run sits (its tab, its
 * ring, its second line); who started it; and the counting, sorting and paging of the list. `historyRead.ts` reads.
 */
import { parseRunStartedBy, type ExecutionState, type NeedsPersonReason, type RunRow } from '@agenthix/core'
import { calculateCost, MODEL_PRICING } from '../shared/utils/aiMetrics'
import { FAILED_PREFIX, outcomeText } from './runsView'
import {
  HISTORY_KINDS, HISTORY_PAGE_SIZE, HISTORY_SORTS, HISTORY_STARTERS, HISTORY_STATES, HISTORY_WHEN, HISTORY_WHOSE,
  type HistoryCounts, type HistoryGroup, type HistoryKind, type HistoryNote, type HistorySort, type HistoryStarter,
  type HistoryState, type HistoryWhen, type HistoryWhose, type RunHistoryArgs, type RunHistoryRow,
} from './historyTypes'

const TEXT_MAX = 100
const ID_MAX = 64
const DAY_MS = 24 * 60 * 60 * 1000
/** The deepest page asked for; past it the browser is sent the last page there is. */
const PAGE_MAX = 1000

export type HistoryFilters = {
  projectKey: string | null
  state: HistoryState
  kind: HistoryKind
  when: HistoryWhen
  sort: HistorySort
  whose: HistoryWhose
  startedBy: HistoryStarter
  agentId: string | null
  taskKey: string | null
  place: string | null
  conversationId: string | null
  search: string | null
  page: number
  todayFrom: unknown
}

const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : fallback

const text = (v: unknown, max = TEXT_MAX) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const id = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length <= ID_MAX ? v : null)

/** What the browser sent, kept to what is known: anything else is no narrowing, never an error. */
export function parseHistoryArgs(raw: RunHistoryArgs | undefined | null): HistoryFilters {
  const r = (raw ?? {}) as Record<string, unknown>
  const page = typeof r.page === 'number' && Number.isInteger(r.page) ? Math.min(Math.max(1, r.page), PAGE_MAX) : 1
  return {
    projectKey: text(r.projectKey, ID_MAX),
    state: oneOf(HISTORY_STATES, r.state, 'all'),
    kind: oneOf(HISTORY_KINDS, r.kind, 'any'),
    when: oneOf(HISTORY_WHEN, r.when, 'any'),
    sort: oneOf(HISTORY_SORTS, r.sort, 'newest'),
    whose: oneOf(HISTORY_WHOSE, r.whose, 'all'),
    startedBy: oneOf(HISTORY_STARTERS, r.startedBy, 'any'),
    agentId: id(r.agentId),
    taskKey: text(r.taskKey, ID_MAX),
    place: text(r.place, ID_MAX),
    conversationId: id(r.conversationId),
    search: text(r.search),
    page,
    todayFrom: r.todayFrom,
  }
}

/** What started a run and for whom, as the site kept them with the run (`metadata.dispatch`). */
export type RunDispatchFacts = { startedBy: ReturnType<typeof parseRunStartedBy>; onBehalfOfUserId: string | null }

export function dispatchFactsOf(metadata: unknown): RunDispatchFacts {
  const dispatch = (metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>).dispatch : null) as Record<string, unknown> | null
  const onBehalf = dispatch && typeof dispatch === 'object' ? dispatch.onBehalfOfUserId : null
  return {
    startedBy: parseRunStartedBy(dispatch && typeof dispatch === 'object' ? dispatch.startedBy : null),
    onBehalfOfUserId: typeof onBehalf === 'string' && onBehalf.length <= ID_MAX ? onBehalf : null,
  }
}

/** The run limits the site was given for it, when it kept them. */
export function runLimitsOf(metadata: unknown): { timeLimitMinutes: number; turnLimit: number } | null {
  const dispatch = (metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>).dispatch : null) as Record<string, unknown> | null
  const limits = dispatch && typeof dispatch === 'object' ? (dispatch.runLimits as Record<string, unknown> | null) : null
  if (!limits || typeof limits !== 'object') return null
  const { timeLimitMinutes, turnLimit } = limits
  return typeof timeLimitMinutes === 'number' && timeLimitMinutes > 0 && typeof turnLimit === 'number' && turnLimit > 0
    ? { timeLimitMinutes, turnLimit }
    : null
}

/** Whose a run is: who started it (a person, an agent, a schedule) and the person it was for. */
export type RunWhose = { starter: 'person' | 'agent' | 'schedule' | 'unknown'; personId: string | null }

export function whoseOf(dispatch: RunDispatchFacts, fallbackPersonId: string | null): RunWhose {
  const starter = dispatch.startedBy === 'person' || dispatch.startedBy === 'agent' || dispatch.startedBy === 'schedule'
    ? dispatch.startedBy
    : dispatch.startedBy === 'pulse' ? 'schedule' : 'unknown'
  return { starter, personId: dispatch.onBehalfOfUserId ?? fallbackPersonId }
}

/** "you", "Kai", "an agent", "on its schedule". */
export function startedByWords(whose: RunWhose, kind: 'task' | 'reply' | 'routine', me: string, name: (id: string) => string | null, agentName: string | null): string {
  switch (whose.starter) {
    case 'person': return !whose.personId ? 'someone' : whose.personId === me ? 'you' : name(whose.personId) ?? 'someone'
    case 'agent': return agentName ?? 'an agent'
    case 'schedule': return kind === 'task' ? 'at its start time' : 'on its schedule'
    default: return kind === 'reply' && whose.personId ? (whose.personId === me ? 'you' : name(whose.personId) ?? 'someone') : '—'
  }
}

export function matchesStarter(whose: RunWhose, f: HistoryStarter, me: string): boolean {
  switch (f) {
    case 'any': return true
    case 'me': return whose.starter === 'person' && whose.personId === me
    case 'people': return whose.starter === 'person' && whose.personId !== me
    case 'agents': return whose.starter === 'agent'
    case 'schedule': return whose.starter === 'schedule'
  }
}

/** The organisation's Whose: started by the viewer, or done on their behalf. */
export function matchesWhose(whose: RunWhose, f: HistoryWhose, me: string): boolean {
  if (f === 'started') return whose.starter === 'person' && whose.personId === me
  if (f === 'behalf') return whose.personId === me
  return true
}

/** The task the run belongs to, as far as where it sits cares: whether this run is its latest, and why it needs a person. */
export type RunTaskFacts = { latestRunId: string | null; need: NeedsPersonReason | null }

export type Placed = { group: HistoryGroup; ring: ExecutionState | null; note: HistoryNote | null; ask: boolean; failedNeed: boolean }

const STOPPED = /^(stopped|interrupted) by /i

/**
 * Where a run sits: going now; waiting to start on its site; needing the person (an okay or an answer it still waits
 * for, or the failure of a task's latest run that waits for someone, by core's one rule); or finished. A reply asks in
 * its conversation, so its failure is a finished run here.
 */
export function placeRun(run: Pick<RunRow, 'id' | 'status' | 'manifestStatus' | 'error'>, task: RunTaskFacts | null): Placed {
  const latest = !!task && task.latestRunId === run.id
  const askNow = run.manifestStatus === 'PENDING_APPROVAL' && (!task || (latest && task.need === 'approval'))
  if (askNow || (latest && task?.need && task.need !== 'failed')) {
    const lead = run.manifestStatus === 'PENDING_APPROVAL' ? 'Wants your okay' : task?.need === 'answer' ? 'Asked you something' : 'Needs you'
    return { group: 'needs', ring: 'NEEDS_YOU', note: { tone: 'warning', lead, text: null }, ask: true, failedNeed: false }
  }
  if (run.status === 'RUNNING') return { group: 'running', ring: 'RUNNING', note: null, ask: false, failedNeed: false }
  if (run.status === 'PENDING') return { group: 'waiting', ring: 'WAITING', note: null, ask: false, failedNeed: false }
  if (run.status === 'FAILED') {
    const outcome = outcomeText(run) ?? 'failed'
    const reason = outcome.startsWith(FAILED_PREFIX) ? outcome.slice(FAILED_PREFIX.length) : null
    const needs = latest && task?.need === 'failed'
    return { group: needs ? 'needs' : 'finished', ring: 'FAILED', note: { tone: 'danger', lead: 'Failed', text: reason }, ask: false, failedNeed: needs }
  }
  if (run.status === 'CANCELLED') {
    const error = run.error?.trim()
    const text = error && STOPPED.test(error) ? error.charAt(0).toUpperCase() + error.slice(1) : 'Stopped'
    return { group: 'finished', ring: null, note: { tone: 'muted', lead: null, text }, ask: false, failedNeed: false }
  }
  return { group: 'finished', ring: null, note: null, ask: false, failedNeed: false }
}

/** How long a run took, or has gone so far; null before it started. */
export function tookMs(run: Pick<RunRow, 'startedAt' | 'endedAt'>, now: Date): number | null {
  if (!run.startedAt) return null
  const end = run.endedAt ? new Date(run.endedAt).getTime() : now.getTime()
  return Math.max(0, end - new Date(run.startedAt).getTime())
}

export function costOf(run: Pick<RunRow, 'usage' | 'model'>): number | null {
  return run.usage && MODEL_PRICING[run.model] ? calculateCost(run.usage, run.model) : null
}

export function withinWhen(at: string, when: HistoryWhen, todayFrom: Date, now: Date): boolean {
  if (when === 'any') return true
  const t = new Date(at).getTime()
  if (when === 'today') return t >= todayFrom.getTime()
  return t >= now.getTime() - (when === 'week' ? 7 : 30) * DAY_MS
}

export function matchesSearch(row: Pick<RunHistoryRow, 'title' | 'taskKey' | 'agent'>, search: string | null): boolean {
  if (!search) return true
  const s = search.toLowerCase()
  return row.title.toLowerCase().includes(s)
    || (!!row.taskKey && row.taskKey.toLowerCase().includes(s))
    || (!!row.agent && row.agent.name.toLowerCase().includes(s))
}

export function emptyCounts(): HistoryCounts {
  return { all: 0, running: 0, waiting: 0, needs: 0, finished: 0 }
}

export function countRows(rows: Pick<RunHistoryRow, 'group'>[]): HistoryCounts {
  const counts = emptyCounts()
  for (const r of rows) { counts.all++; counts[r.group]++ }
  return counts
}

/** Newest first; or the costliest, or the longest, the newest first among equals. */
export function sortRows<R extends Pick<RunHistoryRow, 'at' | 'cost' | 'tookMs'>>(rows: R[], sort: HistorySort): R[] {
  const newest = (a: R, b: R) => b.at.localeCompare(a.at)
  if (sort === 'newest') return [...rows].sort(newest)
  const key = (r: R) => (sort === 'cost' ? r.cost : r.tookMs) ?? -1
  return [...rows].sort((a, b) => key(b) - key(a) || newest(a, b))
}

/** One page of twenty; a page past the end is the last there is. */
export function pageOf<R>(rows: R[], page: number, size = HISTORY_PAGE_SIZE): { rows: R[]; page: number } {
  const last = Math.max(1, Math.ceil(rows.length / size))
  const at = Math.min(page, last)
  return { rows: rows.slice((at - 1) * size, at * size), page: at }
}
