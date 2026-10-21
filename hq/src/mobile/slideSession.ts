import type { RequestHandler } from 'express'
import { Logger } from '../server/utils/logger'
import { bearerSessionId, slidePhoneSession } from './deviceSessions'

const logger = new Logger('mobile-session')

/** Each authenticated request from a phone's session moves its expiry forward (deviceSessions.ts). */
export const slidePhoneSessionGuard: RequestHandler = (req, _res, next) => {
  const sessionId = bearerSessionId(req.headers.authorization)
  if (sessionId) {
    slidePhoneSession(sessionId).catch(err => logger.warn(`session not renewed: ${err instanceof Error ? err.message : String(err)}`))
  }
  next()
}
