import type {
  BootstrapStatusApi,
  ValidateInviteApi,
  AcceptInviteApi,
} from 'wasp/server/api'
import { prisma } from 'wasp/server'
import { isCodeRefusal, validateToken } from './inviteService'
import { attemptInviteCode } from './inviteLimit'
import { acceptInviteToken } from './inviteAccept'
import { passwordProblem } from './passwordRules'
import { personById } from '../server/identity/people'

const TOO_MANY = { error: 'Too many failed attempts. Try again in 15 minutes.', reason: 'rate_limited' }

export const validateInviteHandler: ValidateInviteApi = async (req, res) => {
  const ip = req.ip ?? 'unknown'
  const { token } = req.body
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token required' })
  }
  const attempt = await attemptInviteCode(ip, () => validateToken(token), r => !r.valid && isCodeRefusal(r.status))
  if (attempt.limited) return res.status(429).json(TOO_MANY)
  const result = attempt.result
  if (!result.valid) {
    const { status, ...body } = result
    return res.status(status).json(body)
  }
  return res.json(result)
}

/**
 * Declared with `auth: true` so a request made while signed in carries its
 * session: accepting is refused until the person signs out, rather than
 * silently replacing the session they have. A request with no session runs as before.
 */
export const acceptInviteApiHandler: AcceptInviteApi = async (req, res, context) => {
  if (context.user) {
    const me = await personById(context.user.id)
    return res.status(409).json({
      reason: 'signed_in',
      signedInAs: me.name,
      error: `You're signed in as ${me.name}. This invitation is for someone new: sign out to continue.`,
    })
  }
  const ip = req.ip ?? 'unknown'
  const { token, name, username, password } = req.body ?? {}
  if (![token, name, username, password].every(v => typeof v === 'string' && v !== '')) {
    return res.status(400).json({ error: 'token, name, username and password are required' })
  }
  const problem = passwordProblem(password)
  if (problem) return res.status(400).json({ error: problem, reason: 'password' })
  const attempt = await attemptInviteCode(
    ip,
    () => acceptInviteToken({ token, name, username, password }),
    r => 'error' in r && isCodeRefusal(r.status),
  )
  if (attempt.limited) return res.status(429).json(TOO_MANY)
  const result = attempt.result
  if ('error' in result) {
    const { status, ...body } = result
    return res.status(status).json(body)
  }
  return res.json(result)
}

// Single source of truth for bootstrap state: hq needs its first admin iff it
// has no users. SiteConfig.bootstrapRequired is a setup-time record only.
export const bootstrapStatusHandler: BootstrapStatusApi = async (_req, res) => {
  const userCount = await prisma.user.count()
  return res.json({ bootstrapRequired: userCount === 0 })
}
