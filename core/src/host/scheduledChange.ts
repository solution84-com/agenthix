/**
 * Scheduled changes and the notice hq gets of them (host-management spec §14). A change is held by the host service
 * of the machine it affects, which runs it at its time. hq hears of it through its control socket when the change is
 * on hq's machine, or from the site over its channel when it is on a site's machine — the same notice either way —
 * and resolves which members it affects.
 *
 * In anything a person reads this is a "scheduled change", never a booking or an operation.
 */
import type { HostTarget } from './figures.js'

export type ScheduledChangeKind = 'upgrade' | 'resize' | 'restore' | 'move' | 'erase' | 'suspend' | 'resume'

export const SCHEDULED_CHANGE_KINDS: readonly ScheduledChangeKind[] = [
  'upgrade', 'resize', 'restore', 'move', 'erase', 'suspend', 'resume',
]

/**
 * How long before a change hq starts no new runs on what it affects and running agents pause after their current
 * step ("a few minutes before", spec §14).
 */
export const SCHEDULED_CHANGE_PAUSE_LEAD_MS = 5 * 60_000

/**
 * Who scheduled it. A fleet admin is named; a machine admin is not an account, and Cloud is Cloud. The maintenance
 * window is the host service itself, scheduling a fix by its own setting (spec §11).
 */
export type ScheduledBy =
  | { kind: 'fleetAdmin'; userId: string; name: string }
  | { kind: 'machineAdmin' }
  | { kind: 'cloud' }
  | { kind: 'maintenanceWindow' }

export type ScheduledChangeState =
  | 'scheduled'
  /** Within the pause lead: no new runs start, running ones pause. */
  | 'pausing'
  | 'running'
  | 'done'
  /** It failed and the host service rolled back; what was there runs again. */
  | 'rolledBack'
  | 'cancelled'
  /** Its time passed while the host service was not running, too long ago to run it late; it was not run. */
  | 'missed'

export type ScheduledChange = {
  id: string
  kind: ScheduledChangeKind
  /** What it changes: hq (with its default site), or the machine's site. */
  target: HostTarget
  /** The site's name, which is what members know it by. */
  siteName: string
  machine: { name: string; fingerprint: string }
  /** When it runs (ISO). */
  at: string
  scheduledBy: ScheduledBy
  scheduledAt: string
  state: ScheduledChangeState
  /** For an upgrade, the version it moves to; for a move, the machine it moves to. Words a person reads. */
  detail: string | null
  /** About how long it takes, in minutes, for the notice's "for about 20 minutes"; null when not known. */
  expectedMinutes: number | null
}

/** What happened to the change, which is why this notice was sent. */
export type ScheduledChangeUpdate =
  | 'scheduled' | 'changed' | 'cancelled' | 'pausing' | 'started' | 'completed' | 'failed'
  /** It was not run: its time passed while the host service was not running (`reason` says so). */
  | 'missed'

/** What a host service sends toward hq (by its control socket, or by its site over the channel). */
export type ScheduledChangeNotice = {
  update: ScheduledChangeUpdate
  change: ScheduledChange
  /** When this notice was made (ISO), so a late one never overwrites a newer one. */
  sentAt: string
  /** On `failed` and `missed`: what went wrong (and, on `failed`, that it was rolled back), in a sentence. */
  reason: string | null
}

/** The one-way site event a site passes a notice to hq with over its channel. */
export const SCHEDULED_CHANGE_EVENT = 'site.scheduledChange'

/** The notice with the members hq resolved it to: those whose work is on what the change affects. */
export type ResolvedScheduledChangeNotice = ScheduledChangeNotice & {
  affectedMemberIds: string[]
}

const UPDATES: readonly ScheduledChangeUpdate[] = ['scheduled', 'changed', 'cancelled', 'pausing', 'started', 'completed', 'failed', 'missed']
const STATES: readonly ScheduledChangeState[] = ['scheduled', 'pausing', 'running', 'done', 'rolledBack', 'cancelled', 'missed']
/** A day: anything longer is not a scheduled change's expected length. */
const MAX_MINUTES = 24 * 60
const MAX_TEXT = 300

const iso = (v: unknown): string | null =>
  typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null
/** An identifier is refused when it is too long, never cut: two long ids must not read as one. */
const ident = (v: unknown): string | null => (typeof v === 'string' && v.trim() && v.trim().length <= MAX_TEXT ? v.trim() : null)
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_TEXT) : null)
const record = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

function parseScheduledBy(v: unknown): ScheduledBy | null {
  const r = record(v)
  if (r?.kind === 'machineAdmin') return { kind: 'machineAdmin' }
  if (r?.kind === 'cloud') return { kind: 'cloud' }
  if (r?.kind === 'maintenanceWindow') return { kind: 'maintenanceWindow' }
  if (r?.kind !== 'fleetAdmin') return null
  const userId = ident(r.userId)
  const name = text(r.name)
  return userId && name ? { kind: 'fleetAdmin', userId, name } : null
}

function parseChange(v: unknown): ScheduledChange | null {
  const r = record(v)
  const machine = record(r?.machine)
  if (!r || !machine) return null
  const kind = SCHEDULED_CHANGE_KINDS.find((k) => k === r.kind)
  const state = STATES.find((s) => s === r.state)
  const target = r.target === 'hq' || r.target === 'site' ? r.target : null
  const id = ident(r.id)
  const siteName = text(r.siteName)
  const machineName = text(machine.name)
  const fingerprint = ident(machine.fingerprint)
  const at = iso(r.at)
  const scheduledAt = iso(r.scheduledAt)
  const scheduledBy = parseScheduledBy(r.scheduledBy)
  if (!kind || !state || !target || !id || !siteName || !machineName || !fingerprint || !at || !scheduledAt || !scheduledBy) {
    return null
  }
  return {
    id, kind, target, siteName, machine: { name: machineName, fingerprint }, at, scheduledBy, scheduledAt, state,
    detail: text(r.detail),
    expectedMinutes: typeof r.expectedMinutes === 'number' && Number.isInteger(r.expectedMinutes) &&
      r.expectedMinutes > 0 && r.expectedMinutes <= MAX_MINUTES ? r.expectedMinutes : null,
  }
}

/** A notice as it came off a socket or the channel, checked field by field; null when it is not one. */
export function parseScheduledChangeNotice(data: unknown): ScheduledChangeNotice | null {
  const r = record(data)
  if (!r) return null
  const update = UPDATES.find((u) => u === r.update)
  const change = parseChange(r.change)
  const sentAt = iso(r.sentAt)
  if (!update || !change || !sentAt) return null
  return { update, change, sentAt, reason: text(r.reason) }
}
