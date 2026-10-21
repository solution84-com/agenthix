/**
 * Whose memory a turn's probe searches (memory and knowledge spec, Knowledge delivery's table; conversation layer
 * spec, Turns that answer no person): the agent's memory of the conversation's place, and the scopes of the person
 * the turn is for — the author of the messages it answers; for a continuation, who authorised it; for a report, the
 * person the operation was for, who commissioned it. A report on the work of several people at once is for none of
 * them, and searches the place's memory only.
 */
import { prisma } from 'wasp/server'
import type { MemoryPrincipal, Place } from '../../memory/contract'
import { personalOwnerOf, taskRunOwner } from '../../projects/personalProject'
import type { ConversationHomeRef } from '../contract'

/** The conversation's place now: the opener's own space, its project (a personal one is its person's), or its task's. */
export async function conversationPlace(conversation: ConversationHomeRef): Promise<Place | null> {
  if (conversation.home === 'PERSON') return { type: 'user', id: conversation.openedById }
  if (conversation.home === 'PROJECT') {
    if (!conversation.projectId) return null
    const owner = await personalOwnerOf(conversation.projectId)
    return owner ? { type: 'user', id: owner } : { type: 'project', id: conversation.projectId }
  }
  if (!conversation.taskId) return null
  const owner = await taskRunOwner(conversation.taskId)
  return owner ? { type: owner.ownerType, id: owner.ownerId } : null
}

/** The one person the operations were for, or null when there are several or none. */
async function commissionedBy(operationIds: readonly string[]): Promise<string | null> {
  if (operationIds.length === 0) return null
  const rows = await prisma.operation.findMany({ where: { id: { in: [...operationIds] } }, select: { authorisedById: true } })
  const people = new Set(rows.map(r => r.authorisedById))
  return people.size === 1 ? [...people][0]! : null
}

/** Someone who has left the organisation has no memory read for them (adr-0101). */
async function stillHere(personId: string | null): Promise<string | null> {
  if (!personId) return null
  const row = await prisma.user.findUnique({ where: { id: personId }, select: { deactivatedAt: true } })
  return row && row.deactivatedAt === null ? personId : null
}

export async function turnPrincipal(input: {
  conversation: ConversationHomeRef
  agentId: string
  trigger: 'MESSAGE' | 'REPORT' | 'CONTINUATION'
  actingUserId: string | null
  /** The operations of the cards a report or continuation turn takes. */
  operationIds: readonly string[]
}): Promise<MemoryPrincipal> {
  const person = input.trigger === 'REPORT' ? await commissionedBy(input.operationIds) : input.actingUserId
  const [personId, place] = await Promise.all([stillHere(person), conversationPlace(input.conversation)])
  return { personId, agentId: input.agentId, place }
}
