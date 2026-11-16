/**
 * Agenthix Cloud behind its flag, `cloud` (adr-0189; preview, off in a release). Off, every Cloud entry
 * point refuses before it does anything (`requireFeature('cloud')`), and hq's own work with Cloud — checking in, the
 * emails about scheduled changes, the pledge's status — asks Cloud nothing.
 */
import { isOrgFeatureOn } from '../features/switches'
import { notAvailable } from '../features/requireFeature'

export const CLOUD_FLAG = 'cloud' as const

/** Whether Agenthix Cloud is on for this organisation, by the one rule. */
export function cloudFeatureOn(): Promise<boolean> {
  return isOrgFeatureOn(CLOUD_FLAG)
}

/** The refusal of a Cloud command on hq's control socket while the flag is off. */
export function cloudNotAvailableCommand(): { ok: false; error: string; code: 'not_found' } {
  return { ok: false, error: notAvailable(CLOUD_FLAG).message, code: 'not_found' }
}
