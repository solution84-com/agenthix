/**
 * The fleet admins (spec §1, §7). hq is the authority over the role: it lists who holds it and refuses a grant
 * from anyone who does not. hq announces and records every grant and removal, whoever made it, so nothing is
 * recorded here: the record has one entry for each.
 */
import { Router } from 'express'
import { parseFleetAdminAccounts, parseHqAccount } from '@agenthix/core'
import type { ConsoleContext } from '../app'
import { actorOf } from './fleet'
import { askNewerHq } from './newerHq'

export function fleetAdminRoutes(ctx: ConsoleContext): Router {
  const r = Router()

  r.get('/fleet-admins', async (_req, res) => {
    const { admins } = await ctx.link.call('fleetAdmin.list', {})
    res.json({ admins: parseFleetAdminAccounts(admins) })
  })

  /** An HQ account to give the role to, by the username it signs in with: only the exact one, never a list of people. */
  r.get('/fleet-admins/find', async (req, res) => {
    const username = typeof req.query.username === 'string' ? req.query.username.trim().toLowerCase() : ''
    if (!username || username.length > 200) {
      res.status(400).json({ error: 'malformed', message: 'Type the username the person signs in to HQ with.' })
      return
    }
    const answer = await askNewerHq(res, () => ctx.link.call('account.find', { byUserId: actorOf(res).userId, username }))
    if (answer === undefined) return
    res.json({ account: parseHqAccount(answer) })
  })

  r.post('/fleet-admins', async (req, res) => {
    const userId = (req.body as Record<string, unknown> | undefined)?.userId
    if (typeof userId !== 'string' || !userId || userId.length > 200) {
      res.status(400).json({ error: 'malformed', message: 'Say which HQ account gets the role.' })
      return
    }
    const by = actorOf(res)
    const { granted } = await ctx.link.call('fleetAdmin.grant', { userId, byUserId: by.userId })
    if (!granted) {
      res.status(409).json({ error: 'not_granted', message: 'HQ did not give the role.' })
      return
    }
    ctx.roles.forget()
    res.json({ granted: true })
  })

  r.delete('/fleet-admins/:userId', async (req, res) => {
    const userId = req.params.userId
    if (!userId || userId.length > 200) {
      res.status(400).json({ error: 'malformed', message: 'Say which HQ account loses the role.' })
      return
    }
    const by = actorOf(res)
    const { revoked } = await ctx.link.call('fleetAdmin.revoke', { userId, byUserId: by.userId })
    if (!revoked) {
      res.status(409).json({ error: 'not_revoked', message: 'HQ did not take the role away.' })
      return
    }
    ctx.sessions.endAllOf(userId)
    ctx.roles.forget()
    res.json({ revoked: true })
  })

  return r
}
