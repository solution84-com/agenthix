/**
 * What the site keeps of a run in its database (`ExecutorRun`, `ExecutorSnapshot`): enough to answer `workflow.get`
 * and to clean up after a crash, never the instruction, a secret, a parameter or the masking material. The result
 * stored is the one sent to hq, which holds masked output only.
 */
import { prisma } from '#db'
import type { ExecutorRunState, Prisma } from '@prisma/client'
import { WORKFLOW_STEP_EVENT_OUTPUT_MAX } from '@agenthix/core'
import type { WorkflowRunInstruction, WorkflowRunReport, WorkflowRunResult, WorkflowRunState } from '@agenthix/core'
import type { SnapshotKind } from './snapshot'

export const UNFINISHED_STATES: ExecutorRunState[] = ['RUNNING', 'SCANNING', 'WRITING_BACK']

export async function isKnownRun(runId: string): Promise<boolean> {
  return (await prisma.executorRun.count({ where: { id: runId } })) > 0
}

export async function recordRunStart(ins: WorkflowRunInstruction): Promise<void> {
  await prisma.executorRun.create({
    data: {
      id: ins.runId,
      ownerType: ins.workspace.ownerType,
      ownerId: ins.workspace.ownerId,
      workspaceId: ins.workspace.workspaceId,
    },
  })
}

export async function recordProgress(runId: string, data: { state?: ExecutorRunState; currentStep?: number | null }): Promise<void> {
  await prisma.executorRun.update({ where: { id: runId }, data })
}

export async function recordSnapshot(runId: string, kind: SnapshotKind): Promise<void> {
  await prisma.executorSnapshot.create({ data: { runId, kind } })
}

export async function recordSnapshotRemoved(runId: string): Promise<void> {
  await prisma.executorSnapshot.updateMany({ where: { runId, removedAt: null }, data: { removedAt: new Date() } })
}

export async function recordResult(result: WorkflowRunResult): Promise<void> {
  await prisma.executorRun.update({
    where: { id: result.runId },
    data: {
      state: result.state === 'passed' ? 'PASSED' : result.state === 'stopped' ? 'STOPPED' : 'FAILED',
      currentStep: null,
      result: result as unknown as Prisma.InputJsonValue,
      endedAt: new Date(result.endedAt),
    },
  })
}

const STATE_FOR: Record<ExecutorRunState, WorkflowRunState> = {
  RUNNING: 'running', SCANNING: 'running', WRITING_BACK: 'running', PASSED: 'passed', FAILED: 'failed', STOPPED: 'stopped',
}

/** A run this site no longer has in memory, from its row; null when it never had it. */
export async function loadRunReport(runId: string): Promise<WorkflowRunReport | null> {
  const row = await prisma.executorRun.findUnique({ where: { id: runId } })
  if (!row) return null
  const result = (row.result ?? null) as unknown as WorkflowRunResult | null
  const steps = (result?.steps ?? []).map(s => ({
    runId, index: s.index, name: s.name, state: s.state, startedAt: s.startedAt, endedAt: s.endedAt, exitCode: s.exitCode,
    outputTail: s.output.slice(-WORKFLOW_STEP_EVENT_OUTPUT_MAX),
    outputTruncated: s.outputTruncated || s.output.length > WORKFLOW_STEP_EVENT_OUTPUT_MAX,
  }))
  return { runId, state: STATE_FOR[row.state], steps, result }
}

/** Runs a crash left unfinished. */
export async function listUnfinishedRuns(): Promise<{ id: string; startedAt: Date; state: ExecutorRunState }[]> {
  return prisma.executorRun.findMany({ where: { state: { in: UNFINISHED_STATES } }, select: { id: true, startedAt: true, state: true } })
}

export async function listSnapshotsNotRemoved(): Promise<string[]> {
  return (await prisma.executorSnapshot.findMany({ where: { removedAt: null }, select: { runId: true } })).map(r => r.runId)
}
