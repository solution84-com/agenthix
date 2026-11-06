/**
 * A run's result (workers and results spec, Results): stated by its agent with set_result, or marked as not
 * stated when the run ends without it. Every run gets one row, keyed by the run, so whoever presents a run's end
 * reads it here. A task's run gets its row when it starts, with its number, and a task's result is its latest
 * run's (taskRunResults.ts).
 */
import { prisma } from 'wasp/server'
import { type RunStatusEvent } from '@agenthix/core'
import { notifyBoardsOfTasks } from '../../projects/boardNotify'
import { sessionOwnedBy } from '../../sites/channel/sessionOwnerSite'
import { onRunStatus } from '../../sites/channel/siteEventHandler'
import { Logger } from '../utils/logger'

const logger = new Logger('RunResults')

export interface StatedResult {
  runId: string
  siteId: string
  sessionId: string
  taskId: string | null
  result: string
}

/** A later statement in the same run replaces the earlier one. */
export async function recordStatedResult(input: StatedResult): Promise<void> {
  const { runId, siteId, sessionId, taskId, result } = input
  await prisma.runResult.upsert({
    where: { runId },
    create: { runId, siteId, sessionId, taskId, result, stated: true },
    update: { result, stated: true },
  })
  if (taskId) await notifyBoardsOfTasks([taskId])
}

/** The run ended: unless it stated a result, it is recorded as having stated none. A repeat changes nothing. */
export async function markEndedRun(e: Pick<RunStatusEvent, 'runId' | 'sessionId' | 'taskId'>, siteId: string): Promise<void> {
  await prisma.runResult.createMany({
    data: [{ runId: e.runId, siteId, sessionId: e.sessionId, taskId: e.taskId, result: null, stated: false }],
    skipDuplicates: true,
  })
}

export type RunResultRow = { result: string | null; stated: boolean }

export function readRunResult(runId: string): Promise<RunResultRow | null> {
  return prisma.runResult.findUnique({ where: { runId }, select: { result: true, stated: true } })
}

const TERMINAL: ReadonlySet<RunStatusEvent['status']> = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])

export function registerRunResultListener(): void {
  onRunStatus('run-result', async (e, siteId) => {
    if (!TERMINAL.has(e.status)) return
    // Only the site that holds the session may say how its run ended.
    if (!(await sessionOwnedBy(e.sessionId, siteId))) return
    await markEndedRun(e, siteId).catch(err => logger.error(`could not mark the end of run ${e.runId}`, err))
  })
}
