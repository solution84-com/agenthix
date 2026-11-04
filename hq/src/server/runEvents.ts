import { prisma } from 'wasp/server'
import { emitToPeople, PERSON_EVENTS } from './personEvents'
import { sessionReaders, type SessionContentFields } from '../sessions/sessionEntitlement'
import { Logger } from './utils/logger'

const logger = new Logger('runEvents')

/**
 * Tells the people who may read a run's session that the run changed: a chat's person, or a task session's
 * project members — never the admin a task session's `userId` names for routing. Best-effort: a failure never
 * reaches the run. The site event path passes the session's fields its owner lookup already read; without them
 * the row is read here. Who reads a task session is its project's to say, and that is always read fresh.
 */
export async function emitRunChanged(sessionId: string, runId: string, status: string, known?: SessionContentFields): Promise<void> {
  try {
    const session = known ?? await prisma.agentSession.findUnique({
      where: { id: sessionId },
      select: { userId: true, sessionType: true, taskId: true, primaryOwnerType: true, primaryOwnerId: true },
    })
    if (!session) return
    emitToPeople(await sessionReaders(session), PERSON_EVENTS.runsChanged, { runId, sessionId, status })
  } catch (err) {
    logger.warn(`runs:changed not sent for run ${runId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
