/**
 * The rule that an agent works on one task at a time in a project, enforced by
 * the database. Before, the check ("is a task of this agent running in
 * this project?") and the write that took the slot were two statements, so two
 * claims racing — two Starts, a Start and a run's end, or two hq processes — could
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
 * Each agent's queued tasks in a project form one line (spec "The words"): the
 * tasks someone started for it — a person's Run or Start, a start time, an
 * agent's tool (`runStartedBy`) — taken one at a time in the project's rank
 * order (agentLineOrder.ts). Nothing else is ever in a line (adr-0175): a
 * queued task with no explicit starter is never claimed.
 */
import { withExecutionState } from '../projects/executionState'
import { prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import { notifyBoardsOfTasks } from '../projects/boardNotify'
import { NOT_AN_EPIC } from '../projects/epicRules'
import { EXPLICIT_STARTERS, LINE_ORDER, explicitStarterOf, type ExplicitStarter } from './agentLineOrder'
import { HELD_FOR_RECONNECT_REASON, WAITING_FOR_AGENT_REASON } from './taskExecutionReasons'

type Tx = Prisma.TransactionClient

export { WAITING_FOR_AGENT_REASON }
export const SLOT_TAKEN_REASON = 'execution slot available'

/**
 * In its agent's line: queued by an explicit act, not archived, and not held for a site that is down (the reconnect
 * drain owns those). Never an epic: an epic is not run (projects/epicRules.ts).
 */
export const IN_LINE: Prisma.TaskWhereInput = {
  runState: 'RUN_QUEUED',
  runStartedBy: { in: [...EXPLICIT_STARTERS] },
  archived: false,
  ...NOT_AN_EPIC,
  OR: [{ runStateReason: null }, { runStateReason: { not: HELD_FOR_RECONNECT_REASON } }],
}

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
 * A person's start, or the start time a person set, counts from 0 (adr-0091). An agent's start keeps the depth its
 * tool wrote when it put the task in line (server/controlplane/startGate.ts), so a chain is never reset by its own
 * links.
 */
function depthReset(startedBy: ExplicitStarter): { queueDepth?: number } {
  return startedBy === 'agent' ? {} : { queueDepth: 0 }
}

export type ClaimResult = 'claimed' | 'waiting' | 'skipped'

/**
 * Starts this task if its agent holds no RUN_ACTIVE task in the project:
 * steps it to RUN_ACTIVE and records what started it. When the slot is held it
 * stays RUN_QUEUED, now asked to start (`runStartedBy`), with a reason that
 * says what it waits for — it goes ahead when the agent's running task ends.
 * 'skipped' when the task is not pending (already started, withdrawn, stopped).
 */
export async function claimTask(
  taskId: string,
  agentId: string,
  projectId: string,
  startedBy: ExplicitStarter,
  personId: string | null = null,
): Promise<ClaimResult> {
  // Whose behalf the run is on goes with what started it (spec §9): a person's, or nobody's.
  const runOnBehalfOfUserId = startedBy === 'person' ? personId : null
  // Only a task of this pair: a task reassigned or moved meanwhile is another line's.
  const pending: Prisma.TaskWhereInput = { id: taskId, assignedAgentId: agentId, projectId, runState: 'RUN_QUEUED', ...NOT_AN_EPIC }
  const result = await prisma.$transaction(async (tx) => {
    await lockPair(tx, agentId, projectId)
    if (await slotHeld(tx, agentId, projectId, taskId)) {
      const { count } = await tx.task.updateMany({
        where: pending,
        data: { ...withExecutionState({ runState: 'RUN_QUEUED', runStateReason: WAITING_FOR_AGENT_REASON }), runStartedBy: startedBy, runOnBehalfOfUserId, ...depthReset(startedBy) },
      })
      return count === 1 ? 'waiting' : 'skipped'
    }
    const { count } = await tx.task.updateMany({
      where: pending,
      data: {
        ...withExecutionState({ runState: 'RUN_ACTIVE', runStateReason: SLOT_TAKEN_REASON }), runStartedBy: startedBy, runOnBehalfOfUserId, runId: null,
        lastWorkedAt: new Date(), ...depthReset(startedBy),
      },
    })
    return count === 1 ? 'claimed' : 'skipped'
  })
  if (result !== 'skipped') await notifyBoardsOfTasks([taskId])
  return result
}

export type NextClaim = { id: string; title: string; startedBy: ExplicitStarter }

/**
 * When the pair's slot is free, steps the first task in the agent's line (in rank order) to RUN_ACTIVE and returns
 * it with what started it. Null when the slot is held or the line is empty.
 */
export async function claimNext(agentId: string, projectId: string): Promise<NextClaim | null> {
  const claim = await prisma.$transaction(async (tx) => {
    await lockPair(tx, agentId, projectId)
    if (await slotHeld(tx, agentId, projectId)) return null
    const next = await tx.task.findFirst({
      where: { assignedAgentId: agentId, projectId, ...IN_LINE },
      orderBy: LINE_ORDER,
      select: { id: true, title: true, runStartedBy: true, runOnBehalfOfUserId: true },
    })
    const startedBy = next ? explicitStarterOf(next.runStartedBy) : null
    if (!next || !startedBy) return null
    const { count } = await tx.task.updateMany({
      where: { id: next.id, runState: 'RUN_QUEUED', runStartedBy: startedBy },
      data: {
        ...withExecutionState({ runState: 'RUN_ACTIVE', runStateReason: SLOT_TAKEN_REASON }), runStartedBy: startedBy, runId: null,
        lastWorkedAt: new Date(),
        // A start a person asked for keeps their name; any other run is nobody's.
        runOnBehalfOfUserId: startedBy === 'person' ? next.runOnBehalfOfUserId : null,
      },
    })
    return count === 1 ? { id: next.id, title: next.title, startedBy } : null
  })
  if (claim) await notifyBoardsOfTasks([claim.id])
  return claim
}
