/**
 * What hq tells a fleet admin, over the console link, of the record it keeps for them (host-management spec §7, §10):
 * what fleet admins and the command line did, the notices it keeps for that person, and an account found by its
 * username so that it can be given the role. hq answers each only for an account that holds the role. Words on a
 * screen: each field is checked for its shape on arrival, and an entry that is not its shape is dropped, never passed
 * on. Browser-safe: no Node import.
 */

/** One thing done, as hq recorded it. `by` is null for a machine admin at the command line. */
export type FleetActivityEntry = {
  id: string
  at: string
  by: { id: string; name: string } | null
  /** What was done, as a name for the record (`site.added`); the screen gives it words. */
  action: string
  /** What it was done to, in words. */
  subject: string
}

/** A page of the record, newest first; `next` asks for the page after it, null at the last. */
export type FleetActivityPage = { entries: FleetActivityEntry[]; next: string | null }

/**
 * What a fleet admin is told: a machine that left by itself, one not heard from for 10 minutes (both clear themselves
 * and cannot be dismissed), something a fleet admin did that is announced (an export, an erase, a site added or
 * disconnected, a move), and the role given or removed. Since 1.3, for live previews on the organisation's sites
 * (`LivePreviewsCapacity`): a site whose memory passed `LIVE_PREVIEWS_MEMORY_HIGH_PERCENT` (`siteMemoryHigh`), the
 * same site back under `LIVE_PREVIEWS_MEMORY_RECOVERED_PERCENT` (`siteMemoryRecovered`), and a live preview stopped
 * because its machine ran out of memory (`livePreviewStoppedForResources`, saying whose and which branch, never what
 * was in it). `hostId` names the site's machine.
 */
export const FLEET_NOTICE_KINDS = [
  'machineLeft', 'machineNotHeardFrom', 'activity', 'roleGranted', 'roleRemoved',
  'siteMemoryHigh', 'siteMemoryRecovered', 'livePreviewStoppedForResources',
] as const
export type FleetNoticeKind = (typeof FLEET_NOTICE_KINDS)[number]

export type FleetNotice = {
  id: string
  kind: FleetNoticeKind
  title: string
  body: string
  at: string
  dismissible: boolean
  /** The machine a machine's notice is about, as hq knows it; null for the others. */
  hostId: string | null
}

/** An account in hq, found by the username it signs in with. */
export type HqAccount = { id: string; name: string; username: string; organisationAdmin: boolean; fleetAdmin: boolean }

/** The most hq gives in one page of the record, and the most notices it gives. */
export const FLEET_ACTIVITY_PAGE = 100
export const FLEET_NOTICES_MAX = 100

const ID = /^[A-Za-z0-9_-]{1,64}$/
const CONTROL = /[\u0000-\u001f\u007f]/g
const MAX_ACTION = 200
const MAX_SUBJECT = 500
const MAX_NAME = 200
const MAX_TITLE = 500
const MAX_BODY = 2000

const record = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

const id = (v: unknown): string | null => (typeof v === 'string' && ID.test(v) ? v : null)

/** Text a person reads, without control characters; null when empty or longer than `max`. */
function words(v: unknown, max: number): string | null {
  if (typeof v !== 'string' || v.length > max) return null
  const s = v.replace(CONTROL, '').replace(/ {2,}/g, ' ').trim()
  return s.length > 0 ? s : null
}

function time(v: unknown): string | null {
  return typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null
}

function entry(v: unknown): FleetActivityEntry | null {
  const e = record(v)
  if (!e) return null
  let by: FleetActivityEntry['by'] = null
  if (e.by !== null) {
    const b = record(e.by)
    const byId = id(b?.id)
    const name = words(b?.name, MAX_NAME)
    if (!byId || !name) return null
    by = { id: byId, name }
  }
  const out = { id: id(e.id), at: time(e.at), by, action: words(e.action, MAX_ACTION), subject: words(e.subject, MAX_SUBJECT) }
  return out.id && out.at && out.action && out.subject ? (out as FleetActivityEntry) : null
}

/** `activity.list`'s answer: the entries in their shape, the others dropped; null when it carries no list. */
export function parseFleetActivityPage(v: unknown): FleetActivityPage | null {
  const r = record(v)
  if (!r || !Array.isArray(r.entries)) return null
  const entries = r.entries.slice(0, FLEET_ACTIVITY_PAGE).map(entry).filter((e): e is FleetActivityEntry => e !== null)
  return { entries, next: id(r.next) }
}

function notice(v: unknown): FleetNotice | null {
  const n = record(v)
  if (!n || typeof n.dismissible !== 'boolean') return null
  const kind = (FLEET_NOTICE_KINDS as readonly unknown[]).includes(n.kind) ? (n.kind as FleetNoticeKind) : null
  if (n.hostId !== null && id(n.hostId) === null) return null
  const out = { id: id(n.id), kind, title: words(n.title, MAX_TITLE), body: words(n.body, MAX_BODY) ?? '', at: time(n.at) }
  if (!out.id || !out.kind || !out.title || !out.at) return null
  return { ...(out as Omit<FleetNotice, 'dismissible' | 'hostId'>), dismissible: n.dismissible, hostId: id(n.hostId) }
}

/** `notices.list`' answer: the notices in their shape, the others dropped; null when it carries no list. */
export function parseFleetNotices(v: unknown): FleetNotice[] | null {
  const list = record(v)?.notices
  if (!Array.isArray(list)) return null
  return list.slice(0, FLEET_NOTICES_MAX).map(notice).filter((n): n is FleetNotice => n !== null)
}

/** `account.find`'s answer: the account in its shape, or null for none. */
export function parseHqAccount(v: unknown): HqAccount | null {
  const a = record(record(v)?.account)
  if (!a || typeof a.organisationAdmin !== 'boolean' || typeof a.fleetAdmin !== 'boolean') return null
  const out = { id: id(a.id), name: words(a.name, MAX_NAME), username: words(a.username, MAX_NAME) }
  if (!out.id || !out.name || !out.username) return null
  return { id: out.id, name: out.name, username: out.username, organisationAdmin: a.organisationAdmin, fleetAdmin: a.fleetAdmin }
}
