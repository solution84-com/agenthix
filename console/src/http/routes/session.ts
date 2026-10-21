import { Router, type RequestHandler } from 'express'
import { SESSION_MAX_MS } from '../../auth/sessions'
import { clearedSessionCookie, sessionCookie, sessionOf } from '../guards'
import type { ConsoleContext } from '../app'

export function sessionRoutes(ctx: ConsoleContext, authed: RequestHandler): Router {
  const r = Router()

  /** For the sign-in page, before anyone signs in: whether hq answers, and whether anyone holds the role. */
  r.get('/status', async (_req, res) => {
    const connected = ctx.link.state === 'connected'
    const admins = connected ? await ctx.roles.admins() : null
    res.json({
      machineName: ctx.machineName,
      version: ctx.version,
      hq: ctx.link.state,
      fleetAdmins: admins === null ? 'unknown' : admins.length > 0 ? 'some' : 'none',
    })
  })

  r.post('/session', async (req, res) => {
    const outcome = await ctx.signIn.attempt(req.body)
    if (!outcome.ok) {
      res.status(outcome.status).json({ error: outcome.code, message: outcome.message })
      return
    }
    const { cookie, csrfToken } = ctx.sessions.create(outcome.user)
    res.setHeader('Set-Cookie', sessionCookie(cookie, Math.floor(SESSION_MAX_MS / 1000)))
    // The CSRF token is given here only: the screen keeps it and sends it with every request.
    res.status(201).json({ user: outcome.user, csrfToken })
  })

  /**
   * The person signed in, and what hq says of their account and of itself for the screens: their username, whether
   * they are an organisation admin too, and since when they hold the role. Null while hq does not answer.
   */
  r.get('/session', authed, async (_req, res) => {
    const { user } = sessionOf(res)
    const [admins, hq] = await Promise.all([ctx.roles.admins(), ctx.hqFacts.hq()])
    const me = admins?.find(a => a.id === user.id)
    res.json({
      user,
      account: me ? { username: me.username, organisationAdmin: me.organisationAdmin, since: me.since } : null,
      hq,
    })
  })

  r.delete('/session', authed, async (_req, res) => {
    const session = sessionOf(res)
    ctx.sessions.end(session)
    await ctx.activity.record(session.user.id, 'signedOut', `On ${ctx.machineName}`, false)
    res.setHeader('Set-Cookie', clearedSessionCookie)
    res.status(204).end()
  })

  return r
}
