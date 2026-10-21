import { Router } from 'express'
import { isFingerprint } from '@agenthix/core'
import type { ConsoleContext } from '../app'
import { actorOf } from './fleet'

/** Adding a site, or restoring a lost one: a code, the machine that answered it, and the fleet admin's confirmation (join/joins.ts). */
export function joinRoutes(ctx: ConsoleContext): Router {
  const r = Router()

  r.post('/joins', async (req, res) => {
    // *Restore from a backup…* names the lost site's machine (adr-0119); without it, the code adds a site.
    const { restoreMachine: restore, notify } = (req.body as Record<string, unknown> | undefined) ?? {}
    if (restore !== undefined && !isFingerprint(restore)) {
      res.status(400).json({ error: 'malformed', message: 'Say which site to restore.' })
      return
    }
    // *Notify the fleet admins if this machine stops answering*: ticked unless said otherwise (hosts/silence.ts).
    if (notify !== undefined && typeof notify !== 'boolean') {
      res.status(400).json({ error: 'malformed', message: 'Say whether to notify the fleet admins, true or false.' })
      return
    }
    const told = notify !== false
    res.status(201).json(restore ? await ctx.joins.openRestore(actorOf(res), restore, told) : await ctx.joins.open(actorOf(res), told))
  })

  r.get('/joins/:joinId', (req, res) => {
    const join = ctx.joins.get(req.params.joinId)
    if (!join) {
      res.status(404).json({ error: 'not_found', message: 'No such code, or it has expired.' })
      return
    }
    res.json(join)
  })

  r.post('/joins/:joinId/confirm', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>
    const version = typeof b.version === 'string' ? b.version : undefined
    res.json(await ctx.joins.confirm(req.params.joinId, actorOf(res), { version }))
    // A machine pinned unticked: hq is told now rather than at the next pass (hosts/silence.ts).
    void ctx.silence.sync()
  })

  r.post('/joins/:joinId/refuse', async (req, res) => {
    await ctx.joins.refuse(req.params.joinId, actorOf(res))
    res.status(204).end()
  })

  r.delete('/joins/:joinId', async (req, res) => {
    await ctx.joins.cancel(req.params.joinId)
    res.status(204).end()
  })

  return r
}
