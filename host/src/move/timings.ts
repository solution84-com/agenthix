/**
 * How long each side of a move waits (spec §13 *A site moves*). The rule they keep between them: the new machine
 * runs the site only from the old machine's release until its own deadline, unless the old machine committed by
 * then; the old machine starts the site again on the new machine's signed word that it gave up and stopped the site,
 * or else only after a later deadline of its own, which no delay of the release on the way can bring before the new
 * machine's. So the two never run the site at once.
 */
import { HOST_ENVELOPE_CLOCK_SKEW_MS, HOST_TRANSFER_IDLE_MS } from '@agenthix/core'
import type { Context } from '../service/context'
import { STEP_LIFETIME_MS } from './peer'

export type MoveTimings = {
  /** From the release, how long the new machine has to see the site answer hq and hear the commit. */
  takeoverMs: number
  /** Silence from the other machine this long, during the transfer or the restore, ends the move. */
  idleMs: number
  /** How often the new machine says it is still restoring, and asks its site whether it answers hq. */
  heartbeatMs: number
  pollMs: number
  /** The longest stopping the site may take on the new machine once it gives up (Docker's grace, and compose's). */
  stopMs: number
}

export const DEFAULT_TIMINGS: MoveTimings = {
  takeoverMs: 10 * 60_000,
  idleMs: HOST_TRANSFER_IDLE_MS,
  heartbeatMs: 30_000,
  pollMs: 3_000,
  stopMs: 60_000,
}

const set = new Map<string, MoveTimings>()

export function timingsOf(ctx: Context): MoveTimings {
  return set.get(ctx.state.root) ?? DEFAULT_TIMINGS
}

/** Tests shorten the waits. */
export function setTimings(ctx: Context, timings: MoveTimings): void {
  set.set(ctx.state.root, timings)
}

/**
 * The old machine's deadline, from when it sent the release: the new machine's own, plus the longest the release can
 * take to arrive and still be opened (its lifetime, and the clock skew an envelope is allowed), plus the time the new
 * machine may take to stop the site.
 */
export function releaseDeadline(sentAt: number, t: MoveTimings): number {
  return sentAt + t.takeoverMs + STEP_LIFETIME_MS + HOST_ENVELOPE_CLOCK_SKEW_MS + t.stopMs
}

/** Room left at each end of the takeover for a step to cross hq. */
export function marginOf(t: MoveTimings): number {
  return Math.min(30_000, Math.floor(t.takeoverMs / 8))
}

/**
 * The old machine commits only to a `tookOver` that came well before the new machine could give up, so the commit
 * reaches it in time; a later one is answered by starting the site here again, once the new machine has given up.
 */
export function commitBy(sentAt: number, t: MoveTimings): number {
  return sentAt + t.takeoverMs - marginOf(t)
}

/** The new machine's two deadlines, from when the release reached it: the site answers hq, then the commit arrives. */
export function takeoverDeadlines(receivedAt: number, t: MoveTimings): { answerBy: number; commitBy: number } {
  return { answerBy: receivedAt + t.takeoverMs - 2 * marginOf(t), commitBy: receivedAt + t.takeoverMs }
}
