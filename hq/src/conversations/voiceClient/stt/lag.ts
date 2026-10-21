/**
 * A connection's words on the capture clock, and its lag: how long after a word was spoken it arrived (what the
 * person sees), and how long after its audio was sent (the connection's own lag, which replacing it can mend).
 */
import type { TimedWord } from '../events'
import type { ServiceWord } from '../ports'
import type { StreamClock } from '../streamClock'

/** The service's words on the capture clock; none when any cannot be placed. */
export function timedWords(clock: StreamClock, service: ServiceWord[]): TimedWord[] {
  const out: TimedWord[] = []
  for (const w of service) {
    const startAt = clock.capturedAt(w.start)
    const endAt = clock.capturedAt(w.end)
    if (startAt === null || endAt === null) return []
    out.push({ text: w.text, startAt, endAt })
  }
  return out
}

/** The lag of words reaching past `heardTo` in the stream (only a word's first arrival counts); null otherwise. */
export function lagOf(clock: StreamClock, service: ServiceWord[], heardTo: number, now: number) {
  const end = service.reduce((at, w) => Math.max(at, w.end), -Infinity)
  if (!(end > heardTo)) return null
  const spokenAt = clock.capturedAt(end)
  const sentAt = clock.sentAt(end)
  if (spokenAt === null || sentAt === null) return { heardTo: end, lagMs: null, connectionLagMs: null }
  return { heardTo: end, lagMs: Math.max(0, Math.round(now - spokenAt)), connectionLagMs: Math.max(0, now - sentAt) }
}

/**
 * The inbound loop's lag as it goes: the end-to-end lag and the backlog, published as `stt.lag` when they change,
 * and the current connection's own lag, which decides its replacement.
 */
export function lagMeter() {
  let lag = { lagMs: 0, queuedMs: 0 }
  let published = { lagMs: -1, queuedMs: -1 }
  let connectionMs = 0
  return {
    connectionMs: () => connectionMs,
    /** A fresh connection: nothing is known of its own lag yet. */
    fresh() { connectionMs = 0 },
    queued(ms: number) { lag = { ...lag, queuedMs: Math.round(ms) } },
    /** Words arrived on `link`'s connection. */
    heard(link: { clock: StreamClock; heardTo: number }, service: ServiceWord[], now: number) {
      const measured = lagOf(link.clock, service, link.heardTo, now)
      if (!measured) return
      link.heardTo = measured.heardTo
      if (measured.lagMs !== null) lag = { ...lag, lagMs: measured.lagMs }
      if (measured.connectionLagMs !== null) connectionMs = measured.connectionLagMs
    },
    /** What to publish now, if anything changed. */
    changed(): { lagMs: number; queuedMs: number } | null {
      if (lag.lagMs === published.lagMs && lag.queuedMs === published.queuedMs) return null
      published = lag
      return lag
    },
  }
}
