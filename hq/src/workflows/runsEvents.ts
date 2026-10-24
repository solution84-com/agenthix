/**
 * hq's handling of a run's step events and its result (workflows spec part 2, *Steps and progress*, step 7), from
 * the site that runs it: only that site's frames for that run are applied. A step event moves the step and shows the
 * end of its output so far; the result ends the run with every step's masked output, records each secret masking
 * found (S8) and tells the place's administrators to rotate it, and revokes the run's minted values.
 *
 * Events can be lost, like every site event: `refreshRunFromSite` asks the site with `workflow.get` and applies
 * what it says the same way.
 */
import { prisma } from 'wasp/server'
import { Prisma, type WorkflowRunState, type WorkflowStepState } from '@prisma/client'
import type { WorkflowRunReport, WorkflowRunResult, WorkflowStepEvent } from '@agenthix/core'
import { Logger } from '../server/utils/logger'
import { recordPrinted } from '../secrets/store'
import { revokeMintedTokens } from './integrationValues'
import { emitWorkflowRunChanged, notifyRunEnded, type LiveRun } from './runsLive'
import { parseRunResult, parseStepEvent } from './runsEventsParse'
import { tellAdministratorsOfPrintedSecret } from './runsPrinted'
import { runSiteCalls, type RunSiteCalls } from './runsSite'

const logger = new Logger('WorkflowRuns')

const upper = <T extends string>(s: string) => s.toUpperCase() as T
const date = (s: string | null) => (s ? new Date(s) : null)

const LIVE_SELECT = {
  id: true, workflowId: true, siteId: true, agentRunId: true, placeType: true, placeId: true, state: true,
  failureCode: true, workflow: { select: { name: true } },
} as const

async function runOfSite(siteId: string, runId: string) {
  const run = await prisma.workflowRun.findUnique({ where: { id: runId }, select: LIVE_SELECT })
  return run && run.siteId === siteId ? run : null
}

const inProgress = (state: WorkflowRunState) => state === 'WAITING' || state === 'RUNNING'

export async function handleWorkflowStepEvent(siteId: string, data: unknown): Promise<void> {
  const e = parseStepEvent(data)
  if (!e) return void logger.warn(`site ${siteId}: rejected a malformed workflow.step event — dropped`)
  const run = await runOfSite(siteId, e.runId)
  if (!run || !inProgress(run.state)) return
  await applyStep(run.id, e)
  if (run.state === 'WAITING') {
    await prisma.workflowRun.updateMany({ where: { id: run.id, state: 'WAITING' }, data: { state: 'RUNNING', startedAt: date(e.startedAt) ?? new Date() } })
  }
  await emitWorkflowRunChanged({ ...run, state: 'RUNNING' })
}

async function applyStep(runId: string, e: WorkflowStepEvent): Promise<void> {
  await prisma.workflowStepRun.updateMany({
    where: { runId, index: e.index },
    data: {
      state: upper<WorkflowStepState>(e.state),
      exitCode: e.exitCode,
      output: e.outputTail,
      outputTruncated: e.outputTruncated,
      startedAt: date(e.startedAt),
      endedAt: date(e.endedAt),
    },
  })
}

export async function handleWorkflowResultEvent(siteId: string, data: unknown): Promise<void> {
  const r = parseRunResult(data)
  if (!r) return void logger.warn(`site ${siteId}: rejected a malformed workflow.result event — dropped`)
  const run = await runOfSite(siteId, r.runId)
  if (!run) return
  await applyResult(run, r)
}

/** Applies a result once. A run hq gave up on when the site went quiet still takes the site's result. */
async function applyResult(run: Awaited<ReturnType<typeof runOfSite>> & object, r: WorkflowRunResult): Promise<void> {
  const takes = inProgress(run.state) || (run.state === 'FAILED' && run.failureCode === 'site_error')
  if (!takes) return
  const state = upper<WorkflowRunState>(r.state)
  const updated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.workflowRun.updateMany({
      where: { id: run.id, state: run.state, failureCode: run.failureCode },
      data: {
        state,
        failureCode: r.failure?.code ?? null,
        failureMessage: r.failure?.message ?? null,
        printedSecret: r.printedSecretNames.length > 0,
        leaks: r.leaks.length ? (r.leaks as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        writeBack: r.writeBack ? (r.writeBack as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        startedAt: new Date(r.startedAt),
        endedAt: new Date(r.endedAt),
      },
    })
    if (count === 0) return false
    for (const s of r.steps) {
      await tx.workflowStepRun.updateMany({
        where: { runId: run.id, index: s.index },
        data: {
          state: upper<WorkflowStepState>(s.state), exitCode: s.exitCode, output: s.output, outputTruncated: s.outputTruncated,
          startedAt: date(s.startedAt), endedAt: date(s.endedAt),
        },
      })
    }
    // A step the site never reported didn't run.
    await tx.workflowStepRun.updateMany({ where: { runId: run.id, state: { in: ['WAITING', 'RUNNING'] } }, data: { state: r.state === 'stopped' ? 'STOPPED' : 'SKIPPED' } })
    return true
  })
  if (!updated) return
  const place = { type: run.placeType, id: run.placeId }
  notifyRunEnded(run.id)
  await afterEnd(run, place, r.printedSecretNames)
  await emitWorkflowRunChanged({ ...run, state } satisfies LiveRun)
}

async function afterEnd(run: { id: string; workflowId: string; workflow: { name: string } }, place: { type: 'project' | 'user'; id: string }, printed: string[]) {
  try {
    if (printed.length) {
      await recordPrinted(place, run.id, printed)
      await tellAdministratorsOfPrintedSecret(place, run.workflow.name, printed)
    }
  } catch (err) {
    logger.error(`run ${run.id}: could not record the secrets its output printed`, err)
  }
  await revokeMintedTokens(run.id, place).catch((err) => logger.error(`run ${run.id}: could not revoke its minted values`, err))
}

/** Brings a run still in progress up to date from its site, for when events were lost. */
export async function refreshRunFromSite(runId: string, sites: Pick<RunSiteCalls, 'get'> = runSiteCalls): Promise<void> {
  const run = await prisma.workflowRun.findUnique({ where: { id: runId }, select: LIVE_SELECT })
  if (!run || !inProgress(run.state)) return
  const report: WorkflowRunReport | null = await sites.get(run.siteId, runId)
  if (!report || report.runId !== runId) return
  if (report.result) {
    const result = parseRunResult(report.result)
    if (result && result.runId === runId) await applyResult(run, result)
    return
  }
  for (const step of report.steps) {
    const e = parseStepEvent(step)
    if (e && e.runId === runId) await applyStep(runId, e)
  }
}
