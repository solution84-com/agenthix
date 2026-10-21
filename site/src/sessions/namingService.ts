import { Logger } from '../server/utils/logger'

const logger = new Logger('NamingService')

/**
 * Generates a concise title from the user message by taking the first 5-7 words.
 */
export async function generateSessionTitle(sessionId: string, firstMessage: string, db: any): Promise<string | null> {
  try {
    const words = firstMessage.trim().split(/\s+/)
    let title = words.slice(0, 6).join(' ')
    if (words.length > 6) {
      title += '...'
    }

    if (title) {
      await db.AgentSession.update({
        where: { id: sessionId },
        data: { title }
      })
      logger.info(`Session ${sessionId} renamed to: "${title}"`)
      return title
    }
  } catch (error) {
    logger.error(`Failed to generate title for session ${sessionId}:`, error)
  }
  return null
}
