/**
 * The rule that an agent works on one task at a time in a project, enforced by
 * the database. Before, the check ("is a task of this agent running in
 * this project?") and the write that took the slot were two statements, so two
 * claims racing — two pulses, a pulse and a person, or two hq processes — could
 * both see the slot free and both start a run.
 *
 * Each claim now runs in one transaction that first takes a Postgres advisory
 * lock keyed on the (agent, project) pair, then checks and writes. Every claim
 * of that pair queues on the same lock, across connections and processes, so
 * exactly one sees the slot free; the lock is released when the transaction
 * ends. The write itself is still conditional on the task's state, so a task a
 * stop or a revoke moved meanwhile is never pulled back to RUN_ACTIVE.
 *
 * Chosen over a partial unique index (one RUN_ACTIVE row per pair): that needs a
 * hand-written migration Prisma cannot express in the schema, and a violated
 * index surfaces as an error to translate rather than an answer. The lock needs
 * no schema change and keeps "slot taken" an ordinary result.
 *
 * Each agent's queued tasks in a project form one line (agents own schedule
 * spec §2): first the ones someone asked to start (`runStartedBy` set — a
 * person's Run, a schedule, `run_task`), then the rest, each by priority then
 * age. A start someone asked for goes ahead whatever the boundary's automation;
 * the rest only when automation is on, through the pulse.
 */
import { prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import { parseRunStartedBy, type RunStartedBy } from '@agenthix/core'
import { notifyBoardsOfTasks } from '../projects/boardNotify'
import { notBeforeItsTime } from '../projects/notBeforeItsTime'
import { HELD_FOR_RECONNECT_REASON, WAITING_FOR_AGENT_REASON } from './taskExecutionReasons'

type Tx = Prisma.TransactionClient

export { WAITING_FOR_AGENT_REASON }
export const SLOT_TAKEN_REASON = 'execution slot available'

/** In its agent's line: queued, assigned, and not held for a site that is down (the reconnect drain owns those). */
export const IN_LINE: Prisma.TaskWhereInput = {
  runState: 'RUN_QUEUED',
  archived: false,
  OR: [{ runStateReason: null }, { runStateReason: { not: HELD_FOR_RECONNECT_REASON } }],
}

const LINE_ORDER: Prisma.TaskOrderByWithRelationInput[] = [{ priority: 'desc' }, { createdAt: 'asc' }]

async function lockPair(tx: Tx, agentId: string, projectId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${agentId}), hashtext(${projectId}))`
}

async function slotHeld(tx: Tx, agentId: string, projectId: string, exceptTaskId?: string): Promise<boolean> {
  const running = await tx.task.findFirst({
    where: {
      assignedAgentId: agentId, projectId, runState: 'RUN_ACTIVE',
      ...(exceptTaskId ? { id: { not: exceptTaskId } } : {}),
    },
    select: { id: true },
  })
  return running !== null
}

/**
 * A start someone asked for counts from 0 (adr-0091): a person, the schedule a
 * person set, or an agent in a run a person started. The pulse starts what is
 * already in line, at the depth it was queued.
 */
function depthReset(startedBy: RunStartedBy): { queueDepth?: number } {
  return startedBy === 'pulse' ? {} : { queueDepth: 0 }
}

export type ClaimResult = 'claimed' | 'waiting' | 'skipped'

/**
 * Starts this task if its agent holds no RUN_ACTIVE task in the project:
 * steps it to RUN_ACTIVE and records what started it. When the slot is held it
 * stays RUN_QUEUED, now asked to start (`runStartedBy`), with a reason that
 * says what it waits for — it goes ahead when the agent's running task ends.
 * 'skipped' when the task is not pending (already started, withdrawn, stopped).
 * The pulse claims only what is in line; anyone else may also start a
 * throttled task, since a person is never held to the throttle.
 */
export async function claimTask(
  taskId: string,
  agentId: string,
  projectId: string,
  startedBy: RunStartedBy,
  personId: string | null = null,
): Promise<ClaimResult> {
  // Whose behalf the run is on goes with what started it (spec §9): a person's, or nobody's.
  const runOnBehalfOfUserId = startedBy === 'person' ? personId : null
  const pending: Prisma.TaskWhereInput = startedBy === 'pulse'
    ? { id: taskId, runState: 'RUN_QUEUED' }
    : { id: taskId, runState: { in: ['RUN_QUEUED', 'RUN_THROTTLED'] } }
  const result = await prisma.$transaction(async (tx) => {
    await lockPair(tx, agentId, projectId)
    if (await slotHeld(tx, agentId, projectId, taskId)) {
      const { count } = await tx.task.updateMany({
        where: pending,
        data: { runState: 'RUN_QUEUED', runStateReason: WAITING_FOR_AGENT_REASON, runStartedBy: startedBy, runOnBehalfOfUserId, ...depthReset(startedBy) },
      })
      return count === 1 ? 'waiting' : 'skipped'
    }
    const { count } = await tx.task.updateMany({
      where: pending,
      data: {
        runState: 'RUN_ACTIVE', runStateReason: SLOT_TAKEN_REASON, runStartedBy: startedBy, runOnBehalfOfUserId, runId: null,
        ...depthReset(startedBy),
      },
    })
    return count === 1 ? 'claimed' : 'skipped'
  })
  if (result !== 'skipped') await notifyBoardsOfTasks([taskId])
  return result
}

export type NextClaim = { id: string; title: string; startedBy: RunStartedBy; asked: boolean }

/**
 * When the pair's slot is free, steps the first task in the agent's line to
 * RUN_ACTIVE and returns it with what starts it. A start someone asked for
 * comes first; the rest of the line only when `includePulse` (the boundary's
 * automation is on), started by the pulse. Null when the slot is held or
 * nothing qualifies.
 */
export async function claimNext(agentId: string, projectId: string, includePulse: boolean): Promise<NextClaim | null> {
  const claim = await prisma.$transaction(async (tx) => {
    await lockPair(tx, agentId, projectId)
    if (await slotHeld(tx, agentId, projectId)) return null
    const line: Prisma.TaskWhereInput = { assignedAgentId: agentId, projectId, ...IN_LINE }
    const select = { id: true, title: true, runStartedBy: true, runOnBehalfOfUserId: true } as const
    let next = await tx.task.findFirst({ where: { ...line, runStartedBy: { not: null } }, orderBy: LINE_ORDER, select })
    const asked = next !== null
    if (!next && includePulse) {
      // The pulse never starts a task whose start time or round time is still to come (spec §3).
      next = await tx.task.findFirst({ where: { ...line, runStartedBy: null, ...notBeforeItsTime(new Date()) }, orderBy: LINE_ORDER, select })
    }
    if (!next) return null
    // A stored starter it cannot read is never taken for a person.
    const startedBy: RunStartedBy = asked ? parseRunStartedBy(next.runStartedBy) ?? 'pulse' : 'pulse'
    const { count } = await tx.task.updateMany({
      where: { id: next.id, runState: 'RUN_QUEUED' },
      data: {
        runState: 'RUN_ACTIVE', runStateReason: SLOT_TAKEN_REASON, runStartedBy: startedBy, runId: null,
        // A start a person asked for keeps their name; the pulse's run is nobody's.
        runOnBehalfOfUserId: startedBy === 'person' ? next.runOnBehalfOfUserId : null,
      },
    })
    return count === 1 ? { id: next.id, title: next.title, startedBy, asked } : null
  })
  if (claim) await notifyBoardsOfTasks([claim.id])
  return claim
}

