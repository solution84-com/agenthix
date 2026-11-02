/**
 * Live previews on the organisation's sites, as a fleet admin sees and sets them (live preview spec section 5): one
 * site's *Live previews on this site*, its limit, *Stop when unused for*, the live previews open there with what they
 * use, and *Stop*. hq holds and decides all of it, asking the role of the signed-in account again on every call; the
 * Fleet Console never reaches a live preview and never sees inside one. A site is named here by its machine's
 * fingerprint, as everywhere on the screens, and found in hq by the id hq gave it.
 *
 * Every route is the live preview's (`livePreview` flag, adr-0172): answered only while hq says it is on, and 404,
 * doing nothing, otherwise. The guard is mounted on their path only, since this router is mounted beside others.
 */
import { Router, type Response } from 'express'
import {
  LIVE_PREVIEW_IDLE_MINUTES_MAX, LIVE_PREVIEW_IDLE_MINUTES_MIN, LIVE_PREVIEW_LIMIT_MAX, parseLivePreviewIdleMinutes,
  parseLivePreviewLimit, parseSiteLivePreviewsView,
} from '@agenthix/core'
import type { ConsoleContext } from '../app'
import type { PinnedHost } from '../../state/hosts'
import { actorOf } from './fleet'
import { askNewerHq, notUnderstood } from './newerHq'
import { requireFeature } from './features'

const ID = /^[A-Za-z0-9_-]{1,64}$/

export function livePreviewRoutes(ctx: ConsoleContext): Router {
  const r = Router()
  r.use('/sites/:fingerprint/live-previews', requireFeature(ctx, 'livePreview'))

  /** hq's id for the site a machine carries; hq's own machine carries its default site. Null: hq has no such site to ask. */
  const siteIdOf = async (h: PinnedHost): Promise<string | null> => {
    if (h.executionSiteId) return h.executionSiteId
    if (!h.hqMachine) return null
    return (await ctx.hqFacts.siteLoads())?.find(l => l.isDefault)?.executionSiteId ?? null
  }

  const siteOf = async (fingerprint: string, res: Response): Promise<string | null> => {
    const host = ctx.hosts.byFingerprint(fingerprint)
    if (!host) {
      res.status(404).json({ error: 'not_found', message: 'That machine is not connected to this Fleet Console.' })
      return null
    }
    const id = await siteIdOf(host)
    if (!id) {
      res.status(409).json({
        error: 'conflict',
        message: host.hqMachine
          ? "HQ's own site has not reported to HQ yet, so its live previews cannot be read. Try again in a minute."
          : 'This machine runs no site that HQ knows yet, so it has no live previews.',
      })
      return null
    }
    return id
  }

  r.get('/sites/:fingerprint/live-previews', async (req, res) => {
    const executionSiteId = await siteOf(req.params.fingerprint, res)
    if (!executionSiteId) return
    const answer = await askNewerHq(res, () => ctx.link.call('sites.livePreviews', { byUserId: actorOf(res).userId, executionSiteId }))
    if (answer === undefined) return
    const view = parseSiteLivePreviewsView(answer)
    if (!view) return notUnderstood(res)
    res.json({ view })
  })

  /**
   * Turns live previews on or off and sets the limit and the idle stop. Turning them off stops every live preview open
   * there, so it is refused, listing them, unless the request says `stopAll: true`: the screen shows the list and asks
   * first.
   */
  r.put('/sites/:fingerprint/live-previews', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>
    const limit = parseLivePreviewLimit(b.limit)
    const idleMinutes = parseLivePreviewIdleMinutes(b.idleMinutes)
    if (typeof b.allowed !== 'boolean' || limit === undefined || idleMinutes === undefined) {
      res.status(400).json({
        error: 'malformed',
        message: `Say whether live previews are on, the limit on live previews at once (a whole number from 1 to ${LIVE_PREVIEW_LIMIT_MAX}, or none), `
          + `and when an unused one stops (a whole number of minutes from ${LIVE_PREVIEW_IDLE_MINUTES_MIN} to ${LIVE_PREVIEW_IDLE_MINUTES_MAX}). Nothing was changed.`,
      })
      return
    }
    const executionSiteId = await siteOf(req.params.fingerprint, res)
    if (!executionSiteId) return
    const byUserId = actorOf(res).userId
    if (!b.allowed && b.stopAll !== true) {
      const current = await askNewerHq(res, () => ctx.link.call('sites.livePreviews', { byUserId, executionSiteId }))
      if (current === undefined) return
      const view = parseSiteLivePreviewsView(current)
      if (!view) return notUnderstood(res)
      if (view.allowed && view.livePreviews.length > 0) {
        const n = view.livePreviews.length
        res.status(409).json({
          error: 'conflict', livePreviews: view.livePreviews,
          message: `Turning live previews off stops ${n === 1 ? 'the live preview' : `all ${n} live previews`} open on this site. Confirm to go ahead. Nothing was changed.`,
        })
        return
      }
    }
    const answer = await askNewerHq(res, () => ctx.link.call('sites.livePreviews.set', { byUserId, executionSiteId, allowed: b.allowed as boolean, limit, idleMinutes }))
    if (answer === undefined) return
    const view = parseSiteLivePreviewsView(answer.view)
    if (!view) return notUnderstood(res)
    const stopped = Array.isArray(answer.stopped) ? answer.stopped.filter((id): id is string => typeof id === 'string' && ID.test(id)).slice(0, 500) : []
    res.json({ view, stopped })
  })

  r.delete('/sites/:fingerprint/live-previews/:livePreviewId', async (req, res) => {
    const livePreviewId = ID.test(req.params.livePreviewId) ? req.params.livePreviewId : null
    if (!livePreviewId) {
      res.status(400).json({ error: 'malformed', message: 'Say which live preview to stop. Nothing was changed.' })
      return
    }
    const executionSiteId = await siteOf(req.params.fingerprint, res)
    if (!executionSiteId) return
    const answer = await askNewerHq(res, () => ctx.link.call('sites.livePreviews.stop', { byUserId: actorOf(res).userId, executionSiteId, livePreviewId }))
    if (!answer) return
    res.json({ stopped: answer.stopped === true })
  })

  return r
}
