/**
 * What hq needs for its one notice about a machine that stops answering (core's stopping.ts): hq raises and clears
 * *not heard from* itself, to fleet admins, even while this Fleet Console is down. This module tells hq, per machine,
 * the two facts only the Fleet Console knows — whether its fleet admins asked to be told (`notifyIfSilent`, always for
 * hq's machine), and when its host service said it stops on purpose — over the existing link (`host.silenceFacts`).
 * A notification preference only: it gives hq no authority over anything, and nothing here does anything to a machine.
 *
 * The stop is kept in `silence.json` until the machine answers again on a new connection, so a restart of the Fleet
 * Console does not forget it. What hq was last told is held in memory and told again whenever it differs, and every
 * time the link comes up; an hq older than the method is left alone.
 */
import type { HostSilenceFacts } from '@agenthix/core'
import { HqCallError, type HqLink } from '../hq/link'
import type { StateFolder } from '../state/folder'
import { notifiesIfSilent, type PinnedHosts } from '../state/hosts'
import type { Presence, PresenceEntry } from './presence'

const FILE = 'silence.json'
export const SILENCE_SYNC_MS = 30_000

export type SilenceDeps = {
  hosts: PinnedHosts
  presence: Presence
  link: HqLink
  state: StateFolder
  now?: () => Date
}

export class Silence {
  private stops: Record<string, string>
  /** What hq was last told, per machine, as it was sent. */
  private readonly told = new Map<string, string>()
  private hqTooOld = false
  private syncing: Promise<void> | null = null
  private again = false

  constructor(private readonly d: SilenceDeps) {
    this.stops = read(d.state)
    d.presence.onChange((fp, now, before) => this.onPresence(fp, now, before))
    d.link.on('state', state => {
      this.told.clear()
      if (state === 'connected') void this.sync()
    })
  }

  /** Tells hq again every little while what it has not been told; the tests call `sync` themselves. */
  start(everyMs = SILENCE_SYNC_MS): void {
    setInterval(() => void this.sync(), everyMs).unref?.()
  }

  /** The stop word from a pinned machine: its card reads as stopped, and hq raises no notice, until it answers again. */
  stopped(fingerprint: string): void {
    if (!this.d.hosts.byFingerprint(fingerprint)) return
    this.keep(fingerprint, this.now().toISOString())
    void this.sync()
  }

  stoppedAt(fingerprint: string): string | null {
    return this.stops[fingerprint] ?? null
  }

  /** Tells hq each machine's facts that differ from what it was last told. One pass at a time; a call meanwhile runs one more. */
  sync(): Promise<void> {
    if (this.syncing) {
      this.again = true
      return this.syncing
    }
    this.syncing = (async () => {
      do {
        this.again = false
        await this.pass()
      } while (this.again)
    })().finally(() => { this.syncing = null })
    return this.syncing
  }

  private async pass(): Promise<void> {
    for (const fp of Object.keys(this.stops)) if (!this.d.hosts.byFingerprint(fp)) this.keep(fp, null)
    if (this.d.link.state !== 'connected' || this.hqTooOld) return
    for (const h of this.d.hosts.list()) {
      const facts: HostSilenceFacts = { hostId: h.hostId, notifyIfSilent: notifiesIfSilent(h), stoppedAt: this.stoppedAt(h.fingerprint) }
      const said = JSON.stringify(facts)
      if (this.told.get(h.fingerprint) === said) continue
      try {
        await this.d.link.call('host.silenceFacts', facts)
        this.told.set(h.fingerprint, said)
      } catch (err) {
        if (err instanceof HqCallError && err.code === 'unknown_method') {
          this.hqTooOld = true
          return
        }
        // Told again on the next pass, or when the link comes up again.
      }
    }
  }

  /** It answers again, on a new connection: the stop is over. */
  private onPresence(fingerprint: string, now: PresenceEntry, before: PresenceEntry): void {
    if (!now.online || (before.online && before.since === now.since) || !this.stops[fingerprint]) return
    this.keep(fingerprint, null)
    void this.sync()
  }

  private keep(fingerprint: string, stoppedAt: string | null): void {
    const { [fingerprint]: _was, ...rest } = this.stops
    this.stops = stoppedAt ? { ...rest, [fingerprint]: stoppedAt } : rest
    this.d.state.writeJson([FILE], { stops: this.stops })
  }

  private now(): Date {
    return (this.d.now ?? (() => new Date()))()
  }
}

/** What was kept; anything not its shape is left out, never trusted. */
function read(state: StateFolder): Record<string, string> {
  const stops = (state.readJson(FILE) as { stops?: unknown } | null)?.stops
  if (!stops || typeof stops !== 'object' || Array.isArray(stops)) return {}
  const out: Record<string, string> = {}
  for (const [fp, at] of Object.entries(stops as Record<string, unknown>)) {
    if (/^[0-9a-f]{64}$/.test(fp) && typeof at === 'string' && at.length <= 40 && !Number.isNaN(Date.parse(at))) out[fp] = at
  }
  return out
}
