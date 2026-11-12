/**
 * The turn a demo model call belongs to, read from hq's records: the conversation's running turn (its lock), the
 * agent speaking in it and the words of the person's messages it took.
 */
import { prisma } from 'wasp/server'
import { openJson } from '../../conversations/sealing'
import type { DemoTurn } from './steps'

export async function demoTurnOf(conversationId: string): Promise<DemoTurn | null> {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { activeTurnId: true } })
  if (!conversation?.activeTurnId) return null
  const turn = await prisma.inferenceTurn.findUnique({
    where: { id: conversation.activeTurnId },
    select: { id: true, trigger: true, agentId: true, actingUserId: true },
  })
  if (!turn) return null
  const [agent, messages] = await Promise.all([
    turn.agentId ? prisma.agent.findUnique({ where: { id: turn.agentId }, select: { handle: true } }) : null,
    prisma.conversationMessage.findMany({
      where: { conversationId, turnId: turn.id, role: 'PERSON', kind: 'TEXT' },
      orderBy: { seq: 'asc' },
      select: { body: true },
    }),
  ])
  const words = messages.map(m => openJson<{ text?: unknown }>(m.body).text).filter((t): t is string => typeof t === 'string')
  return {
    turnId: turn.id, trigger: turn.trigger, agentHandle: agent?.handle ?? null, agentId: turn.agentId ?? null,
    personId: turn.actingUserId ?? null, personText: words.join('\n'),
  }
}
