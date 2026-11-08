/**
 * A routine run follows its run's frames (`run.status`, relayed by siteEventHandler.ts): running, then finished,
 * failed or stopped, and whether it waits for the person — a tool request to approve, or its time or turn limit.
 * A run that ended waiting for an approval carries on in the same session when it is given, and the routine run
 * follows that run too.
 *
 * The routine run is found by its session (one per run), and a frame is taken only from the site the run was sent
 * to. A late or repeated frame of a run the routine run has already moved past changes nothing: a run's end is taken
 * only for the run it records, and only once; a new run in the session (after an approval) takes over the record.
 */
import { prisma } from 'wasp/server'
import type { Prisma, RoutineRun } from '@prisma/client'
import { isRunLimitReason, type RunStatusEvent } from '@agenthix/core'
import { onRunStatus } from '../sites/channel/siteEventHandler'
import { Logger } from '../server/utils/logger'
import { checkRoutineFailing } from './routineFailing'

const logger = new Logger('RoutineRunStatus')

/** What a frame makes of the routine run; null when it changes nothing. */
export function frameChange(run: Pick<RoutineRun, 'runId' | 'state' | 'endedAt'>, e: RunStatusEvent, now: Date): Prisma.RoutineRunUpdateInput | null {
  const sameRun = run.runId === null || run.runId === e.runId
  if (e.status === 'RUNNING') {
    // The run it records, starting; or the run an approval started in its session, after the last one ended.
    if (sameRun && (run.state === 'STARTING' || run.state === 'RUNNING')) return run.state === 'RUNNING' && run.runId ? null : { state: 'RUNNING', runId: e.runId }
    if (!sameRun && run.endedAt) return { state: 'RUNNING', runId: e.runId, ask: null, reason: null, endedAt: null }
    // A dispatch whose answer never came was taken as failed, but the site started it after all: it is going.
    if (run.runId === null && run.state === 'FAILED') return { state: 'RUNNING', runId: e.runId, reason: null, endedAt: null }
    return null
  }
  if (!sameRun || (run.state !== 'STARTING' && run.state !== 'RUNNING')) return null
  const ask = e.manifestPending ? 'approval' : e.status === 'CANCELLED' && isRunLimitReason(e.error) ? 'limit' : null
  const state = e.status === 'COMPLETED' ? 'FINISHED' : e.status === 'FAILED' ? 'FAILED' : ask === 'limit' ? 'FINISHED' : 'STOPPED'
  return { state, ask, runId: e.runId, reason: state === 'FAILED' ? e.error ?? 'The run failed' : ask === 'limit' ? e.error : null, endedAt: now }
}

export async function processRoutineRunStatus(e: RunStatusEvent, siteId: string, now: Date = new Date()): Promise<void> {
  if (e.taskId) return
  const run = await prisma.routineRun.findUnique({ where: { sessionId: e.sessionId } })
  if (!run) return
  if (run.siteId !== siteId) {
    logger.warn(`a frame for routine run ${run.id} came from site ${siteId}, not the site it was sent to — dropped`)
    return
  }
  const change = frameChange(run, e, now)
  if (!change) return
  // Written only over the state the change was worked out from, so two frames at once settle it once.
  const { count } = await prisma.routineRun.updateMany({
    where: { id: run.id, state: run.state, runId: run.runId },
    data: change as Prisma.RoutineRunUpdateManyMutationInput,
  })
  if (count === 1 && change.endedAt) await checkRoutineFailing(run.routineId)
}

onRunStatus('routine-runs', (e, siteId) => processRoutineRunStatus(e, siteId))
