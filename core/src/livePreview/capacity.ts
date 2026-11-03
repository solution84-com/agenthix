/**
 * What a site's live previews use, against what the machine has (live preview spec section 5): there is no limit on
 * *Live previews at once* unless one is set, so the use is shown instead. The site works it out from the host
 * service's figures and reports it in `site.health`; hq shows it on the site's page in the Fleet Console and beside a
 * live preview (*preview-box · 2 of 6 open*), and tells the fleet admins when a site's memory passes
 * `LIVE_PREVIEWS_MEMORY_HIGH_PERCENT` and when it is back under `LIVE_PREVIEWS_MEMORY_RECOVERED_PERCENT`. Disk,
 * copies included, is the health report's own.
 *
 * Whole percents only: the machine's own figures stay on the machine. Browser-safe: no Node import.
 */
import { parseLivePreviewLimit, type LivePreviewLimit } from './livePreview.js'

/** A site is busy above this much of its memory used. */
export const LIVE_PREVIEWS_MEMORY_HIGH_PERCENT = 80
/** A busy site has recovered once its memory used is back under this, so a site near the line is not told twice a minute. */
export const LIVE_PREVIEWS_MEMORY_RECOVERED_PERCENT = 70

export type LivePreviewsCapacity = {
  /** Live previews open now (starting, running or paused). */
  open: number
  /** The limit on *Live previews at once*; null for none. */
  limit: LivePreviewLimit
  /** The machine's memory in use, 0 to 100; null when the host service gave no figures. */
  memoryPercent: number | null
  /** The machine's one-minute load against its processors, 0 or more (above 100 when overloaded); null without figures. */
  cpuPercent: number | null
}

/** A whole percent of `used` in `total`, or null when the figures are not a share. */
export function percentOf(used: number, total: number): number | null {
  if (!Number.isFinite(used) || !Number.isFinite(total) || used < 0 || total <= 0) return null
  return Math.round((used / total) * 100)
}

/** The memory band a site is in, moving to `high` above the high mark and back to `normal` only under the recovered one. */
export function memoryBand(was: 'normal' | 'high', memoryPercent: number | null): 'normal' | 'high' {
  if (memoryPercent === null) return was
  if (memoryPercent > LIVE_PREVIEWS_MEMORY_HIGH_PERCENT) return 'high'
  return memoryPercent < LIVE_PREVIEWS_MEMORY_RECOVERED_PERCENT ? 'normal' : was
}

const percent = (v: unknown, max: number | null): number | null | undefined =>
  v === null ? null : typeof v === 'number' && Number.isInteger(v) && v >= 0 && (max === null || v <= max) && v <= 10_000 ? v : undefined

/** The capacity as it came off the wire, field by field; null for anything else, an extra field included. */
export function parseLivePreviewsCapacity(v: unknown): LivePreviewsCapacity | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const d = v as Record<string, unknown>
  const keys = ['open', 'limit', 'memoryPercent', 'cpuPercent']
  if (Object.keys(d).length !== keys.length || !keys.every(k => k in d)) return null
  const open = typeof d.open === 'number' && Number.isSafeInteger(d.open) && d.open >= 0 ? d.open : null
  const limit = parseLivePreviewLimit(d.limit)
  const memoryPercent = percent(d.memoryPercent, 100)
  const cpuPercent = percent(d.cpuPercent, null)
  if (open === null || limit === undefined || memoryPercent === undefined || cpuPercent === undefined) return null
  return { open, limit, memoryPercent, cpuPercent }
}
