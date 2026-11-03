/**
 * Flagged features on the Fleet Console (adr-0172): which are on, for the screens to show their sections, and the
 * guard each flagged route puts first. hq decides (hqFeatures.ts); the screens' check is a convenience only.
 */
import { Router, type RequestHandler } from 'express'
import type { FeatureFlag } from '@agenthix/core'
import type { ConsoleContext } from '../app'

export const FEATURE_NOT_AVAILABLE =
  'This is not available: the feature is not on for the organisation. HQ lists what an organisation admin can switch ' +
  'on, under Settings, Features. Nothing was changed.'

export function featureRoutes(ctx: ConsoleContext): Router {
  const r = Router()
  r.get('/features', async (_req, res) => {
    res.json({ on: await ctx.features.on() })
  })
  return r
}

/** First on each route of a flagged feature: answers 404, doing nothing, while hq does not say the feature is on. */
export function requireFeature(ctx: ConsoleContext, flag: FeatureFlag): RequestHandler {
  return async (_req, res, next) => {
    if (await ctx.features.isOn(flag)) {
      next()
      return
    }
    res.status(404).json({ error: 'not_found', message: FEATURE_NOT_AVAILABLE })
  }
}
