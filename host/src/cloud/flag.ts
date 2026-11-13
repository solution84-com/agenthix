/**
 * Agenthix Cloud behind its flag, `cloud` (adr-0189; preview until Cloud's service opens), by core's one rule with this
 * container's own `NODE_ENV`. A preview flag takes no organisation switch, so the host service needs none: off in
 * production — the image — and on in a development build unless a test says otherwise. Off, the machine behaves as one
 * an organisation runs itself: Cloud's start-up settings are ignored, Cloud's link and operations refuse, and the
 * command line offers no `cloud` commands.
 */
import { NO_FEATURE_SWITCHES, isFeatureOn } from '@agenthix/core'

export function cloudFeatureOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return isFeatureOn('cloud', { env, switches: NO_FEATURE_SWITCHES })
}

export const CLOUD_NOT_AVAILABLE = 'Agenthix Cloud is not available in this build of the host service. Nothing was changed.'
