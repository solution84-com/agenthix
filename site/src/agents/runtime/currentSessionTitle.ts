import { prisma } from '#db'
import { Logger } from '../../server/utils/logger'

const logger = new Logger('CurrentSessionTitle')

/** The title hq seeds a new session with (hq's createSession). */
export const UNTITLED_SESSION_TITLE = 'New Conversation'

/**
 * The session's title as it reads on site's own row now — for a terminal frame,
 * which must not carry a title captured at dispatch: the user can rename the
 * session mid-run, and site's row receives that rename before hq's copy does.
 * Undefined when the session is still untitled or the read fails; a failed read
 * must never fail the run it reports on.
 */
export async function readCurrentSessionTitle(sessionId: string): Promise<string | undefined> {
  try {
    const row = await prisma.agentSession.findUnique({ where: { id: sessionId }, select: { title: true } })
    return row?.title && row.title !== UNTITLED_SESSION_TITLE ? row.title : undefined
  } catch (err) {
    logger.warn(`Could not read session ${sessionId}'s title for its terminal frame: ${(err as Error).message}`)
    return undefined
  }
}
