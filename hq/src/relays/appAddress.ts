/**
 * A live app's address (live preview spec section 5), built from the pattern the relay answers by, so the two
 * agree: `PREVIEW_PATTERN` as the host service sets it from the preview domain, or for HQ at `http://localhost:<port>`
 * (`p-<id>.preview.localhost:<port>`); unset, development's `p-<id>.preview.localhost` when hq is on localhost;
 * otherwise none, and live previews are off: an install reached by a bare network address has no domain to put apps
 * under.
 */
import { DEV_PREVIEW_PATTERN, previewOrigin } from '@agenthix/core'
import { previewPatternFromEnv } from './previewCertificateAsk'
import { getSiteClientUrl } from '../server/siteConfig'

export function livePreviewPattern(env: NodeJS.ProcessEnv = process.env, hqUrl: string = getSiteClientUrl()): string | null {
  const set = previewPatternFromEnv(env)
  if (set) return set
  try {
    const host = new URL(hqUrl).hostname.toLowerCase()
    return host === 'localhost' || host.endsWith('.localhost') ? DEV_PREVIEW_PATTERN : null
  } catch {
    return null
  }
}

/** Whether live previews can be opened on this install at all: false on one reached by a bare network address. */
export function livePreviewsHaveAnAddress(pattern: string | null = livePreviewPattern()): boolean {
  return pattern !== null
}

/** What HQ says when they cannot, ending as every refusal does. */
export const NO_PREVIEW_ADDRESS_MESSAGE = "Live previews need a domain: this HQ is reached by a network address, and each app needs a name of its own. A fleet admin gives HQ a domain and a preview address in the Fleet Console, on HQ's relay. Nothing was changed."

/** The app's origin, or null when live previews are off on this install. */
export function appAddress(appId: string, pattern: string | null = livePreviewPattern()): string | null {
  return pattern ? previewOrigin(pattern, appId) : null
}
