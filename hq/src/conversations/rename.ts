/**
 * Rename (the conversation's ⋯ menu): the title a conversation gets from its first answer, or one a person gives it.
 * Whoever may speak in a conversation may rename it, by the same rule as every change to it.
 */
import { HttpError, prisma } from 'wasp/server'
import type { RenameConversationArgs } from '../shared/conversations/protocol'
import { requireConversationSpeaker } from './readingRule'

export const TITLE_MAX_CHARS = 120

export const renameConversation = async (args: RenameConversationArgs, context: { user?: { id: string } | null }): Promise<void> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const title = typeof args?.title === 'string' ? args.title.replace(/\s+/g, ' ').trim() : ''
  if (!title) throw new HttpError(400, 'Give the conversation a name. Nothing was changed.')
  if (title.length > TITLE_MAX_CHARS) throw new HttpError(400, `A name is at most ${TITLE_MAX_CHARS} characters. Nothing was changed.`)
  const ref = await requireConversationSpeaker(args.conversationId, context.user.id)
  await prisma.conversation.update({ where: { id: ref.id }, data: { title } })
}
