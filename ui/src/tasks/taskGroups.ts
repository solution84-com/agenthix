import { isRunPending, runNeedsPerson } from './runState'

/** One task as the Tasks tool lists it (every screen reviewed spec §3), already shaped by the client that read it. */
export interface ToolTask {
  id: string
  key: string
  title: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  /** Its task state: BACKLOG, TODO, IN_PROGRESS or DONE. */
  state: string
  runState: string
  runStateReason: string | null
  agent: { id: string; name: string; handle: string } | null
  /** Its column's name, as its type names it. */
  columnLabel: string | null
  project: { id: string; key: string; name: string } | null
  /** Would run, but has no agent to run it: it needs a person to choose one. */
  waitsForAgent: boolean
  /** Its start time, when a person set one. */
  startsAt: string | null
  /** When it started working, while it is running. */
  workingSince: string | null
  doneAt: string | null
  result: string | null
  createdAt: string
}

export type TaskAction = 'review' | 'assign' | 'runAgain'

export interface TaskGroups {
  needsYou: ToolTask[]
  workingOn: ToolTask[]
  upNext: ToolTask[]
}

const PRIORITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
const byPriority = (a: ToolTask, b: ToolTask) => (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1)
const byAge = (a: ToolTask, b: ToolTask) => a.createdAt.localeCompare(b.createdAt)

const isOpen = (t: ToolTask) => t.state !== 'DONE'

/**
 * The one definition of "needs you", for the navigation's count, Your tasks and a project's Tasks tool.
 * A run waiting on a person is Needs you whatever column its task is in; a failed run, or work with no
 * agent to start it, only while the task is open.
 */
export function needsPerson(t: { state?: string; runState: string | null; waitsForAgent?: boolean }): boolean {
  if (t.runState === 'RUN_BLOCKED') return true
  return t.state !== 'DONE' && (runNeedsPerson(t.runState) || !!t.waitsForAgent)
}

/** Queued or given a start time: it will start without anyone doing more. */
function waitsToStart(t: ToolTask): boolean {
  return t.runState === 'RUN_QUEUED' || t.startsAt !== null
}

/** The one action a task that needs a person offers in its row: where to go, or what to choose. */
export function taskAction(t: ToolTask): TaskAction | null {
  if (t.waitsForAgent) return 'assign'
  if (t.runState === 'RUN_FAILED') return 'runAgain'
  if (t.runState === 'RUN_BLOCKED') return 'review'
  return null
}

/**
 * The tool's one list in three groups. Needs you: a run stopped for a person, or work with no agent
 * to start it. Working on: running. Up next: every task out of Backlog that is neither done nor running,
 * those waiting to start first, then by priority, then oldest first. A task in Backlog is in
 * the backlog, not here, unless it needs a person or is running.
 */
export function groupTasks(tasks: ToolTask[]): TaskGroups {
  const open = tasks.filter(isOpen)
  const needsYou = tasks.filter(needsPerson).sort((a, b) => byPriority(a, b) || byAge(a, b))
  const rest = open.filter(t => !needsPerson(t))
  const workingOn = rest.filter(t => t.runState === 'RUN_ACTIVE').sort(byAge)
  const upNext = rest
    .filter(t => t.runState !== 'RUN_ACTIVE' && t.state !== 'BACKLOG')
    .sort((a, b) => Number(waitsToStart(b)) - Number(waitsToStart(a)) || byPriority(a, b) || byAge(a, b))
  return { needsYou, workingOn, upNext }
}

/** Tasks in Backlog, by priority then oldest first (spec §3, Backlog). */
export function backlogOf(tasks: ToolTask[]): ToolTask[] {
  return tasks.filter(t => t.state === 'BACKLOG' && t.runState !== 'RUN_ACTIVE')
    .sort((a, b) => byPriority(a, b) || byAge(a, b))
}

export const DONE_WINDOW_DAYS = 30

/** What was finished in the last 30 days, newest first (spec §3, Done). */
export function doneRecently(tasks: ToolTask[], now: Date): ToolTask[] {
  const since = now.getTime() - DONE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  return tasks
    .filter(t => t.state === 'DONE' && t.doneAt !== null && new Date(t.doneAt).getTime() >= since)
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
}

export interface TaskListFilter {
  search: string
  agentId: string
  priority: string
  projectKey: string
}

export const NO_TASK_FILTER: TaskListFilter = { search: '', agentId: '', priority: '', projectKey: '' }

export function filterTasks(tasks: ToolTask[], f: TaskListFilter): ToolTask[] {
  const q = f.search.trim().toLowerCase()
  return tasks.filter(t =>
    (!q || t.title.toLowerCase().includes(q) || t.key.toLowerCase().includes(q))
    && (!f.agentId || t.agent?.id === f.agentId)
    && (!f.priority || t.priority === f.priority)
    && (!f.projectKey || t.project?.key === f.projectKey))
}

/** "3 min", "2 h 5 min", "3 days": how long something has been going. */
export function durationText(ms: number): string {
  const minutes = Math.max(1, Math.floor(ms / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}

export type StateTone = 'needs' | 'live' | 'muted'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Starts Tue 14:30", "Starts 14:30" today. */
export function startsText(iso: string, now: Date): string {
  const d = new Date(iso)
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay ? `Starts ${time}` : `Starts ${WEEKDAYS[d.getDay()]} ${time}`
}

/**
 * The reasons hq stores on a task, in short words for a person. Keyed by the start of the stored text
 * (see hq's taskExecutionReasons); a reason not listed is shown as stored.
 */
const PLAIN_REASONS: [stored: string, plain: string][] = [
  ['manifest rejected', 'Request denied — run again to retry'],
  ['Awaiting tool approval', 'Wants approval'],
  ['site unreachable', 'Site unreachable — held until it reconnects'],
  ['Execution Site revoked', 'Execution Site revoked'],
  ["no Execution Site holds", 'No Execution Site for this project'],
  ["waiting for this agent's running task", "Waiting for the agent's running task"],
  ['waiting for a free run slot', 'Runs are waiting: its site is at capacity'],
  ["scheduled time reached while", 'Scheduled time reached — automation is off'],
  ['scheduled time reached, but no agent', 'Scheduled time reached — no agent assigned'],
  ['the dispatch found nothing', 'Nothing to run — left queued'],
  ['the person this task is done on behalf of no longer', 'Its person lost access — an admin must choose someone else'],
  ['the person who started this run no longer', 'Whoever started it lost access — run it again'],
]

export function plainReason(stored: string): string {
  const text = stored.trim()
  return PLAIN_REASONS.find(([start]) => text.startsWith(start))?.[1] ?? text
}

/** The words a row shows for where a task stands, and how they are drawn. */
export function taskStateText(t: ToolTask, now: Date): { text: string; tone: StateTone } {
  if (t.waitsForAgent) return { text: "Couldn't start — no agent", tone: 'needs' }
  if (t.runState === 'RUN_FAILED') return { text: t.runStateReason ? plainReason(t.runStateReason) : 'Run failed', tone: 'needs' }
  if (t.runState === 'RUN_BLOCKED') return { text: t.runStateReason ? plainReason(t.runStateReason) : 'Needs you', tone: 'needs' }
  if (t.runState === 'RUN_ACTIVE') {
    const since = t.workingSince ? ` · ${durationText(now.getTime() - new Date(t.workingSince).getTime())}` : ''
    return { text: `Running${since}`, tone: 'live' }
  }
  if (t.runState === 'RUN_QUEUED') return { text: 'In line', tone: 'muted' }
  if (t.startsAt) return { text: startsText(t.startsAt, now), tone: 'muted' }
  return { text: 'Waiting its turn', tone: 'muted' }
}

export type PrimaryAction = 'stop' | 'approve' | 'runAgain' | 'run'

/** The one action an open task offers for the state it is in. */
export function primaryAction(t: { runState: string; hasPendingApproval: boolean }): PrimaryAction {
  if (t.hasPendingApproval) return 'approve'
  if (isRunPending(t.runState)) return 'stop'
  if (runNeedsPerson(t.runState)) return 'runAgain'
  return 'run'
}
