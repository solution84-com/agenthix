/**
 * What a task's page shows for the state it is in (T0, T10): its state words, the header's one button, which block
 * Now holds, the words of a run's line, an epic's progress, the one date style, and what a delete takes with it.
 */
import type { TaskState } from '@agenthix/core'
import { taskStateWords, isRunPending, whenText as listWhenText, type TaskStateWords } from '@agenthix/ui/tasks'
import { MANIFEST_BLOCKED_REASON } from '../../agents/taskExecutionReasons'
import { isEpicTask } from './taskKind'

export type PageRunStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

/** A task's run as `getTaskRuns` answers it: the part the page reads. */
export type PageRun = {
  id: string
  number: number | null
  status: PageRunStatus
  agent: { name: string } | null
  startedAt: string | null
  endedAt: string | null
  createdAt: string
}

export type PageTask = {
  runState: string
  runStateReason: string | null
  state?: string
  type?: { kind: string } | null
}

export type HeaderButton = 'run' | 'stop' | 'runAgain' | 'review' | 'answer' | null

export type NowKind = 'approval' | 'question' | 'live' | 'waiting' | 'failure' | 'result' | 'notStarted'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_MS = 86_400_000

const two = (n: number) => String(n).padStart(2, '0')

/** "6 Nov 2026". */
export function dayText(v: string | Date): string {
  const d = new Date(v)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "07:45". */
export function clockText(v: string | Date): string {
  const d = new Date(v)
  return `${two(d.getHours())}:${two(d.getMinutes())}`
}

/** "07:45" today, "6 Nov, 07:45" on another day, "6 Nov 2027, 07:45" in another year: the task lists' and runs' own. */
export const whenText = (v: string | Date, now: Date): string => listWhenText(v, now)

/** "6 – 15 Apr 2027", "28 Mar – 4 Apr 2027", "20 Dec 2026 – 4 Jan 2027"; one end alone when the other is not set. */
export function planText(start: string | Date | null | undefined, finish: string | Date | null | undefined): string | null {
  if (!start && !finish) return null
  if (!start || !finish) return `${start ? 'From' : 'Until'} ${dayText((start ?? finish)!)}`
  const a = new Date(start)
  const b = new Date(finish)
  if (a.getFullYear() !== b.getFullYear()) return `${dayText(a)} – ${dayText(b)}`
  if (a.getMonth() !== b.getMonth()) return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${dayText(b)}`
  return `${a.getDate()} – ${dayText(b)}`
}

/** The task's latest run: the highest number, else the newest. */
export function latestRun(runs: readonly PageRun[] | null | undefined): PageRun | null {
  if (!runs || runs.length === 0) return null
  return [...runs].sort((x, y) => (y.number ?? -1) - (x.number ?? -1) || Date.parse(y.createdAt) - Date.parse(x.createdAt))[0]
}

/** How many runs the task has had: numbers are given in order and never reused. */
export function runCountOf(runs: readonly PageRun[] | null | undefined): number {
  return Math.max(runs?.length ?? 0, ...(runs ?? []).map(r => r.number ?? 0))
}

/** An approval waits on the task: a request is pending, or its run is stopped for one. */
export function approvalWaits(task: PageTask, hasPendingApproval: boolean): boolean {
  return hasPendingApproval || (task.runState === 'RUN_BLOCKED' && !!task.runStateReason?.startsWith(MANIFEST_BLOCKED_REASON))
}

/**
 * The task's state in T1's words. Someone who may only read the project cannot give the okay, so to them a waiting
 * request reads Waiting on a member.
 */
export function taskPageWords(task: PageTask, o: { hasPendingApproval: boolean; readOnly: boolean; runs?: readonly PageRun[] | null; now: Date }): TaskStateWords {
  const latest = latestRun(o.runs)
  const okay = approvalWaits(task, o.hasPendingApproval)
  return taskStateWords({
    runState: task.runState,
    runStateReason: task.runStateReason,
    done: task.state === 'DONE',
    waitsOn: okay ? { what: 'okay', who: o.readOnly ? { name: 'a member' } : 'you' } : null,
    workingSince: latest?.status === 'RUNNING' ? latest.startedAt : null,
    latestRunCompleted: latest?.status === 'COMPLETED',
  }, o.now)
}

/**
 * The header's one filled button (D18): Review while it waits for an okay and Answer for a question (each taking the
 * person to Now, which holds the step), Stop while a run is pending, Run, and Run again after a run. None on a done
 * task (Run again is in ⋯ then) and on an epic, which is never run.
 */
export function headerButton(words: TaskStateWords, task: PageTask): HeaderButton {
  if (isEpicTask(task)) return null
  if (words.kind === 'okay') return 'review'
  if (words.kind === 'question') return 'answer'
  if (words.kind === 'done') return null
  if (isRunPending(task.runState)) return 'stop'
  if (words.kind === 'failed' || words.kind === 'finished') return 'runAgain'
  if (words.kind === 'waiting') return null
  return 'run'
}

export function nowKind(words: TaskStateWords, task: PageTask, latest: PageRun | null): NowKind {
  if (words.kind === 'okay' || (words.kind === 'waiting' && approvalWaits(task, false))) return 'approval'
  if (words.kind === 'question') return 'question'
  if (words.kind === 'running') return 'live'
  if (words.kind === 'waiting') return 'waiting'
  if (words.kind === 'failed') return 'failure'
  return latest ? 'result' : 'notStarted'
}

/** "Run 2", or "The latest run" for a run that has no number yet. */
export function runName(run: PageRun | null): string {
  return run?.number ? `Run ${run.number}` : 'The latest run'
}

const ENDED: Record<PageRunStatus, string> = {
  PENDING: 'waiting', RUNNING: 'running', COMPLETED: 'finished', FAILED: 'failed', CANCELLED: 'stopped',
}

/** "Writer · Run 2 · finished 07:55". */
export function runLine(run: PageRun, now: Date): string {
  const at = run.endedAt ?? run.startedAt ?? run.createdAt
  return [run.agent?.name, runName(run), `${ENDED[run.status]} ${whenText(at, now)}`].filter(Boolean).join(' · ')
}

/** An epic's tasks, as its progress counts them: by task state, never by run (D2). */
export type EpicChild = { id: string; state: TaskState }

export type EpicProgress = { done: number; total: number; inProgress: number; todo: number; backlog: number }

export function epicProgress(children: readonly EpicChild[]): EpicProgress {
  const p: EpicProgress = { done: 0, total: children.length, inProgress: 0, todo: 0, backlog: 0 }
  for (const t of children) {
    if (t.state === 'DONE') p.done += 1
    else if (t.state === 'IN_PROGRESS') p.inProgress += 1
    else if (t.state === 'TODO') p.todo += 1
    else p.backlog += 1
  }
  return p
}

/** "2 in progress · 1 to do · 1 in Backlog", each part only when it counts something. */
export function epicStateText(p: EpicProgress): string {
  return [
    p.inProgress ? `${p.inProgress} in progress` : null,
    p.todo ? `${p.todo} to do` : null,
    p.backlog ? `${p.backlog} in Backlog` : null,
  ].filter(Boolean).join(' · ')
}

/** "due 20 Nov, 13 days", "due today", "due 3 Nov, 3 days past": an epic's due date beside its progress. */
export function epicDueText(date: string | Date, now: Date): string {
  const d = new Date(date)
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const left = Math.round((day - today) / DAY_MS)
  if (left === 0) return 'due today'
  const label = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${d.getUTCFullYear() === now.getFullYear() ? '' : ` ${d.getUTCFullYear()}`}`
  const days = `${Math.abs(left)} day${Math.abs(left) === 1 ? '' : 's'}`
  return left > 0 ? `due ${label}, ${days}` : `due ${label}, ${days} past`
}

/** "14 days left", "1 day left", "Due today", "3 days past". */
export function daysLeftText(date: string | Date, now: Date): string {
  const d = new Date(date)
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const left = Math.round((day - today) / DAY_MS)
  if (left === 0) return 'Due today'
  if (left > 0) return `${left} day${left === 1 ? '' : 's'} left`
  return `${-left} day${left === -1 ? '' : 's'} past`
}

/** What goes with a deleted task, one line each: its comments and files, its runs, its conversation. */
export function deleteTakes(o: { comments: number; runs: number; conversation: boolean }): string[] {
  return [
    o.comments ? `its ${o.comments} comment${o.comments === 1 ? '' : 's'} and its files` : 'its files',
    ...(o.runs ? [`its ${o.runs} run${o.runs === 1 ? '' : 's'} and what ${o.runs === 1 ? 'the run' : 'they'} recorded`] : []),
    ...(o.conversation ? ['its conversation'] : []),
  ]
}

/** The project's Tasks list, from a task's key: `WEB-7` is in the project `WEB`. */
export function tasksListPath(taskKey: string): string {
  const project = /^([A-Z]{2,6})-\d+$/.exec(taskKey)?.[1]
  return project ? `/projects/${project}/tasks` : '/tasks'
}
