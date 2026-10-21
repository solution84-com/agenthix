/**
 * A key the provider refused (model access spec: when its access stops being usable, the conversation says so
 * and offers the next). The key is still stored, so it reads as usable; what says otherwise is the
 * conversation's latest turn, failed with the model adapter's `auth`, and no switch since — a switch writes a
 * notice after it. The refused key is the one the conversation talks on: its provider and the owner its turns
 * last ran on (kept current by each turn, turnRecord.ts).
 */
import { prisma } from 'wasp/server'
import type { RefusedAccess } from '../access/homeAccess'

export async function latestRefusal(conversationId: string): Promise<RefusedAccess | null> {
  const [conversation, turn] = await Promise.all([
    prisma.conversation.findUnique({ where: { id: conversationId }, select: { talkingProvider: true, accessOwnerType: true } }),
    prisma.inferenceTurn.findFirst({
      where: { conversationId, endedAt: { not: null } },
      orderBy: { endedAt: 'desc' },
      select: { state: true, errorKind: true, endedAt: true },
    }),
  ])
  if (!conversation?.talkingProvider || !conversation.accessOwnerType) return null
  if (!turn || turn.state !== 'FAILED' || turn.errorKind !== 'auth') return null
  const switchedSince = await prisma.conversationMessage.findFirst({
    where: { conversationId, kind: 'NOTICE', createdAt: { gt: turn.endedAt! } },
    select: { id: true },
  })
  if (switchedSince) return null
  return { owner: conversation.accessOwnerType, provider: conversation.talkingProvider }
}
