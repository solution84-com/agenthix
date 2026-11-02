/**
 * Live apps' addresses at the relay (live preview spec section 4, *The app*; section 6, *Apps and the relay*): the pattern they are built from, and which app a
 * browser's `Host` names. hq builds every address from the same pattern (core's previewAddress.ts) and the same
 * environment, so the two agree.
 *
 * - `PREVIEW_PATTERN`: the pattern, such as `https://p-{id}.preview.example.com`, which the host service sets from
 *   the fleet admin's preview domain, or a hosted service supplies.
 * - Unset, with hq on `localhost`: development's `http://p-{id}.preview.localhost:<relay port>`.
 * - Unset otherwise (hq reached by a bare network address, or no domain set): live apps are off.
 */
import {
  DEV_PREVIEW_PATTERN, PREVIEW_CHECK_ID, appIdFromHost, parsePreviewPattern,
} from '@agenthix/core'
import { hostOf } from '../filesHost'

/** Development's pattern when hq is on `localhost` and `PREVIEW_PATTERN` is unset (`../config.ts` reads it); else none. */
export function devPreviewPattern(hqUrl: string | undefined): string | null {
  let hqHost = ''
  try {
    hqHost = hostOf(new URL((hqUrl ?? '').trim()).host)
  } catch {
    // No hq address to read: no development default.
  }
  return hqHost === 'localhost' || hqHost.endsWith('.localhost') ? DEV_PREVIEW_PATTERN : null
}

/**
 * What a request's `Host` is to the live apps' door: not a preview address at all (null), the relay's own check name,
 * an app's id, or a name under the preview domain that is no app's address.
 */
export type PreviewHost = { app: string } | { check: true } | { unknown: true }

export function previewHostOf(pattern: string | null, hostHeader: string | undefined): PreviewHost | null {
  if (!pattern || !hostHeader) return null
  const id = appIdFromHost(pattern, hostHeader)
  if (id === PREVIEW_CHECK_ID) return { check: true }
  if (id) return { app: id }
  const p = parsePreviewPattern(pattern)
  const host = hostOf(hostHeader)
  return p && host.endsWith(`.${p.domain}`) ? { unknown: true } : null
}
