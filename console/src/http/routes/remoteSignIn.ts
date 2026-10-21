/**
 * Signing in through remote access (spec §7; pre-release spec B9). A session that arrives through remote access needs
 * an authenticator code besides the HQ login; on the machine, or through an SSH tunnel, the HQ login alone is enough,
 * and that sign-in is left exactly as it is.
 *
 * - Through the direct listener on a machine Agenthix Cloud runs (net/remoteListener.ts): hq checks the login, the
 *   code is checked against the person's authenticator — or claims one Cloud handed over unclaimed (auth/
 *   authenticators.ts) — and the session opened works only through remote access, with a `Secure` cookie.
 * - Through Cloud's relay, still a scaffold: nobody has a code there yet, so a sign-in is checked for its shape and
 *   answered "no code is set up": HQ is not asked and no session is opened.
 */
import { Router } from 'express'
import { AUTHENTICATOR_CODE, RECOVERY_CODE } from '@agenthix/core'
import { SESSION_MAX_MS } from '../../auth/sessions'
import { remoteNameOf } from '../../net/remoteListener'
import { sessionCookie } from '../guards'
import type { ConsoleContext } from '../app'
import { originOf } from './cloud'

export function remoteSignInRoutes(ctx: ConsoleContext): Router {
  const r = Router()

  /** Open before sign-in: whether this page was opened through remote access, so it asks for the code too. */
  r.get('/sign-in/remote', (req, res) => {
    res.json({ remote: originOf(req) === 'tunnel' })
  })

  r.post('/session', async (req, res, next) => {
    if (originOf(req) !== 'tunnel') {
      next()
      return
    }
    const b = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
    const code = b.code
    const recoveryCode = b.recoveryCode
    if (code === undefined && recoveryCode === undefined) {
      res.status(401).json({
        error: 'code_needed',
        message: 'You came in through remote access, so a code from your authenticator app is needed too.',
      })
      return
    }
    const wellFormed = code !== undefined
      ? recoveryCode === undefined && typeof code === 'string' && AUTHENTICATOR_CODE.test(code)
      : typeof recoveryCode === 'string' && RECOVERY_CODE.test(recoveryCode.trim().toLowerCase())
    if (!wellFormed) {
      res.status(400).json({ error: 'malformed', message: 'Give the six digits your authenticator app shows, or one recovery code.' })
      return
    }
    if (remoteNameOf(req.socket) === null) {
      res.status(401).json({ error: 'no_code', message: 'No authenticator code is set up for this Fleet Console yet.' })
      return
    }
    const outcome = await ctx.signIn.attemptWithCode(req.body, ctx.authenticators)
    if (!outcome.ok) {
      res.status(outcome.status).json({ error: outcome.code, message: outcome.message })
      return
    }
    const { cookie, csrfToken } = ctx.sessions.create(outcome.user, true)
    res.setHeader('Set-Cookie', sessionCookie(cookie, Math.floor(SESSION_MAX_MS / 1000), true))
    res.status(201).json({ user: outcome.user, csrfToken })
  })

  return r
}
