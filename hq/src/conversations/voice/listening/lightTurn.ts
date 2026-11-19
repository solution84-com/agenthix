/**
 * A turn the light model closed alone (adaptive voice listening, spec §When a turn ends; plan task 3.5) is a real turn:
 * one completed `InferenceTurn` on the light model, the person's spoken message attached to it — so no claim ever takes
 * it and the heavy model never answers it later (claim.ts takes only messages with no turn) — and what the person heard
 * stored as its agent message; the screens told as for any reply. Its cost is the listening call's, in the usage ledger
 * under `listener`. It holds no lock: it runs no model, and is complete when written.
 */
import { randomUUID } from 'node:crypto'
import { prisma } from 'wasp/server'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import type { ResolvedAccess, TurnUsage } from '../../contract'
import { appendMessageIn } from '../../store/messages'
import { leadAgentId } from '../../taskThread/lead'
import type { ConversationEvents } from '../../coordinator/events'

export interface LightTurn {
  conversationId: string
  holderId: string
  /** The person's words this turn. */
  message: string
  /** What they heard: the light model's lines, ending with the one that closed the turn. */
  agentText: string
  access: Pick<ResolvedAccess, 'model' | 'providerId'>
  usage?: TurnUsage
}

export async function recordLightTurn(turn: LightTurn, events: Pick<ConversationEvents, 'message' | 'turn'>, now: Date = new Date()): Promise<string> {
  const written = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${turn.conversationId} FOR UPDATE`
    const row = await tx.conversation.findUniqueOrThrow({
      where: { id: turn.conversationId }, select: { home: true, taskId: true, agentId: true, voiceHolderId: true },
    })
    const agentId = await leadAgentId(row)
    // The context's size is the heavy model's: a light turn sends it none, so the last one stands for the marks.
    const last = await tx.inferenceTurn.findFirst({
      where: { conversationId: turn.conversationId, contextTokens: { gt: 0 } }, orderBy: { createdAt: 'desc' }, select: { contextTokens: true },
    })
    const usage = turn.usage
    const { id: turnId } = await tx.inferenceTurn.create({
      data: {
        conversationId: turn.conversationId, state: 'COMPLETED', trigger: 'MESSAGE', actingUserId: turn.holderId, agentId,
        model: turn.access.model, providerId: turn.access.providerId,
        inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0,
        cacheReadTokens: usage?.cacheReadTokens ?? 0, cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
        contextTokens: last?.contextTokens ?? 0,
        createdAt: now, startedAt: now, firstTokenAt: now, endedAt: now,
      },
      select: { id: true },
    })
    const person = await appendMessageIn(tx, {
      conversationId: turn.conversationId, role: 'PERSON', kind: 'TEXT', body: { text: turn.message }, authorId: turn.holderId,
      clientMessageId: randomUUID(), turnId, spoken: row.voiceHolderId === turn.holderId,
    })
    const agent = await appendMessageIn(tx, {
      conversationId: turn.conversationId, role: 'AGENT', kind: 'TEXT', body: { text: turn.agentText }, agentId, turnId,
    })
    return { turnId, messages: [person.message, agent.message] as ConversationMessageView[] }
  })
  events.turn({ conversationId: turn.conversationId, turnId: written.turnId, state: 'RUNNING' })
  for (const message of written.messages) events.message(turn.conversationId, message)
  events.turn({ conversationId: turn.conversationId, turnId: written.turnId, state: 'COMPLETED' })
  return written.turnId
}
