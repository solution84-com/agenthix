/**
 * Two of S33's signals the guard works out over time rather than from one look:
 * - blockedAddresses: the host service's protections count, per rule and per agent address, what they dropped since
 *   they were last applied (core's `ProtectionDrop`). The guard keeps a minute of those totals for a live preview's addresses;
 *   more than `GUARD_BLOCKED_PER_MINUTE` new drops in a minute is the signal. A total that falls means the rules were
 *   applied again, and counting starts over.
 * - unusualUse: CPU, memory or traffic far above what the live preview used while its apps were starting or a run worked, with no run active,
 *   on two looks in a row (one look can catch a run's last moment).
 */
import { GUARD_BLOCKED_PER_MINUTE, type ProtectionDrop } from '@agenthix/core'
import type { UsageSample } from './guardDocker'

const MINUTE_MS = 60_000

type Sample = { at: number; total: number }

export class BlockedWindow {
  private samples: Sample[] = []

  /** Adds the drops now counted for `addresses`; true when more than the limit came within the last minute. */
  add(drops: readonly ProtectionDrop[], addresses: readonly string[], at: number): boolean {
    const mine = new Set(addresses)
    const total = drops.filter(d => mine.has(d.source)).reduce((sum, d) => sum + (Number.isFinite(d.dropped) ? d.dropped : 0), 0)
    const last = this.samples[this.samples.length - 1]
    if (last && total < last.total) this.samples = []
    this.samples.push({ at, total })
    this.samples = this.samples.filter(s => at - s.at <= MINUTE_MS)
    const oldest = this.samples[0]
    return total - oldest.total > GUARD_BLOCKED_PER_MINUTE
  }
}

/** Far above: this many times the most seen while working, and never less than the floors below. */
export const UNUSUAL_FACTOR = 4
export const UNUSUAL_CPU_FLOOR_PERCENT = 50
export const UNUSUAL_MEMORY_FLOOR_BYTES = 512 * 1024 * 1024
/** Bytes a second in and out together. */
export const UNUSUAL_TRAFFIC_FLOOR_PER_S = 5 * 1024 * 1024

export type UsageVerdict = { unusual: false } | { unusual: true; what: string }

export class UsagePattern {
  private peak = { cpu: 0, memory: 0, traffic: 0 }
  private last: { at: number; netBytes: number } | null = null
  private strikes = 0

  /** One look at the live preview's containers taken together. */
  add(samples: readonly UsageSample[], at: number, runActive: boolean): UsageVerdict {
    const cpu = samples.reduce((s, x) => s + x.cpuPercent, 0)
    const memory = samples.reduce((s, x) => s + x.memoryBytes, 0)
    const netBytes = samples.reduce((s, x) => s + x.netBytes, 0)
    const seconds = this.last ? (at - this.last.at) / 1000 : 0
    const traffic = this.last && seconds > 0 ? Math.max(0, netBytes - this.last.netBytes) / seconds : 0
    this.last = { at, netBytes }
    if (runActive) {
      this.peak = { cpu: Math.max(this.peak.cpu, cpu), memory: Math.max(this.peak.memory, memory), traffic: Math.max(this.peak.traffic, traffic) }
      this.strikes = 0
      return { unusual: false }
    }
    const what = cpu > Math.max(UNUSUAL_CPU_FLOOR_PERCENT, this.peak.cpu * UNUSUAL_FACTOR) ? 'processor'
      : memory > Math.max(UNUSUAL_MEMORY_FLOOR_BYTES, this.peak.memory * UNUSUAL_FACTOR) ? 'memory'
      : traffic > Math.max(UNUSUAL_TRAFFIC_FLOOR_PER_S, this.peak.traffic * UNUSUAL_FACTOR) ? 'network traffic'
      : null
    this.strikes = what ? this.strikes + 1 : 0
    return what && this.strikes >= 2 ? { unusual: true, what } : { unusual: false }
  }
}
