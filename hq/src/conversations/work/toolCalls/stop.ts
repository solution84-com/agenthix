/**
 * Stop on an operation's row or card, or the lead's `cancel_operation` on the person's word (conversation layer
 * spec, Conversation activity, Stopping): the operation's owner stops it — a worker's run is stopped on its site,
 * a task operation detached and the task left as it is, a call's result abandoned — and its cancelled card comes
 * from the mailbox. Work that has already ended is left as it is; stopping it twice is not an error.
 */
import { HttpError, prisma } from 'wasp/server'
import { OUTSTANDING_OPERATION_STATES } from '../../../shared/conversations/protocol'
import { ownerOf } from './registryLater'
import { requestDone } from './requests'

export const WORK_NOT_FOUND = 'That work was not found'

/** `stopped` is false when the work had already ended. */
export async function stopOperation(conversationId: string, operationId: string, byUserId: string): Promise<{ stopped: boolean }> {
  const op = await prisma.operation.findFirst({ where: { id: operationId, conversationId }, select: { id: true, kind: true, state: true } })
  if (!op) throw new HttpError(404, WORK_NOT_FOUND)
  if (!(OUTSTANDING_OPERATION_STATES as readonly string[]).includes(op.state)) return { stopped: false }
  await (await ownerOf(op.kind)).cancel(op.id, byUserId)
  if (op.state === 'WAITING_FOR_APPROVAL') await requestDone(op.id)
  return { stopped: true }
}
