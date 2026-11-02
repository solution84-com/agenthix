/**
 * Live previews on the organisation's sites as the Fleet Console sees them, through hq (live preview spec section 5):
 * each site's *Live previews on this site*, its limit and *Stop when unused for*, the live previews open there, what
 * they use against the machine's total, and why live previews cannot start when they cannot. A fleet admin turns live
 * previews on or off, sets or clears the limit, sets the idle stop, and stops a live preview; they never see inside
 * one. Each console link method here is answered only when `byUserId` holds the fleet admin role (`not_allowed`
 * otherwise). Words on a screen: each answer is read field by field on arrival, and an entry not in its shape is
 * dropped. Browser-safe: no Node import.
 */
import {
  parseLivePreviewIdleMinutes, parseLivePreviewLimit, type LivePreviewLimit,
} from '../livePreview/livePreview.js'
import { parseLivePreviewsCapacity, type LivePreviewsCapacity } from '../livePreview/capacity.js'

/** A live preview open on the site, as a fleet admin sees it: whose, which branch, how it stands, when last used. */
export type FleetLivePreview = {
  livePreviewId: string
  projectName: string
  workspaceName: string
  branch: string
  person: { id: string; name: string }
  state: 'starting' | 'running' | 'paused'
  openedAt: string
  lastUsedAt: string
}

/** One organisation site's live previews, for its page in the Fleet Console. */
export type SiteLivePreviewsView = {
  executionSiteId: string
  allowed: boolean
  limit: LivePreviewLimit
  idleMinutes: number
  livePreviews: FleetLivePreview[]
  /** From the site's last health report; null when it has reported none. */
  capacity: LivePreviewsCapacity | null
  /** Why live previews cannot start on the site (the guard, the protections), each a sentence; empty when they can. */
  problems: string[]
}

/** The most live previews one answer lists. */
export const FLEET_LIVE_PREVIEWS_MAX = 500

const ID = /^[A-Za-z0-9_-]{1,64}$/
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g

const record = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const id = (v: unknown): string | null => (typeof v === 'string' && ID.test(v) ? v : null)

function words(v: unknown, max = 200): string | null {
  if (typeof v !== 'string' || v.length > max) return null
  const s = v.replace(CONTROL, '').trim()
  return s || null
}

function time(v: unknown): string | null {
  return typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null
}

const STATES = ['starting', 'running', 'paused'] as const

function livePreview(v: unknown): FleetLivePreview | null {
  const r = record(v)
  const p = record(r?.person)
  const state = STATES.find(s => s === r?.state) ?? null
  const out = {
    livePreviewId: id(r?.livePreviewId), projectName: words(r?.projectName), workspaceName: words(r?.workspaceName),
    branch: words(r?.branch), personId: id(p?.id), personName: words(p?.name), openedAt: time(r?.openedAt),
    lastUsedAt: time(r?.lastUsedAt),
  }
  if (!state || !out.livePreviewId || !out.projectName || !out.workspaceName || !out.branch || !out.personId
    || !out.personName || !out.openedAt || !out.lastUsedAt) return null
  return {
    livePreviewId: out.livePreviewId, projectName: out.projectName, workspaceName: out.workspaceName, branch: out.branch,
    person: { id: out.personId, name: out.personName }, state, openedAt: out.openedAt, lastUsedAt: out.lastUsedAt,
  }
}

/** `sites.livePreviews`' answer, or the view in `sites.livePreviews.set`'s; null when it is not one. */
export function parseSiteLivePreviewsView(v: unknown): SiteLivePreviewsView | null {
  const s = record(v)
  const executionSiteId = id(s?.executionSiteId)
  const limit = parseLivePreviewLimit(s?.limit)
  const idleMinutes = parseLivePreviewIdleMinutes(s?.idleMinutes)
  if (!s || !executionSiteId || typeof s.allowed !== 'boolean' || limit === undefined || idleMinutes === undefined
    || !Array.isArray(s.livePreviews) || !Array.isArray(s.problems)) return null
  const capacity = s.capacity === null ? null : parseLivePreviewsCapacity(s.capacity)
  if (s.capacity !== null && !capacity) return null
  return {
    executionSiteId, allowed: s.allowed, limit, idleMinutes,
    livePreviews: s.livePreviews.slice(0, FLEET_LIVE_PREVIEWS_MAX).map(livePreview).filter((r): r is FleetLivePreview => r !== null),
    capacity,
    problems: s.problems.slice(0, 20).map(p => words(p, 500)).filter((p): p is string => p !== null),
  }
}
