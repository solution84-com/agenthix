/**
 * The site's gate for flagged features (adr-0172): core's one rule, `isFeatureOn`, with this site's own `NODE_ENV`
 * and the organisation's switches as hq sent them. In production hq's switches can only turn a beta on or a released
 * feature off; anything earlier stays off whatever hq says, because the rule is applied here, not taken from hq.
 *
 * hq sends the switches with every request on the control channel (`ChannelRequestPayload.features`). While a request
 * is answered, its own switches are the current ones (`withRequestSwitches`, around each handler), and work that
 * outlives the request keeps the switches it was started with: a run carries them to each of its turns
 * (`RunOptions.features`). A door that is not an hq request, such as the relay's, uses the switches its work carries,
 * or else the latest any request brought. A request without switches, from an hq that sends none, means none.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import {
  isFeatureOn, NO_FEATURE_SWITCHES, parseFeatureSwitches, type FeatureFlag, type FeatureSwitches,
} from '@agenthix/core'

const requestSwitches = new AsyncLocalStorage<FeatureSwitches>()
let latest: FeatureSwitches = NO_FEATURE_SWITCHES

/** Runs `body` with the switches an hq request brought as the current ones, and keeps them as the latest. */
export function withRequestSwitches<T>(raw: unknown, body: () => T): T {
  const switches = parseFeatureSwitches(raw)
  latest = switches
  return requestSwitches.run(switches, body)
}

/** The switches of the request being answered; outside one, the latest any request brought. */
export function currentSwitches(): FeatureSwitches {
  return requestSwitches.getStore() ?? latest
}

/**
 * The switches the latest hq request brought, whatever request is being answered now: for a door that no request
 * opens (the relay's) and the site's own work outside any request. Asked for explicitly there, since work started
 * while answering a request (a relay's line, opened on `relay.assign`) would otherwise keep that request's switches.
 */
export function latestSwitches(): FeatureSwitches {
  return latest
}

/** Whether a feature is on here, by core's rule: with the switches its work carries, or the current ones. */
export function isSiteFeatureOn(flag: FeatureFlag, switches: FeatureSwitches = currentSwitches()): boolean {
  return isFeatureOn(flag, { env: process.env, switches })
}

/** A flagged feature asked for while it is off: nothing was done. */
export class FeatureNotAvailableError extends Error {
  constructor(readonly flag: FeatureFlag) {
    super(
      `This feature (${flag}) is not available on this site: it is not on for the organisation. HQ lists what an ` +
      'organisation admin can switch on, under Settings, Features. Nothing was changed.',
    )
    this.name = 'FeatureNotAvailableError'
  }
}

/** First in each of a flagged feature's methods and doors: refuses, doing nothing, while the feature is off. */
export function requireFeature(flag: FeatureFlag, switches: FeatureSwitches = currentSwitches()): void {
  if (!isSiteFeatureOn(flag, switches)) throw new FeatureNotAvailableError(flag)
}

/** A channel method of a flagged feature: refused before its handler runs while the feature is off. */
export function featureMethod<P, R>(flag: FeatureFlag, handler: (params: P) => Promise<R>): (params: P) => Promise<R> {
  return async params => {
    requireFeature(flag)
    return handler(params)
  }
}

export function resetSiteFeaturesForTests(): void {
  latest = NO_FEATURE_SWITCHES
}
