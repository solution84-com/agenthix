/**
 * Ending an operation (conversation layer spec, Background operation): one conditional update from any outstanding
 * state to an ended one, so a duplicate or late event ends nothing twice, then the mailbox writes its card and
 * wakes the conversation. Every owner — workers, tasks, a lead's own call — ends its operations here.
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { OUTSTANDING_OPERATION_STATES } from '../../shared/conversations/protocol'
import type { Mailbox, OperationEnd, SettleOperation } from '../contract'
import { sealJson } from '../sealing'

export function createSettleOperation(mailbox: () => Mailbox): SettleOperation {
  return async (operationId, end: OperationEnd) => {
    const row = await prisma.operation.findUnique({ where: { id: operationId }, select: { idempotencyKey: true } })
    if (!row) return false
    const data: Prisma.OperationUpdateManyMutationInput = {
      state: end.state,
      completedAt: new Date(),
      // Only a pending operation holds its key: the same call made after this one ended is a new call.
      idempotencyKey: `${row.idempotencyKey}:${operationId}`,
      ...(end.result ? { resultSummary: sealJson(end.result) } : {}),
      ...(end.error ? { error: end.error } : {}),
      ...(end.noReport ? { noReport: true } : {}),
    }
    const { count } = await prisma.operation.updateMany({
      where: { id: operationId, state: { in: [...OUTSTANDING_OPERATION_STATES] } },
      data,
    })
    if (count === 0) return false
    await mailbox().operationEnded(operationId)
    return true
  }
}

/** The count of the conversation's live work. */
export async function outstandingOperations(conversationId: string): Promise<number> {
  return prisma.operation.count({ where: { conversationId, state: { in: [...OUTSTANDING_OPERATION_STATES] } } })
}
