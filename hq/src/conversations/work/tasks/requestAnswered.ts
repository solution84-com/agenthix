/**
 * A task run's request for approval was answered — in the conversation, or on the task's own card — so the
 * operations waiting on it move on (conversation layer spec, Approval): approved, they wait for the task's next
 * run, which the approval starts; declined, they end as cancelled, and the task waits for a person as a declined
 * task does today. Called by the one place a task's request is answered (agents/manifestActions.ts).
 */
import { prisma } from 'wasp/server'
import { settleOperation } from '../../coordinator/mailbox'
import { announce, moveOperation } from './taskOperations'

export const DECLINED_LINE = 'The request was declined; the task waits for a person.'

export async function taskRequestAnswered(runId: string, answer: 'approve' | 'decline'): Promise<void> {
  const waiting = await prisma.operation.findMany({ where: { kind: 'TASK', runId, state: 'WAITING_FOR_APPROVAL' }, select: { id: true } })
  for (const { id } of waiting) {
    if (answer === 'approve') {
      if (await moveOperation(id, ['WAITING_FOR_APPROVAL'], { state: 'QUEUED', runId: null })) await announce(id)
    } else {
      await settleOperation(id, { state: 'CANCELLED', result: { summary: DECLINED_LINE, runId } })
    }
  }
}
