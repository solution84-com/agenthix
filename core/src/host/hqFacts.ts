/**
 * What hq tells the Fleet Console of itself over the console link (host-management spec §7), for its screens only:
 * the organisation's name, the address people open HQ at, each site's runs as hq last heard them, and when each fleet
 * admin was given the role — all of it already shown to fleet admins in HQ. None of it is trusted with what the
 * cryptography protects: it is words on a screen. Each field is checked for its shape on arrival, and one that is
 * not its shape is dropped, never passed on. Browser-safe: no Node import.
 */
import type { FleetAdminAccount } from './relay.js'

export type HqAbout = { organisationName: string; address: string }

/** A field left out is one hq did not give in its shape: the screen goes without it. */
export type HqAboutParsed = { organisationName: string | null; address: string | null }

/** A site's runs, from the health it last reported to hq (`SiteHealth.runs`). */
export type SiteLoad = {
  /** hq's id for the site, as `site.register` answered it. */
  executionSiteId: string
  /** hq's own site, which the machine that carries hq runs. */
  isDefault: boolean
  running: number
  maxAtOnce: number
  reportedAt: string
  /** The disk the site's branch copies use; null when it does not say. */
  copiesBytes?: number | null
}

/**
 * hq's own relay, the one that carries its files to browsers (`relay.facts`): what the Fleet Console's page for HQ shows
 * of it. `filesAddress` is null while HQ has no files address, so the relay answers on HQ's own address and PDF preview
 * is off. The counts are from the relay's last report, null while it has made none.
 */
export type HqRelay = {
  name: string
  filesAddress: string | null
  /** It reported to hq within the last minute and hq has not taken it out of service. */
  answering: boolean
  lastSeenAt: string | null
  sites: number | null
  openStreams: number | null
  /** Bytes carried since the relay started, which is as far back as its report goes. */
  bytesCarried: number | null
}

const ID = /^[A-Za-z0-9_-]{1,64}$/
/** Scheme, host name or bracketed IPv6 address, an optional port, an optional path; no user, query or fragment. */
const ADDRESS = /^https?:\/\/([A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(:\d{1,5})?(\/[A-Za-z0-9._~%!$&'()*+,;=:/-]*)?$/i
const MAX_NAME = 200
const MAX_ADDRESS = 512
const MAX_COUNT = 100_000
const MAX_SITES = 1_000
const CONTROL = /[\u0000-\u001f\u007f]/g

const record = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

function name(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.replace(CONTROL, '').trim()
  return s.length > 0 && s.length <= MAX_NAME ? s : null
}

function time(v: unknown): string | null {
  return typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null
}

function count(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_COUNT ? v : null
}

/**
 * An http or https address with no user, query or fragment — something a screen may open in a new tab and nothing
 * more. Its trailing slash is dropped, as hq writes its own address.
 */
export function parseHqAddress(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > MAX_ADDRESS || !ADDRESS.test(v)) return null
  return v.replace(/\/+$/, '')
}

export function parseHqAbout(v: unknown): HqAboutParsed | null {
  const r = record(v)
  if (!r) return null
  return { organisationName: name(r.organisationName), address: parseHqAddress(r.address) }
}

/** `site.loads`' answer: the sites in their shape, the others dropped; null when it carries no list. */
export function parseSiteLoads(v: unknown): SiteLoad[] | null {
  const sites = record(v)?.sites
  if (!Array.isArray(sites)) return null
  const out: SiteLoad[] = []
  for (const raw of sites.slice(0, MAX_SITES)) {
    const s = record(raw)
    if (!s) continue
    const executionSiteId = typeof s.executionSiteId === 'string' && ID.test(s.executionSiteId) ? s.executionSiteId : null
    const running = count(s.running)
    const maxAtOnce = count(s.maxAtOnce)
    const reportedAt = time(s.reportedAt)
    if (!executionSiteId || running === null || maxAtOnce === null || !reportedAt || typeof s.isDefault !== 'boolean') continue
    const copies = typeof s.copiesBytes === 'number' && Number.isFinite(s.copiesBytes) && s.copiesBytes >= 0 ? s.copiesBytes : null
    out.push({ executionSiteId, isDefault: s.isDefault, running, maxAtOnce, reportedAt, ...(copies !== null ? { copiesBytes: copies } : {}) })
  }
  return out
}

function bigCount(v: unknown): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null
}

/** `relay.facts`' answer: hq's relay in its shape; null when hq has none, or gives it in another shape. */
export function parseHqRelay(v: unknown): HqRelay | null {
  const r = record(record(v)?.relay)
  if (!r) return null
  const relayName = name(r.name)
  if (!relayName || typeof r.answering !== 'boolean') return null
  return {
    name: relayName,
    filesAddress: parseHqAddress(r.filesAddress),
    answering: r.answering,
    lastSeenAt: time(r.lastSeenAt),
    sites: count(r.sites),
    openStreams: count(r.openStreams),
    bytesCarried: bigCount(r.bytesCarried),
  }
}

/** `fleetAdmin.list`' accounts in their shape; one without an id or a name is dropped. */
export function parseFleetAdminAccounts(v: unknown): FleetAdminAccount[] {
  if (!Array.isArray(v)) return []
  const out: FleetAdminAccount[] = []
  for (const raw of v) {
    const a = record(raw)
    const id = typeof a?.id === 'string' && a.id.length > 0 && a.id.length <= 64 ? a.id : null
    const shown = name(a?.name)
    if (!a || !id || !shown) continue
    const username = typeof a.username === 'string' && a.username.length <= MAX_NAME ? a.username.replace(CONTROL, '') : ''
    out.push({ id, name: shown, username, organisationAdmin: a.organisationAdmin === true, since: time(a.since) })
  }
  return out
}
