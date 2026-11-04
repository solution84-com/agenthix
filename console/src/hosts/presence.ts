/**
 * What the console knows of each pinned machine besides its identity: whether hq says it is online, and the latest
 * figures and scheduled-change notices its host service sent, sealed. Held in memory; hq and the host services
 * send it again after a restart — a host service offers every notice it holds each time its figures are read.
 */
import { isFingerprint, type HostFigures, type ScheduledChangeNotice } from '@agenthix/core'
import type { HqLink, PresenceFrame } from '../hq/link'
import type { PinnedHosts } from '../state/hosts'

export type PresenceEntry = {
  online: boolean
  since: string | null
  /** When the machine disconnected itself and told hq so (spec §6); it stays listed until a fleet admin removes it. */
  leftAt: string | null
  figures: HostFigures | null
  figuresAt: string | null
  scheduled: ScheduledChangeNotice[]
}

const MAX_NOTICES = 50

/** hq does not announce a machine that left by itself: its list is read again this often. */
export const HOST_LIST_REFRESH_MS = 30_000

export class Presence {
  private readonly entries = new Map<string, PresenceEntry>()
  private readonly waiters = new Map<string, Array<() => void>>()
  private readonly changes: ((fingerprint: string, now: PresenceEntry, before: PresenceEntry) => void)[] = []

  constructor(private readonly hosts: PinnedHosts) {}

  /** Listens to hq's presence frames, and asks for the whole list each time the link comes up and every little while. */
  attach(link: HqLink, refreshMs = HOST_LIST_REFRESH_MS): void {
    link.on('presence', frame => this.onPresence(frame))
    link.on('state', state => {
      if (state !== 'connected') {
        for (const e of this.entries.values()) e.online = false
        return
      }
      void this.refresh(link)
    })
    setInterval(() => { if (link.state === 'connected') void this.refresh(link) }, refreshMs).unref?.()
  }

  /** hq's whole list: whether each machine is online, and whether it left by itself. */
  async refresh(link: HqLink): Promise<void> {
    try {
      const { hosts } = await link.call('host.list', {})
      for (const h of Array.isArray(hosts) ? hosts : []) this.onPresence(h, true)
    } catch {
      // The next refresh, or the link coming up again, asks again.
    }
  }

  of(fingerprint: string): PresenceEntry {
    return this.entries.get(fingerprint) ?? { online: false, since: null, leftAt: null, figures: null, figuresAt: null, scheduled: [] }
  }

  /** Drops all that is held of a machine that is no longer pinned, so it does not show again if the same machine is added. */
  forget(fingerprint: string): void {
    this.entries.delete(fingerprint)
    this.waiters.delete(fingerprint)
  }

  /** Each word hq gives of a pinned machine, with what was known before it (hosts/silence.ts). */
  onChange(listener: (fingerprint: string, now: PresenceEntry, before: PresenceEntry) => void): void {
    this.changes.push(listener)
  }

  setFigures(fingerprint: string, figures: HostFigures, at = new Date()): void {
    this.entries.set(fingerprint, { ...this.of(fingerprint), figures, figuresAt: at.toISOString() })
  }

  /**
   * A notice from the pinned host `fingerprint`, which names the machine in the change by the key it was pinned with,
   * whatever the notice says. A host offers every notice it holds again when its figures are read: one already
   * kept is not kept twice.
   */
  addNotice(fingerprint: string, notice: ScheduledChangeNotice): void {
    const entry = this.of(fingerprint)
    if (entry.scheduled.some(n => n.change.id === notice.change.id && n.sentAt === notice.sentAt)) return
    const own = { ...notice, change: { ...notice.change, machine: { ...notice.change.machine, fingerprint } } }
    const scheduled = [...entry.scheduled, own].sort((a, b) => a.sentAt.localeCompare(b.sentAt)).slice(-MAX_NOTICES)
    this.entries.set(fingerprint, { ...entry, scheduled })
  }

  /** Resolves once hq says the host is online; false when it does not come within the time. */
  waitOnline(fingerprint: string, timeoutMs: number): Promise<boolean> {
    if (this.of(fingerprint).online) return Promise.resolve(true)
    return new Promise(resolve => {
      const done = () => {
        clearTimeout(timer)
        resolve(true)
      }
      const timer = setTimeout(() => {
        this.waiters.set(fingerprint, (this.waiters.get(fingerprint) ?? []).filter(w => w !== done))
        resolve(false)
      }, timeoutMs)
      this.waiters.set(fingerprint, [...(this.waiters.get(fingerprint) ?? []), done])
    })
  }

  /**
   * Only a pinned host's presence counts, and only under the fingerprint it was pinned with: hq names hosts, but the
   * console decides who they are.
   */
  private onPresence(frame: unknown, whole = false): void {
    const p = parsePresence(frame)
    if (!p) return
    const host = this.hosts.byHostId(p.hostId)
    if (!host || host.fingerprint !== p.fingerprint) return
    // A presence frame says only online or not; hq's list says whether it left too.
    const before = this.of(host.fingerprint)
    const leftAt = whole ? p.leftAt : before.leftAt
    const now = { ...before, online: p.online, since: p.since, leftAt }
    this.entries.set(host.fingerprint, now)
    for (const listener of this.changes) listener(host.fingerprint, now, before)
    if (p.online) {
      for (const w of this.waiters.get(host.fingerprint) ?? []) w()
      this.waiters.delete(host.fingerprint)
    }
  }
}

function parsePresence(v: unknown): (PresenceFrame & { leftAt: string | null }) | null {
  if (!v || typeof v !== 'object') return null
  const p = v as Record<string, unknown>
  if (typeof p.hostId !== 'string' || !isFingerprint(p.fingerprint)) return null
  const online = typeof p.online === 'boolean' ? p.online : false
  const leftAt = typeof p.leftAt === 'string' && !Number.isNaN(Date.parse(p.leftAt)) ? p.leftAt : null
  return { hostId: p.hostId, fingerprint: p.fingerprint, online, since: typeof p.since === 'string' ? p.since : new Date().toISOString(), leftAt }
}
