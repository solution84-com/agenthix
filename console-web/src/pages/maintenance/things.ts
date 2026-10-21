/**
 * What *Plan maintenance* offers (board *Changes flow*, proposal): HQ and every site, each named after its machine, and
 * the kinds of work each allows — only those the machines carry out today.
 */
import type { FleetHost, FleetResponse } from '../dashboard/types'
import { runsSite } from '../dashboard/words'

export type ChangeKind = 'upgrade' | 'capacity' | 'move' | 'suspend' | 'restore'

/** HQ is `hq`; a site is its machine's fingerprint. */
export type ThingKey = string
export const HQ_KEY = 'hq'

export type Thing = {
  key: ThingKey
  kind: 'hq' | 'site'
  /** "HQ", or the site's machine's name. */
  name: string
  tag: 'HQ' | "HQ's site" | 'Site'
  host: FleetHost
  changes: ChangeKind[]
  /** Why no work can be asked of it now; null when it can. */
  unavailable: string | null
}

export const CHANGE_WORDS: Record<ChangeKind, { label: string; hint: string }> = {
  upgrade: { label: 'Upgrade', hint: 'To a newer version, backed up first and rolled back if it does not come up healthy.' },
  capacity: { label: 'Change capacity', hint: 'What each agent run gets, and how many run at once.' },
  move: { label: 'Move', hint: 'To another machine, with everything it holds.' },
  suspend: { label: 'Suspend', hint: 'Stop HQ and keep everything; Resume starts it again as it was.' },
  restore: { label: 'Restore a backup', hint: 'Back to an earlier night, after a backup of what is there now.' },
}

const hqSuspended = (h: FleetHost) => h.figures?.installs.some(i => i.target === 'hq' && i.state === 'suspended') ?? false

function unavailable(h: FleetHost, name: string): string | null {
  if (!h.online) return `${name} is not answering, so nothing can reach it now.`
  if (h.move) return `${name} is in a move; other work waits until it ends.`
  return null
}

/** HQ first, then every site — HQ's own first, then by name. A machine with no site, or one that left, is no site. */
export function thingsOf(fleet: FleetResponse): Thing[] {
  const things: Thing[] = []
  const hq = fleet.hosts.find(h => h.hqMachine) ?? null
  if (hq) {
    const suspended = hqSuspended(hq)
    things.push({
      key: HQ_KEY, kind: 'hq', name: 'HQ', tag: 'HQ', host: hq,
      changes: ['upgrade', 'capacity', 'move', 'suspend', 'restore'],
      unavailable: suspended ? 'HQ is suspended: resume it from its page first.' : unavailable(hq, 'HQ'),
    })
  }
  const sites = fleet.hosts
    .filter(h => !h.leftByItself && runsSite(h))
    .sort((a, b) => Number(b.hqMachine) - Number(a.hqMachine) || a.machineName.localeCompare(b.machineName))
  for (const h of sites) {
    // HQ's own site upgrades, moves and is restored with HQ: those are HQ's to do.
    things.push({
      key: h.fingerprint, kind: 'site', name: h.machineName, tag: h.hqMachine ? "HQ's site" : 'Site', host: h,
      changes: h.hqMachine ? ['capacity'] : ['upgrade', 'capacity', 'move', 'restore'],
      unavailable: unavailable(h, h.machineName),
    })
  }
  return things
}

/** The thing the address names: `hq`, or a machine's fingerprint — HQ's machine meaning HQ for what HQ owns. */
export function thingFor(things: readonly Thing[], key: ThingKey, change: ChangeKind | null): Thing | null {
  const hq = things.find(t => t.kind === 'hq') ?? null
  if (key === HQ_KEY) return hq
  const site = things.find(t => t.key === key) ?? null
  if (site && hq && site.host.hqMachine && change && change !== 'capacity') return hq
  return site
}

/** Why a thing does not offer a kind of work: said when choosing it clears *What*. */
export function notOffered(thing: Thing, kind: ChangeKind): string {
  if (thing.tag === "HQ's site" && kind === 'restore') return `${thing.name} goes back to an earlier night with HQ: choose HQ for that.`
  if (thing.tag === "HQ's site" && kind !== 'suspend') return `${thing.name} ${CHANGE_WORDS[kind].label.toLowerCase()}s with HQ: choose HQ for that.`
  return `${thing.name} does not offer ${CHANGE_WORDS[kind].label}.`
}

export const isKind = (s: string | null): s is ChangeKind => s === 'upgrade' || s === 'capacity' || s === 'move' || s === 'suspend' || s === 'restore'
