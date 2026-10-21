/**
 * The `Operation` rows of the tasks a conversation commissions (workers and results spec, Results): one per run
 * it asked for, *queued* until that run starts; then *running*, holding the run; and ended by the run's end. A task
 * set for a time is done once it is set (walkthrough finding 33): its row is written completed, holding when it
 * starts, and its run at that time is the task's own, never this conversation's. Ending goes through `settleOperation`; the moves between outstanding states are here,
 * each conditional on the state it moves from, so a duplicate frame moves nothing twice.
 */
import { Prisma } from '@prisma/client'
import { prisma } from 'wasp/server'
import type { ContinuationObligation, OperationStateValue } from '../../../shared/conversations/protocol'
import type { TurnCapability } from '../../contract'
import { randomUUID } from 'node:crypto'
import { openJson, sealJson, sealText, openText } from '../../sealing'
import { outstandingOperations } from '../settle'
import { conversationEvents } from '../../coordinator/events'

export interface NewTaskOperation {
  capability: TurnCapability & { actingUserId: string }
  toolName: string
  idempotencyKey: string
  title: string
  taskId: string
  projectId: string
  state: 'QUEUED'
  continuation: ContinuationObligation | null
  /** In a task's thread: the person's ask, which the run is given as its brief. */
  brief?: string | null
}

/** The states a task operation waits in before its run starts: a run starting is the one it asked for. */
export const BEFORE_ITS_RUN: OperationStateValue[] = ['ACCEPTED', 'QUEUED', 'WAITING_FOR_APPROVAL']

export async function pendingWithKey(conversationId: string, idempotencyKey: string): Promise<string | null> {
  const row = await prisma.operation.findUnique({
    where: { conversationId_idempotencyKey: { conversationId, idempotencyKey } },
    select: { id: true },
  })
  return row?.id ?? null
}

/** The new operation, or the pending one with the same key when two identical calls were admitted at once. */
export async function createTaskOperation(input: NewTaskOperation): Promise<{ operationId: string; alreadyRunning: boolean }> {
  const { capability, toolName, idempotencyKey, title, taskId, projectId, state, continuation, brief } = input
  try {
    const row = await prisma.operation.create({
      data: {
        conversationId: capability.conversationId,
        turnId: capability.turnId,
        kind: 'TASK',
        mode: 'BACKGROUND',
        toolName,
        idempotencyKey,
        state,
        title: sealText(title),
        authorisedById: capability.actingUserId,
        boundaryType: 'project',
        boundaryId: projectId,
        taskId,
        ...(brief ? { brief: sealText(brief) } : {}),
        ...(continuation ? { continuation } : {}),
      },
      select: { id: true },
    })
    return { operationId: row.id, alreadyRunning: false }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await pendingWithKey(capability.conversationId, idempotencyKey)
      if (winner) return { operationId: winner, alreadyRunning: true }
    }
    throw err
  }
}

/** What a task set for a time holds as its result: the task, and when it starts. */
export type SetTaskResult = { taskId: string; startsAt: string }

/**
 * A task set for a time: completed as it is written, holding when it starts. It holds no idempotency key, as an
 * ended operation does not (settle.ts): the same ask made again is a new call.
 */
export async function createSetTaskOperation(
  input: Omit<NewTaskOperation, 'state' | 'continuation' | 'brief'> & { startsAt: string },
): Promise<{ operationId: string }> {
  const { capability, toolName, idempotencyKey, title, taskId, projectId, startsAt } = input
  const id = randomUUID()
  const result: SetTaskResult = { taskId, startsAt }
  await prisma.operation.create({
    data: {
      id,
      conversationId: capability.conversationId,
      turnId: capability.turnId,
      kind: 'TASK',
      mode: 'FOREGROUND',
      toolName,
      idempotencyKey: `${idempotencyKey}:${id}`,
      state: 'COMPLETED',
      completedAt: new Date(),
      title: sealText(title),
      resultSummary: sealJson(result),
      authorisedById: capability.actingUserId,
      boundaryType: 'project',
      boundaryId: projectId,
      taskId,
    },
  })
  return { operationId: id }
}

/** When a task set for a time starts, from its operation's result; null for any other operation. */
export function setTaskStart(row: { kind: string; state: string; resultSummary: string | null }): Date | null {
  if (row.kind !== 'TASK' || row.state !== 'COMPLETED' || !row.resultSummary) return null
  const startsAt = openJson<Partial<SetTaskResult>>(row.resultSummary)?.startsAt
  return typeof startsAt === 'string' ? new Date(startsAt) : null
}

/** Tells the conversation's screens an operation's state changed. Best effort: the row is the record. */
export async function announce(operationId: string): Promise<void> {
  const row = await prisma.operation.findUnique({ where: { id: operationId }, select: { conversationId: true, state: true, title: true } })
  if (!row) return
  const outstanding = await outstandingOperations(row.conversationId)
  conversationEvents.operation({ conversationId: row.conversationId, operationId, state: row.state, title: openText(row.title), outstanding })
}

/** The task's run started: every operation of the task still waiting for a run now holds this one. */
export async function attachStartedRun(taskId: string, runId: string, siteId: string): Promise<string[]> {
  const waiting = await prisma.operation.findMany({
    where: { kind: 'TASK', taskId, state: { in: BEFORE_ITS_RUN }, OR: [{ runId: null }, { runId: { not: runId } }] },
    select: { id: true, state: true, runId: true },
  })
  const moved: string[] = []
  for (const op of waiting) {
    const { count } = await prisma.operation.updateMany({
      where: { id: op.id, state: op.state, runId: op.runId },
      data: { state: 'RUNNING', runId, siteId },
    })
    if (count === 1) moved.push(op.id)
  }
  return moved
}

/** The outstanding operations a run of the task is carrying out. */
export function operationsOfRun(taskId: string, runId: string): Promise<Array<{ id: string }>> {
  return prisma.operation.findMany({
    where: { kind: 'TASK', taskId, runId, state: { in: ['RUNNING', 'UNCERTAIN', 'WAITING_FOR_APPROVAL'] } },
    select: { id: true },
  })
}

/** Moves an operation from one outstanding state to another; false when it was no longer in `from`. */
export async function moveOperation(
  operationId: string,
  from: OperationStateValue[],
  data: { state: OperationStateValue; runId?: string | null; noReport?: boolean },
): Promise<boolean> {
  const { count } = await prisma.operation.updateMany({ where: { id: operationId, kind: 'TASK', state: { in: from } }, data })
  return count === 1
}
