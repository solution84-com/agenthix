/** The figures for the whole fleet (board *Fleet*): the tiles, and what the hero says of HQ's machine. */
import type { ScheduledChange, ScheduledChangeKind } from '@agenthix/core'
import type { FleetHost } from './types'
import { describeHost, runsSite, whenIs, type HostState } from './words'

const KIND: Record<ScheduledChangeKind, string> = {
  upgrade: 'Upgrade', resize: 'Resize', restore: 'Restore', move: 'Move', erase: 'Erase', suspend: 'Suspend', resume: 'Resume',
}
const PENDING = ['scheduled', 'pausing', 'running']

/** The changes still to come or under way: of each, its newest notice. */
export function pendingChanges(h: FleetHost): ScheduledChange[] {
  const latest = new Map<string, { sentAt: string; change: ScheduledChange }>()
  for (const n of h.scheduled) {
    const seen = latest.get(n.change.id)
    if (!seen || n.sentAt >= seen.sentAt) latest.set(n.change.id, { sentAt: n.sentAt, change: n.change })
  }
  return [...latest.values()].map(v => v.change).filter(c => PENDING.includes(c.state)).sort((a, b) => a.at.localeCompare(b.at))
}

export const changeWords = (c: ScheduledChange): string => `${KIND[c.kind]}${c.detail ? ` ${c.detail}` : ''}`

const STATE_WORDS: Record<Exclude<HostState, 'empty'>, string> = {
  healthy: 'healthy', starting: 'starting', attention: 'needs attention', left: 'needs attention', notAnswering: 'needs attention',
  moving: 'moving', stopped: 'stopped', notHeard: 'not heard from',
}

export type Overview = {
  sites: { total: number; breakdown: string }
  attention: { count: number; reasons: { siteName: string; reason: string }[] }
  /** Runs across the sites whose runs HQ gave, against what they take at once. */
  agents: { running: number; capacity: number; sites: number }
  next: { when: string; what: string; sites: string[] } | null
  backup: { at: string; ok: boolean; reachedLocation: boolean; locationSet: boolean } | null
}

export function overviewOf(all: FleetHost[], now: Date): Overview {
  // A machine with no site — or one still receiving its site — is no site: it counts in no tile, and its backup log
  // may be an earlier site's.
  const hosts = all.filter(runsSite)
  const empty = all.length - hosts.length
  const counts = new Map<string, number>()
  const reasons: Overview['attention']['reasons'] = []
  for (const h of hosts) {
    const words = describeHost(h, now)
    if (words.state === 'empty') continue
    const key = STATE_WORDS[words.state]
    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (words.attention) reasons.push({ siteName: h.siteName, reason: words.attention })
  }
  const order = ['healthy', 'needs attention', 'starting', 'moving', 'stopped', 'not heard from']
  const breakdown = [
    ...order.filter(k => counts.has(k)).map(k => `${counts.get(k)} ${counts.get(k) === 1 ? k : k.replace(/^needs /, 'need ')}`),
    ...(empty > 0 ? [`${empty} ${empty === 1 ? 'machine' : 'machines'} with no site`] : []),
  ].join(' · ')

  const known = hosts.flatMap(h => (h.agents ? [h.agents] : []))
  const agents = {
    running: known.reduce((n, a) => n + a.running, 0),
    capacity: known.reduce((n, a) => n + a.maxAtOnce, 0),
    sites: known.length,
  }

  const pending = hosts.flatMap(h => pendingChanges(h))
  pending.sort((a, b) => a.at.localeCompare(b.at))
  let next: Overview['next'] = null
  if (pending[0]) {
    const first = pending[0]
    const same = pending.filter(c => c.at === first.at && changeWords(c) === changeWords(first))
    next = { when: whenIs(first.at, now), what: changeWords(first), sites: [...new Set(same.map(c => c.siteName))] }
  }

  let backup: Overview['backup'] = null
  for (const h of hosts) {
    const b = h.figures?.backups
    if (b?.lastNightlyAt && (!backup || b.lastNightlyAt > backup.at)) {
      backup = { at: b.lastNightlyAt, ok: b.lastNightlyOk === true, reachedLocation: b.lastCopyAt !== null && b.lastCopyAt >= b.lastNightlyAt, locationSet: b.locationSet }
    }
  }
  return { sites: { total: hosts.length, breakdown }, attention: { count: reasons.length, reasons }, agents, next, backup }
}
