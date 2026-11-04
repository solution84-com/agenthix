import { HttpError } from 'wasp/server'
import type { GetMyPhones, SignOutPhone } from 'wasp/server/operations'
import type { RegisterPhoneSessionApi } from 'wasp/server/api'
import { listPhones, markPhoneSession, signOutPhone as endPhoneSession, type PhoneRow } from './deviceSessions'

export const getMyPhones: GetMyPhones<void, PhoneRow[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401)
  return listPhones(context.user.id)
}

export const signOutPhone: SignOutPhone<{ id: string }, void> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  if (typeof args?.id !== 'string' || !(await endPhoneSession(context.user.id, args.id))) {
    throw new HttpError(404, 'That phone is not signed in as you')
  }
}

/**
 * A phone that signed in with a password tells hq so right after, naming itself: its session is then treated as
 * a phone's (it slides forward, and it is listed in Settings). Only the caller's own session can be marked.
 */
export const registerPhoneSessionHandler: RegisterPhoneSessionApi = async (req, res, context) => {
  // Wasp's auth middleware sets the session the request came with on the request; its types do not say so.
  const sessionId = (req as typeof req & { sessionId?: string | null }).sessionId
  if (!context.user || !sessionId) return res.status(401).json({ error: 'Sign in first' })
  const body = (req.body ?? {}) as Record<string, unknown>
  await markPhoneSession(sessionId, context.user.id, body.deviceName)
  return res.json({ ok: true })
}
