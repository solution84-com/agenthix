import { prisma } from 'wasp/server'
import { emitToPerson, PERSON_EVENTS } from './personEvents'
import { Logger } from './utils/logger'

const logger = new Logger('runEvents')

/** Tells the person whose session a run belongs to that it changed. Best-effort: a failure never reaches the run. */
export async function emitRunChanged(sessionId: string, runId: string, status: string, knownUserId?: string | null): Promise<void> {
  try {
    // The site event path already read the session's person with its owner; only an unknown one is read here.
    const userId = knownUserId !== undefined
      ? knownUserId
      : (await prisma.agentSession.findUnique({ where: { id: sessionId }, select: { userId: true } }))?.userId
    if (userId) emitToPerson(userId, PERSON_EVENTS.runsChanged, { runId, sessionId, status })
  } catch (err) {
    logger.warn(`runs:changed not sent for run ${runId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
