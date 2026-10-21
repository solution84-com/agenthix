import { prisma } from 'wasp/server'

/**
 * The title hq seeds a new session with (createSession), and the one title a
 * site's title may replace: the same value site's own row starts from, which is
 * how it knows the session is still unnamed.
 */
export const UNTITLED_SESSION_TITLE = 'New Conversation'

/**
 * Applies a title a site generated onto hq's copy — only while the copy still
 * holds the placeholder, decided by the database in the same statement as the
 * write (a compare-and-set, not a read followed by a write).
 *
 * A site names a session exactly once, from its first message, and every later
 * title change is a person's rename, which hq writes itself. So a title arriving
 * for a copy that already differs from the placeholder is either the same title
 * or a stale one — a frame that was in flight while the person renamed — and
 * must lose, or the two copies end up disagreeing about the name.
 */
export async function applySiteTitle(sessionId: string, title: string): Promise<void> {
  await prisma.agentSession.updateMany({
    where: { id: sessionId, title: UNTITLED_SESSION_TITLE },
    data: { title },
  })
}
