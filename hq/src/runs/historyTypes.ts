/**
 * The Runs history (spec D19, RU5, the Runs design): a project's every run, or the person's own across projects, as
 * one list to narrow, sort and page. Shared by the query and the screens; the mobile app does not read it yet.
 */
import type { ExecutionState, SiteSilence } from '@agenthix/core'
import type { WorkroomLineWhy } from '../projects/workroom/workroomTypes'

/** The tabs above the list: every run, or those running, waiting to start, needing the person, or finished. */
export const HISTORY_STATES = ['all', 'running', 'waiting', 'needs', 'finished'] as const
export type HistoryState = (typeof HISTORY_STATES)[number]

/** The three kinds of run (RU5): a task's run, a reply in a conversation, a routine's run. */
export const HISTORY_KINDS = ['any', 'task', 'reply', 'routine'] as const
export type HistoryKind = (typeof HISTORY_KINDS)[number]

export const HISTORY_WHEN = ['any', 'today', 'week', 'month'] as const
export type HistoryWhen = (typeof HISTORY_WHEN)[number]

export const HISTORY_SORTS = ['newest', 'cost', 'took'] as const
export type HistorySort = (typeof HISTORY_SORTS)[number]

/** The organisation's Runs only: all of the person's, those they started, those on their behalf. */
export const HISTORY_WHOSE = ['all', 'started', 'behalf'] as const
export type HistoryWhose = (typeof HISTORY_WHOSE)[number]

/** Who or what started a run: the viewer, another person, an agent, or a schedule. */
export const HISTORY_STARTERS = ['any', 'me', 'people', 'agents', 'schedule'] as const
export type HistoryStarter = (typeof HISTORY_STARTERS)[number]

export const HISTORY_PAGE_SIZE = 20

export type RunHistoryArgs = {
  /** A project's Runs; absent, the person's own runs across every project and their own space. */
  projectKey?: string
  state?: HistoryState
  kind?: HistoryKind
  when?: HistoryWhen
  sort?: HistorySort
  whose?: HistoryWhose
  startedBy?: HistoryStarter
  agentId?: string
  /** A task's key (WEB-12): only its runs. */
  taskKey?: string
  /** The organisation's Runs: one project's key. */
  place?: string
  /** Only the runs of this conversation's replies and the tasks it made. */
  conversationId?: string
  search?: string
  /** From 1. */
  page?: number
  /** The start of the viewer's today, from the browser, for When: today. */
  todayFrom?: string
}

export type HistoryKindOfRow = Exclude<HistoryKind, 'any'>
export type HistoryGroup = Exclude<HistoryState, 'all'>

/** What a row's second line says: a failure's reason, a stop, or what the run asks. */
export type HistoryNote = { tone: 'danger' | 'warning' | 'muted'; lead: string | null; text: string | null }

export type RunHistoryRow = {
  runId: string
  sessionId: string
  kind: HistoryKindOfRow
  /** The task's key; null for a reply or a routine's run. */
  taskKey: string | null
  taskId: string | null
  /** The task run's stored number; null when it has none. */
  number: number | null
  title: string
  /** The task or the conversation; null for another person's reply, which is theirs alone. */
  href: string | null
  /** Whether the viewer may open the run itself. */
  openable: boolean
  place: { name: string; projectKey: string | null }
  agent: { id: string; name: string; avatarUrl: string | null } | null
  group: HistoryGroup
  /** The ring on the agent's avatar (D18); null for none. */
  ring: ExecutionState | null
  note: HistoryNote | null
  /** A task in its agent's line (Waiting, no run yet): why it waits, in the Workroom's words. */
  why?: WorkroomLineWhy | null
  /** How long it took, or has gone so far. */
  tookMs: number | null
  /** Estimated from its tokens; null when its model has no price or it reported none. */
  cost: number | null
  /** "you", "Kai", "an agent", "on its schedule". */
  startedBy: string
  at: string
}

export type HistoryCounts = Record<HistoryState, number>

export type RunHistoryResult = {
  rows: RunHistoryRow[]
  /** The runs under every filter but the tab. */
  counts: HistoryCounts
  /** What Needs you holds, in parts. */
  needs: { asks: number; failed: number; routines: number }
  /** The runs on this tab, for "1–20 of 124". */
  total: number
  page: number
  pageSize: number
  /** The newest runs are read, up to a ceiling: true when there were more than it, so the counts are of the newest. */
  capped: boolean
  /** Nothing has run in this scope at all. */
  nothingYet: boolean
  /** The names the filters in use show ("Task: WEB-12", "Agent: Tester"). */
  names: { task: string | null; agent: string | null; conversation: string | null; place: string | null }
  /** The tasks in the scope that have run or wait in line, for the Task filter: the most recently active first. */
  taskChoices: { key: string; title: string }[]
  unanswered: SiteSilence[]
}
