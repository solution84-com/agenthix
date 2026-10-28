/**
 * The card a proposal or a draft change leaves in the conversation whose work made the run (spec part 5; board C3),
 * and the line its review writes there, which the agent reads on its next turn. Written the way the workflow card is
 * found (`workflows/review/card.ts`): the conversation of the operation that ran the proposing run. A run no
 * conversation started has no card; its proposal is reviewed where its level's proposals are listed.
 */
import { prisma } from 'wasp/server'
import type { ActionBody } from '../../shared/conversations/protocol'
import { appendMessage } from '../../conversations/store/messages'
import { conversationEvents } from '../../conversations/coordinator/events'
import { Logger } from '../../server/utils/logger'

const logger = new Logger('SkillProposals')

/** The open conversation whose work ran this run, or null. */
export async function conversationOfRun(runId: string): Promise<string | null> {
  const op = await prisma.operation.findFirst({
    where: { runId }, orderBy: { createdAt: 'desc' }, select: { conversationId: true, conversation: { select: { status: true } } },
  })
  return op && op.conversation.status !== 'CLOSED' ? op.conversationId : null
}

/** One line per key: the same proposal answered again is the same card. A card that can't be written loses nothing stored. */
export async function writeSkillLine(conversationId: string, body: ActionBody, key: string): Promise<void> {
  try {
    const { message, duplicate } = await appendMessage({ conversationId, role: 'PLATFORM', kind: 'ACTION', body, clientMessageId: key })
    if (!duplicate) conversationEvents.message(conversationId, message)
  } catch (err) {
    logger.warn(`could not write the skill card in conversation ${conversationId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
