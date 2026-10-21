/**
 * What the Fleet Console shows fleet admins of Agenthix Cloud besides the connection: how many people asked to sign
 * in with it, and the offers where it removes a limit, with the ones this person has dismissed. hq keeps all of it; none of
 * it calls Cloud. An hq too old to know the methods is said to be older, and the screens then show nothing.
 */
import { Router } from 'express'
import { CLOUD_OFFER_NAMES, type CloudOfferName } from '@agenthix/core'
import type { ConsoleContext } from '../app'
import { actorOf } from './fleet'
import { askNewerHq } from './newerHq'

const isOffer = (v: string): v is CloudOfferName => (CLOUD_OFFER_NAMES as readonly string[]).includes(v)

/** Mounted inside `cloudRoutes`, which has already checked the session for `/cloud`. */
export function cloudPlatformRoutes(ctx: ConsoleContext): Router {
  const r = Router()

  r.get('/cloud/asks', async (_req, res) => {
    const answer = await askNewerHq(res, () => ctx.link.call('cloud.askCount', { byUserId: actorOf(res).userId }))
    if (answer) res.json({ count: answer.count })
  })

  r.get('/cloud/offers', async (_req, res) => {
    const answer = await askNewerHq(res, () => ctx.link.call('cloud.offers', { byUserId: actorOf(res).userId }))
    if (answer) res.json({ dismissed: answer.dismissed })
  })

  r.post('/cloud/offers/:offer/dismiss', async (req, res) => {
    const offer = String(req.params.offer)
    if (!isOffer(offer)) {
      res.status(400).json({ error: 'malformed', message: 'That is not an offer.' })
      return
    }
    const answer = await askNewerHq(res, () => ctx.link.call('cloud.dismissOffer', { byUserId: actorOf(res).userId, offer }))
    if (answer) res.json({ dismissed: answer.dismissed })
  })

  return r
}
