/**
 * The gate every server entry point of a flagged feature runs first (adr-0172): an operation, a route or a socket
 * handler. Off, it answers 404 *not available* and the entry point does nothing, so a feature switched off is closed
 * on the server, not only hidden on screen.
 */
import { HttpError } from 'wasp/server'
import type { FeatureFlag } from '@agenthix/core'
import { FEATURE_WORDS } from '../shared/features'
import { isOrgFeatureOn } from './switches'

export function notAvailable(flag: FeatureFlag): HttpError {
  return new HttpError(404, `${FEATURE_WORDS[flag].title} is not available in this organisation. Nothing was changed.`)
}

export async function requireFeature(flag: FeatureFlag): Promise<void> {
  if (!(await isOrgFeatureOn(flag))) throw notAvailable(flag)
}
