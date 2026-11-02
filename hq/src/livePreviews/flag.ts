/**
 * The live preview behind its flag, `livePreview` (adr-0172; live preview spec section 7, *The live preview's flag*).
 * Off, every entry point refuses before it does anything (`requireFeature`), and hq's background work for live
 * previews (site events, the reconcile at a site's connect, the idle stop, bringing commits back) does nothing.
 */
import { isOrgFeatureOn } from '../features/switches'

export const LIVE_PREVIEW_FLAG = 'livePreview' as const

/** Whether live previews are on for this organisation, by the one rule. */
export function livePreviewFeatureOn(): Promise<boolean> {
  return isOrgFeatureOn(LIVE_PREVIEW_FLAG)
}

/** A handler of background work that does nothing while live previews are off. */
export function whileLivePreviewOn<A extends unknown[]>(handle: (...a: A) => Promise<void> | void): (...a: A) => Promise<void> {
  return async (...a: A) => {
    if (await livePreviewFeatureOn()) await handle(...a)
  }
}
