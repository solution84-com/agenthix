/** The zoom tools wired to the record and the window. */
import { prisma } from 'wasp/server'
import { COMPACT_HIGH_MARK } from '../../../shared/conversations/protocol'
import type { ConversationTool } from '../../contract'
import { appendMessage, toMessageView } from '../../store/messages'
import { conversationEvents } from '../../coordinator/events'
import { openText } from '../../sealing'
import { createZoomTools } from './tools'
import { contextWindowOf } from '../windows'

export { ZOOM_RULES } from './rules'

/** The window an expansion plans against before the conversation has a talking model. */
export const ZOOM_DEFAULT_WINDOW_TOKENS = 128_000

export const OFFER_TOOL = 'offer_new_conversation'

export const zoomTools: ConversationTool[] = createZoomTools({
  async segments(conversationId) {
    const rows = await prisma.conversationSegment.findMany({ where: { conversationId }, orderBy: { firstSeq: 'asc' } })
    return rows.map(r => ({
      id: r.id, firstSeq: r.firstSeq, lastSeq: r.lastSeq, firstAt: r.firstAt.toISOString(), lastAt: r.lastAt.toISOString(),
      brief: openText(r.brief), summary: openText(r.summary),
    }))
  },
  async folded(conversationId) {
    return (await prisma.conversationSegment.count({ where: { conversationId } })) > 0
  },
  async messagesIn(conversationId, firstSeq, lastSeq) {
    const rows = await prisma.conversationMessage.findMany({
      where: { conversationId, seq: { gte: firstSeq, lte: lastSeq } },
      orderBy: { seq: 'asc' },
    })
    return rows.map(toMessageView)
  },
  async roomTokens(capability) {
    // The size of the context is what the last model call sent (long conversations, the marks).
    const [last, conversation] = await Promise.all([
      prisma.inferenceTurn.findFirst({
        where: { conversationId: capability.conversationId, state: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        select: { contextTokens: true },
      }),
      prisma.conversation.findUnique({ where: { id: capability.conversationId }, select: { talkingModel: true } }),
    ])
    const window = conversation?.talkingModel ? contextWindowOf(conversation.talkingModel) : ZOOM_DEFAULT_WINDOW_TOKENS
    return Math.max(0, Math.floor(window * COMPACT_HIGH_MARK) - (last?.contextTokens ?? 0))
  },
  async offerNewConversation(capability, about) {
    const { message } = await appendMessage({
      conversationId: capability.conversationId,
      role: 'PLATFORM',
      kind: 'ACTION',
      body: { text: `You could carry on with ${about} in a new conversation`, toolName: OFFER_TOOL },
      agentId: capability.agentId,
      turnId: capability.turnId,
    })
    conversationEvents.message(capability.conversationId, message)
  },
})
