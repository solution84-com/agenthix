/**
 * The reset page's two calls, both without a session: read the link (whose
 * account, who made it), then set the password. A refused link counts against
 * the caller's address as a refused invitation code does, so links cannot be
 * guessed. Setting is refused while signed in: the page signs out first.
 */
import type { ReadPasswordResetApi, CompletePasswordResetApi } from 'wasp/server/api'
import { isCodeRefusal, isInviteRateLimited, recordFailedInviteAttempt } from './inviteService'
import { completePasswordReset, readPasswordReset } from './passwordReset'

const TOO_MANY = { error: 'Too many failed attempts. Try again in 15 minutes.', reason: 'rate_limited' }

export const readPasswordResetHandler: ReadPasswordResetApi = async (req, res) => {
  const ip = req.ip ?? 'unknown'
  if (await isInviteRateLimited(ip)) return res.status(429).json(TOO_MANY)
  const token = req.body?.token
  if (typeof token !== 'string' || !token) return res.status(400).json({ error: 'token required' })
  const result = await readPasswordReset(token)
  if ('status' in result) {
    if (isCodeRefusal(result.status)) await recordFailedInviteAttempt(ip)
    const { status, ...body } = result
    return res.status(status).json(body)
  }
  return res.json(result)
}

export const completePasswordResetHandler: CompletePasswordResetApi = async (req, res, context) => {
  if (context.user) {
    return res.status(409).json({ reason: 'signed_in', error: 'Sign out first: this link sets the password of the account it names.' })
  }
  const ip = req.ip ?? 'unknown'
  if (await isInviteRateLimited(ip)) return res.status(429).json(TOO_MANY)
  const { token, password } = req.body ?? {}
  if (typeof token !== 'string' || !token || typeof password !== 'string') {
    return res.status(400).json({ error: 'token and password are required' })
  }
  const result = await completePasswordReset(token, password)
  if ('status' in result) {
    if (isCodeRefusal(result.status)) await recordFailedInviteAttempt(ip)
    const { status, ...body } = result
    return res.status(status).json(body)
  }
  return res.json(result)
}
