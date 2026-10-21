/**
 * The conversation the dock opens when nothing is open (desktop shell spec §2): the one the person last wrote in,
 * on any device, that is still active and that they may still read. An agent writing elsewhere never moves it.
 */
import { HttpError, prisma } from 'wasp/server'
import { requireConversationReader } from './readingRule'

type Ctx = { user?: { id: string } | null }

/** How many of the latest written-in conversations are tried before giving up. */
const CANDIDATES = 5

export const getLastWrittenConversation = async (_args: void, context: Ctx): Promise<{ conversationId: string } | null> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const userId = context.user.id
  const latest = await prisma.conversationMessage.groupBy({
    by: ['conversationId'],
    where: { authorId: userId, role: 'PERSON', conversation: { status: 'ACTIVE' } },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: 'desc' } },
    take: CANDIDATES,
  })
  for (const { conversationId } of latest) {
    try {
      await requireConversationReader(conversationId, userId)
      return { conversationId }
    } catch { /* no longer theirs to read: try the next */ }
  }
  return null
}
