/**
 * The Workroom's pure rules: an agent's ring, why each task in its line waits, the window "today" covers, and the
 * counts above the cards. The reads (`workroomRead.ts`) fetch; these decide.
 */
import { needsPersonReason, type NeedsPersonReason } from '@agenthix/core'
import { HELD_FOR_RECONNECT_REASON, WAITING_FOR_BRANCH_REASON, WAITING_FOR_SLOT_REASON } from '../../agents/taskExecutionReasons'
import { executionFactsOf } from '../executionState'
import type { WorkroomAgent, WorkroomCounts, WorkroomLineWhy, WorkroomRing } from './workroomTypes'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The start of the viewer's today, as their browser sent it; anything missing, unreadable, in the future or more than
 * two days back reads as the last 24 hours, so a hostile value can never widen the read.
 */
export function todayWindow(todayFrom: unknown, now: Date): Date {
  const fallback = new Date(now.getTime() - DAY_MS)
  if (typeof todayFrom !== 'string' || todayFrom.length > 40) return fallback
  const at = new Date(todayFrom)
  if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime() || now.getTime() - at.getTime() > 2 * DAY_MS) return fallback
  return at
}

/** The ring on an agent's card: at work turns, before what needs a person, before a failure, before waiting. */
export function ringOf(a: { running: number; asking: number; failed: number; waiting: number }): WorkroomRing {
  if (a.running > 0) return 'RUNNING'
  if (a.asking > 0) return 'NEEDS_YOU'
  if (a.failed > 0) return 'FAILED'
  if (a.waiting > 0) return 'WAITING'
  return null
}

type NeedTask = {
  state: string | null
  status: string
  runState: string
  runStateReason: string | null
  isEpic: boolean
  typeKind: string | null
}

/** Why a task needs the person, by the one rule (core's `needsPersonReason`); null when it does not. */
export function needOf(t: NeedTask): NeedsPersonReason | null {
  if (t.runState !== 'RUN_BLOCKED' && t.runState !== 'RUN_FAILED') return null
  const facts = executionFactsOf(t.runState, t.runStateReason)
  const taskState = (t.state ?? (t.status === 'DONE' ? 'DONE' : 'TODO')) as 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'DONE'
  return needsPersonReason({
    kind: 'task', taskState, typeKind: t.isEpic || t.typeKind === 'EPIC' ? 'EPIC' : 'TASK', ...facts,
  })
}

export type LineTask = {
  id: string
  title: string
  runState: string
  runStateReason: string | null
  scheduleNextDueAt: Date | null
}

/**
 * Why the task at `index` of an agent's line (rank order) waits, given the title of the run the agent is at work on.
 * The four reasons left once nothing starts on its own: next after the run at work, its Run at… time, the site's
 * runs at once all busy, the site not answering; and a branch run waiting for the project's other runs.
 */
export function lineWhy(line: LineTask[], index: number, atWork: string | null, siteName: string | null, now: Date): WorkroomLineWhy {
  const t = line[index]
  if (t.runState === 'RUN_ACTIVE') return t.runStateReason === WAITING_FOR_BRANCH_REASON ? { kind: 'branch' } : { kind: 'siteBusy', siteName }
  if (t.runStateReason === HELD_FOR_RECONNECT_REASON) return { kind: 'siteAway', siteName }
  if (t.runState !== 'RUN_QUEUED' && t.scheduleNextDueAt && t.scheduleNextDueAt.getTime() > now.getTime()) {
    return { kind: 'startsAt', at: t.scheduleNextDueAt.toISOString() }
  }
  // The first queued task is next; any after it waits for the one before it.
  const before = line.slice(0, index).filter(x => x.runState === 'RUN_QUEUED')
  return before.length === 0 ? { kind: 'next', after: atWork } : { kind: 'after', title: before[before.length - 1].title }
}

/** A running task that its site holds for a free slot, or for its branch, is in line rather than at work. */
export function waitsOnItsSite(t: { runState: string; runStateReason: string | null }): boolean {
  return t.runState === 'RUN_ACTIVE' && (t.runStateReason === WAITING_FOR_SLOT_REASON || t.runStateReason === WAITING_FOR_BRANCH_REASON)
}

export const NO_COUNTS: WorkroomCounts = {
  needsYou: 0, needsAsking: 0, needsFailed: 0, running: 0, runningTasks: 0, runningReplies: 0, waiting: 0,
  finishedToday: 0, spentToday: 0, ready: 0, runningProjects: 0,
}

/** The counts above a Workroom's cards, from its cards. */
export function countsOf(agents: WorkroomAgent[]): WorkroomCounts {
  const c = { ...NO_COUNTS }
  for (const a of agents) {
    for (const n of a.needs) {
      c.needsYou += 1
      if (n.reason === 'failed') c.needsFailed += 1
      else c.needsAsking += 1
    }
    for (const r of a.now) {
      c.running += 1
      if (r.kind === 'task') c.runningTasks += 1
      else c.runningReplies += 1
    }
    c.waiting += a.line.length
    c.finishedToday += a.finishedToday
    c.spentToday += a.spentToday
    c.ready += a.ready
  }
  c.runningProjects = c.running > 0 ? 1 : 0
  return c
}

/** Several Workrooms' counts, added up (Workrooms). */
export function addCounts(all: WorkroomCounts[]): WorkroomCounts {
  const c = { ...NO_COUNTS }
  for (const x of all) for (const k of Object.keys(c) as (keyof WorkroomCounts)[]) c[k] += x[k]
  return c
}
