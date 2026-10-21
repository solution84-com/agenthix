import { Router } from 'express'
import { isFingerprint } from '@agenthix/core'
import type { ConsoleContext } from '../app'
import { actorOf } from './fleet'

/** *Move site…* on a site's page, and *Move HQ…* on hq's: now, or at a set time; its code; how it goes (move/moves.ts). */
export function moveRoutes(ctx: ConsoleContext): Router {
  const r = Router()

  /**
   * `to`: a machine already connected here with no site, moved to without a code; absent, a code for a new machine,
   * with `notify` (ticked unless false) for whether the fleet admins are told when it stops answering.
   */
  r.post('/hosts/:fingerprint/move', async (req, res) => {
    const { at, to, notify } = (req.body as Record<string, unknown> | undefined) ?? {}
    if (at !== undefined && at !== null && (typeof at !== 'string' || Number.isNaN(Date.parse(at)))) {
      res.status(400).json({ error: 'malformed', message: "Say when as a time, or leave it out to move the site as soon as the new machine is confirmed." })
      return
    }
    if (to !== undefined && to !== null && !isFingerprint(to)) {
      res.status(400).json({ error: 'malformed', message: 'Name the machine to move to by its fingerprint, or leave it out to move to a new machine.' })
      return
    }
    if (notify !== undefined && typeof notify !== 'boolean') {
      res.status(400).json({ error: 'malformed', message: 'Say whether to notify the fleet admins, true or false.' })
      return
    }
    const when = typeof at === 'string' ? new Date(at).toISOString() : null
    // The code is shown once, here; it is kept nowhere but in memory, with its join.
    const move = typeof to === 'string' ? await ctx.moves.startTo(actorOf(res), req.params.fingerprint, to, when) : await ctx.moves.start(actorOf(res), req.params.fingerprint, when, notify !== false)
    res.status(201).json(move)
  })

  /** *Move HQ…* to a new machine: now, or at a set time; to answer at a new address, or at its own. */
  r.post('/hq/move', async (req, res) => {
    const body = (req.body as Record<string, unknown> | undefined) ?? {}
    const { at, hqAddress } = body
    if (at !== undefined && at !== null && (typeof at !== 'string' || Number.isNaN(Date.parse(at)))) {
      res.status(400).json({ error: 'malformed', message: 'Say when as a time, or leave it out to move HQ as soon as the new machine is confirmed.' })
      return
    }
    if (hqAddress !== undefined && hqAddress !== null && (typeof hqAddress !== 'string' || hqAddress.length > 512)) {
      res.status(400).json({ error: 'malformed', message: "Give HQ's new address, or leave it out to keep its own." })
      return
    }
    const move = await ctx.moves.startHq(actorOf(res), typeof at === 'string' ? new Date(at).toISOString() : null, typeof hqAddress === 'string' ? hqAddress : null)
    res.status(201).json(move)
  })

  r.get('/moves', (_req, res) => {
    res.json({ moves: ctx.moves.list() })
  })

  r.get('/moves/:moveId', (req, res) => {
    const move = ctx.moves.get(req.params.moveId)
    if (!move) {
      res.status(404).json({ error: 'not_found', message: 'No such move.' })
      return
    }
    res.json({ move })
  })

  r.delete('/moves/:moveId', async (req, res) => {
    res.json({ move: await ctx.moves.cancel(req.params.moveId, actorOf(res)) })
  })

  /** Carries on the tidying after the site moved, when the old machine could not be reached the first time. */
  r.post('/moves/:moveId/finish', async (req, res) => {
    const move = ctx.moves.get(req.params.moveId)
    if (!move || move.state !== 'finishing') {
      res.status(404).json({ error: 'not_found', message: 'No move is waiting to be finished.' })
      return
    }
    await ctx.moves.finish(move)
    res.json({ move })
  })

  return r
}
