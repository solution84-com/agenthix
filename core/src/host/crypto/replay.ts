import { HOST_ENVELOPE_CLOCK_SKEW_MS } from '../envelope.js'

const PRUNE_EVERY_MS = 10_000

/**
 * Which envelope ids a recipient has accepted, for as long as each could still be presented. Since an envelope lives
 * at most `HOST_ENVELOPE_MAX_LIFETIME_MS`, an id need only be remembered until its expiry.
 *
 * The memory is lost on restart, so the guard also refuses anything sent before it began — plus the allowed clock
 * skew, since a sender whose clock runs ahead could otherwise have stamped an envelope captured before the restart
 * with a later time. So for the first `HOST_ENVELOPE_CLOCK_SKEW_MS` after it starts a recipient refuses, as `stale`,
 * everything but an answer to what it asked since it started (`awaited`); a sender makes a new envelope and tries again.
 */
export class EnvelopeReplayGuard {
  private readonly seen = new Map<string, number>()
  private readonly floor: number
  private lastPrune: number

  constructor(startedAt: number = Date.now()) {
    this.floor = startedAt + HOST_ENVELOPE_CLOCK_SKEW_MS
    this.lastPrune = startedAt
  }

  /**
   * Records the id if it is new; says why not otherwise. Check and record are one step, so two copies cannot both pass.
   * `awaited` says the message answers something this recipient made at random since it started, which no copy taken
   * before a restart can name: such an envelope is not held to the start window, only to its id being new.
   */
  admit(id: string, sentAt: number, expiresAt: number, now: number, awaited = false): 'ok' | 'stale' | 'replayed' {
    if (now - this.lastPrune >= PRUNE_EVERY_MS) this.prune(now)
    if (sentAt < this.floor && !awaited) return 'stale'
    if (this.seen.has(id)) return 'replayed'
    this.seen.set(id, expiresAt)
    return 'ok'
  }

  inStartWindow(sentAt: number): boolean {
    return sentAt < this.floor
  }

  get size(): number {
    return this.seen.size
  }

  private prune(now: number): void {
    for (const [id, expiresAt] of this.seen) if (expiresAt <= now) this.seen.delete(id)
    this.lastPrune = now
  }
}
