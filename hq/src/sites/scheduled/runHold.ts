/**
 * Runs around a scheduled change (host-management spec §14; diagram 6b): from a few minutes before it, hq starts no
 * new runs on what it affects — the site it is on, or every site for a change to hq itself — and a task run going
 * then pauses, to carry on by itself afterwards. A conversation's reply already going is left to finish; a new
 * message waits until the change is done.
 *
 * A hold is a `ScheduledChange` row paused and not yet resumed. hq's own clock also counts a change as holding from
 * its lead, so a notice that is late does not let a run start a minute before the change.
 *
 * A site pauses a task run at the end of its current step: the task stays running until the run's end says it
 * paused, and then waits (taskStatusListener.ts). A site that cannot be asked has the run stopped at once and its
 * task put back to wait. Either way the task's conversation
 * is marked, so the run that carries it on afterwards is told it was paused rather than starting from the
 * beginning (dispatchService.ts).
 */
import { withExecutionState } from '../../projects/executionState'
import { prisma } from 'wasp/server'
import type { AgentSession, Prisma, ScheduledChange } from '@prisma/client'
import { SCHEDULED_CHANGE_PAUSE_LEAD_MS, type ScheduledChangeKind } from '@agenthix/core'
import { tasksRunOnSite } from '../../projects/personalProject'
import { notifyBoardsOfTasks } from '../../projects/boardNotify'
import { Logger } from '../../server/utils/logger'
import { SCHEDULED_CHANGE_REASON_PREFIX, heldMessage, pausedReason, stoppedBy, type ChangeFacts } from './noticeWords'

const logger = new Logger('ScheduledChanges')

/** Past its time and its expected length by this much, a change no longer holds runs, whatever hq last heard. */
export const OVERRUN_MS = 2 * 60 * 60_000

const ENDED = ['done', 'rolledBack', 'cancelled', 'missed']

export type Hold = { row: ScheduledChange; reason: string; message: string }

type Facts = Pick<ScheduledChange, 'kind' | 'siteId'> & { siteName: string | null }
type WhatChanges = Pick<ChangeFacts, 'kind' | 'siteName'>

/** The latest a change can still hold runs: its time, its expected length, and the overrun. */
export function holdEnds(row: Pick<ScheduledChange, 'at' | 'expectedMinutes'>): number {
  return row.at.getTime() + (row.expectedMinutes ?? 0) * 60_000 + OVERRUN_MS
}

/** Whether the row holds runs now. Pure, for the sweep and the check alike. */
export function holding(row: Pick<ScheduledChange, 'at' | 'expectedMinutes' | 'state' | 'pausedAt' | 'resumedAt'>, now: Date): boolean {
  if (row.resumedAt || ENDED.includes(row.state)) return false
  if (now.getTime() > holdEnds(row)) return false
  return !!row.pausedAt || now.getTime() >= row.at.getTime() - SCHEDULED_CHANGE_PAUSE_LEAD_MS
}

async function siteNameOf(siteId: string | null): Promise<string | null> {
  if (!siteId) return null
  const site = await prisma.executionSite.findUnique({ where: { siteId }, select: { label: true } })
  return site?.label ?? 'its site'
}

async function factsOf(row: ScheduledChange): Promise<Facts & { kind: ScheduledChangeKind }> {
  return { kind: row.kind as ScheduledChangeKind, siteId: row.siteId, siteName: await siteNameOf(row.siteId) }
}

/** The change holding runs on this site now, if one is: one on the site's machine, or one to hq itself. */
export async function scheduledChangeHold(siteId: string, now = new Date()): Promise<Hold | null> {
  const rows = await prisma.scheduledChange.findMany({
    where: { resumedAt: null, state: { notIn: ENDED }, OR: [{ siteId }, { siteId: null, source: 'hq' }] },
    orderBy: { at: 'asc' },
  })
  const row = rows.find(r => holding(r, now))
  if (!row) return null
  const facts = await factsOf(row)
  return { row, reason: pausedReason(facts), message: heldMessage(facts) }
}

/** The tasks on what the change affects: its site's, or every site's for a change to hq itself. */
function onWhatItAffects(siteId: string | null): Prisma.TaskWhereInput {
  return siteId ? tasksRunOnSite(siteId) : {}
}

/** How hq stops a run for a scheduled change: `paused` asks the site to let the step going finish first. */
export type StopForChange = (siteId: string, runId: string, by: string, paused: boolean) => Promise<void>

/** What a task's row says while its run finishes its step before pausing. */
export function pausingReason(f: WhatChanges): string {
  return `Pausing for ${stoppedBy(f)}: it stops at the end of its current step, and carries on by itself when that is done.`
}

/** A paused task waiting while no change holds it any more: it starts again as soon as its agent is free. */
export const PAUSED_WAITING_REASON = `${SCHEDULED_CHANGE_REASON_PREFIX}. It carries on by itself.`

/** Why a task whose run has just paused waits: the change holding its site, or the plain words when none does now. */
export async function pausedTaskReason(siteId: string): Promise<string> {
  return (await scheduledChangeHold(siteId))?.reason ?? PAUSED_WAITING_REASON
}

const PAUSED_MARK = 'pausedForScheduledChange'

/** Marks the task's conversation as paused part way, for the run that carries it on. */
export async function markTaskConversationPaused(taskId: string): Promise<void> {
  const session = await prisma.agentSession.findUnique({ where: { taskId }, select: { id: true, metadata: true } })
  if (!session) return
  const metadata = { ...((session.metadata ?? {}) as Record<string, unknown>), [PAUSED_MARK]: true }
  await prisma.agentSession.update({ where: { id: session.id }, data: { metadata } })
}

/** Takes the mark off a task's conversation: the session as it is now, and whether its last run had paused. */
export async function takePausedMark(session: AgentSession): Promise<{ session: AgentSession; paused: boolean }> {
  const metadata = (session.metadata ?? {}) as Record<string, unknown>
  if (!metadata[PAUSED_MARK]) return { session, paused: false }
  const { [PAUSED_MARK]: _taken, ...rest } = metadata
  return { session: await prisma.agentSession.update({ where: { id: session.id }, data: { metadata: rest as Prisma.InputJsonObject } }), paused: true }
}

/**
 * Stops starting runs on what the change affects, and pauses each task run going there, to carry on afterwards.
 * Idempotent: a second call finds the row paused and does nothing.
 */
export async function pauseRuns(row: ScheduledChange, stop: StopForChange, siteOfTask: (taskId: string) => Promise<string>): Promise<number> {
  const { count } = await prisma.scheduledChange.updateMany({ where: { id: row.id, pausedAt: null }, data: { pausedAt: new Date() } })
  if (count === 0) return 0
  const facts = await factsOf(row)
  const going = await prisma.task.findMany({
    where: { runState: 'RUN_ACTIVE', runId: { not: null }, ...onWhatItAffects(row.siteId) },
    select: { id: true, runId: true },
  })
  const touched: string[] = []
  for (const task of going) {
    if (!task.runId) continue
    const siteId = row.siteId ?? (await siteOfTask(task.id).catch(() => null))
    if (siteId && await pauseAtEndOfStep(task.id, task.runId, siteId, facts, stop)) {
      touched.push(task.id)
      continue
    }
    // The task waits first, so the stopped run's end finds it no longer running and changes nothing.
    const { count: moved } = await prisma.task.updateMany({
      where: { id: task.id, runState: 'RUN_ACTIVE', runId: task.runId },
      data: { ...withExecutionState({ runState: 'RUN_QUEUED', runStateReason: pausedReason(facts) }), runId: null },
    })
    if (moved === 0) continue
    touched.push(task.id)
    await markTaskConversationPaused(task.id)
    try {
      if (!siteId) throw new Error('no site for the task')
      await stop(siteId, task.runId, stoppedBy(facts), false)
    } catch (err) {
      // The site may already be going down for the change; the run ends with it, and the task still waits.
      logger.warn(`could not stop run ${task.runId} for a scheduled change: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (touched.length) await notifyBoardsOfTasks(touched)
  return touched.length
}

/**
 * Asks the site to pause the run at the end of its step; the task stays running, saying it is pausing, until the
 * run's end arrives. False when the site cannot be asked, and the run is then stopped at once.
 */
async function pauseAtEndOfStep(taskId: string, runId: string, siteId: string, facts: WhatChanges, stop: StopForChange): Promise<boolean> {
  try {
    await stop(siteId, runId, stoppedBy(facts), true)
  } catch (err) {
    logger.warn(`could not ask run ${runId} to pause for a scheduled change, so it is stopped: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
  await prisma.task.updateMany({ where: { id: taskId, runState: 'RUN_ACTIVE', runId }, data: { runStateReason: pausingReason(facts) } })
  return true
}

/** The tasks waiting for this change. */
export function waitingFor(row: Pick<ScheduledChange, 'siteId'>): Prisma.TaskWhereInput {
  return { runState: 'RUN_QUEUED', runStateReason: { startsWith: SCHEDULED_CHANGE_REASON_PREFIX }, ...onWhatItAffects(row.siteId) }
}

/** Marks the hold over; the caller starts the waiting tasks again. False when it was already over. */
export async function endHold(row: ScheduledChange, opts: { reopen?: boolean } = {}): Promise<boolean> {
  const { count } = await prisma.scheduledChange.updateMany({
    where: { id: row.id, resumedAt: null },
    // A change moved later holds nothing now, and holds again from its new lead.
    data: opts.reopen ? { pausedAt: null } : { resumedAt: new Date() },
  })
  return count === 1
}
