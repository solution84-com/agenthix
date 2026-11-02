/**
 * How often the relay refused requests to each app since its last report to hq (`relay.report`'s `appRefusals`), for
 * the guard's *relay refusals over a threshold*. Bounded: past `MAX_APPS` apps a new one is not counted
 * until the next report empties the table.
 */
import type { RelayAppRefusal } from '@agenthix/core'

export const MAX_APPS = 1_000

export class AppRefusals {
  private readonly counts = new Map<string, Map<RelayAppRefusal, number>>()

  count(appId: string, refusal: RelayAppRefusal): void {
    let byRefusal = this.counts.get(appId)
    if (!byRefusal) {
      if (this.counts.size >= MAX_APPS) return
      this.counts.set(appId, (byRefusal = new Map()))
    }
    byRefusal.set(refusal, (byRefusal.get(refusal) ?? 0) + 1)
  }

  /** Every count since the last call, and the table emptied. */
  drain(): { appId: string; refusal: RelayAppRefusal; count: number }[] {
    const out = [...this.counts].flatMap(([appId, m]) => [...m].map(([refusal, count]) => ({ appId, refusal, count })))
    this.counts.clear()
    return out
  }
}
