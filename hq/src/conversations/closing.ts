/**
 * Closing a project's conversations when the project or a person's place in it ends, beside where the same
 * happens to today's chats on each site (`memberLeftProject`, `projectDeleted`). Run inside the transaction that
 * ends it. A closed conversation keeps what was said and takes nothing more.
 *
 * Closing declines every request still waiting for an answer in it (conversation layer spec, Lifecycle contracts,
 * Conversation), so no worker is left waiting on an answer nobody can give there; its other work finishes on its
 * own. Declining tells sites, which cannot happen inside the caller's transaction, so each caller declines with
 * `declineWaitingInProject` once its transaction has committed; a close that rolled back declines nothing.
 */
import type { Prisma } from '@prisma/client'
import { prisma } from 'wasp/server'
import { Logger } from '../server/utils/logger'
import { operationOwner } from './work/registry'
import { requestDone } from './work/toolCalls/requests'

const logger = new Logger('ConversationClosing')

/** The note a worker is told its request was declined with. */
export const CLOSED_NOTE = 'The conversation that asked was closed, so nobody can answer this there.'

export async function closeProjectConversations(
  tx: Prisma.TransactionClient,
  projectId: string,
  reason: 'LEFT_PROJECT' | 'PROJECT_DELETED',
  openedBy?: string[],
) {
  return tx.conversation.updateMany({
    where: { home: 'PROJECT', projectId, status: { not: 'CLOSED' }, ...(openedBy ? { openedById: { in: openedBy } } : {}) },
    data: { status: 'CLOSED', closedReason: reason },
  })
}

/**
 * hq's copies of the sessions that worked in a deleted project, closed as their sites close them: nobody can open
 * them, but a stale status would still read as open. A session names its project by plain ids, so nothing cascades.
 */
export async function closeProjectSessions(tx: Prisma.TransactionClient, projectId: string) {
  return tx.agentSession.updateMany({
    where: { primaryOwnerType: 'project', primaryOwnerId: projectId, status: { not: 'CLOSED' } },
    data: { status: 'CLOSED', closedReason: 'PROJECT_DELETED' },
  })
}

/**
 * Declines what waits in the project's closed conversations; called by each closer once its transaction has
 * committed, beside telling the sites. Never throws: a failure is logged and the close stands.
 */
export async function declineWaitingInProject(projectId: string): Promise<void> {
  try {
    const closed = await prisma.conversation.findMany({
      where: { home: 'PROJECT', projectId, status: 'CLOSED', operations: { some: { state: 'WAITING_FOR_APPROVAL' } } },
      select: { id: true },
    })
    for (const c of closed) await declineWaitingIn(c.id)
  } catch (err) {
    logger.error(`Could not decline the requests waiting in project ${projectId}'s closed conversations`, err)
  }
}

/**
 * Declines what waits in a closed conversation, each at its owner, as its opener: a worker is told in a new run and
 * finishes as it decides; the lead's own call is cancelled. A task's request is the project's and stays on the
 * task's card for its people: the conversation only stops following it. A failure is logged and the rest go on.
 */
export async function declineWaitingIn(conversationId: string): Promise<void> {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { status: true, openedById: true } })
  if (conversation?.status !== 'CLOSED') return
  const waiting = await prisma.operation.findMany({
    where: { conversationId, state: 'WAITING_FOR_APPROVAL' },
    select: { id: true, kind: true },
    orderBy: { createdAt: 'asc' },
  })
  for (const op of waiting) {
    try {
      if (op.kind === 'TASK') await operationOwner('TASK').cancel(op.id, conversation.openedById)
      else await operationOwner(op.kind).answerApproval(op.id, 'decline', CLOSED_NOTE, conversation.openedById)
      await requestDone(op.id)
    } catch (err) {
      logger.error(`Could not decline operation ${op.id} of closed conversation ${conversationId}`, err)
    }
  }
}
