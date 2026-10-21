/**
 * What a notice opens on the screens: the thing it is about. A machine's notice names its machine by hq's id; a role's
 * opens the fleet admins; an announced action names its site and machine only in words — the subject this Fleet
 * Console recorded and hq's sentence for it — so the machines are found by name among the pinned ones. The target only
 * picks a page to open: a name never finds, matches or authorises anything else.
 */
import type { FleetNotice } from '@agenthix/core'
import type { Move } from '../../move/types'
import type { PinnedHost } from '../../state/hosts'

export type NoticeTarget =
  | { page: 'site'; fingerprint: string }
  /** HQ's page; today the page of the machine that carries hq. */
  | { page: 'hq'; fingerprint: string }
  /**
   * A move, followed by its id: its progress while under way, its outcome once over. `fingerprint` is the machine it
   * leaves while under way, and once over the one the site is on — whose page opens if the move is no longer held.
   */
  | { page: 'move'; fingerprint: string; moveId: string; hq: boolean }
  | { page: 'fleetAdmins' }
  /** Nothing it names has a page any more (a machine disconnected, for one): the dashboard lists what is left. */
  | { page: 'dashboard' }

export type NoticeFleet = {
  hosts: PinnedHost[]
  /** The move under way that a machine takes part in, sending or receiving. */
  moveOf: (fingerprint: string) => Move | null
  /** The last move a machine took part in, under way or over; null once none is held. */
  lastMoveOf: (fingerprint: string) => Move | null
}

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Where `name` stands as a whole word in `text` ("lab" is not in "lab-01"); -1 when it does not. */
export function wordAt(text: string, name: string): number {
  if (!name) return -1
  const m = new RegExp(`(^|[^\\w.-])${escaped(name)}(?=$|[^\\w-])`).exec(text)
  return m ? m.index + m[1].length : -1
}

const pageOf = (h: PinnedHost): NoticeTarget => (h.hqMachine ? { page: 'hq', fingerprint: h.fingerprint } : { page: 'site', fingerprint: h.fingerprint })

const ABOUT_A_MOVE = /\bmov(e|ed|ing)\b|\bto receive\b/i
/** Moving the Fleet Console is no site's move. */
const ABOUT_THE_CONSOLE = /\bFleet Console\b/

export function noticeTarget(n: Pick<FleetNotice, 'kind' | 'title' | 'body' | 'hostId'>, fleet: NoticeFleet): NoticeTarget {
  const hq = fleet.hosts.find(h => h.hqMachine) ?? null
  switch (n.kind) {
    case 'machineLeft':
    case 'machineNotHeardFrom': {
      const host = n.hostId ? fleet.hosts.find(h => h.hostId === n.hostId) : undefined
      return host ? pageOf(host) : { page: 'dashboard' }
    }
    case 'roleGranted':
    case 'roleRemoved':
      return { page: 'fleetAdmins' }
    case 'activity':
      break
  }

  // "… connected the site S to HQ" is about S; any other HQ in hq's sentence is HQ itself.
  const aboutHq = wordAt(n.title.replace(/ to HQ$/, ''), 'HQ') >= 0
  const text = `${n.body}\n${n.title}`
  const named = fleet.hosts
    .map(h => ({ h, at: wordAt(text, h.machineName) }))
    .filter(x => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(x => x.h)
  const host = (aboutHq ? hq : null) ?? named.find(h => wordAt(n.title, h.siteName) >= 0) ?? named[0] ?? null
  if (!host) return { page: 'dashboard' }

  if (!ABOUT_A_MOVE.test(n.title) || ABOUT_THE_CONSOLE.test(n.title)) return pageOf(host)
  const under = fleet.moveOf(host.fingerprint)
  if (under) return { page: 'move', fingerprint: under.from, moveId: under.moveId, hq: under.kind === 'hq' }
  const last = fleet.lastMoveOf(host.fingerprint)
  if (!last) return pageOf(host)
  const siteOn = last.state === 'done' && last.to ? last.to : last.from
  return { page: 'move', fingerprint: siteOn, moveId: last.moveId, hq: last.kind === 'hq' }
}
