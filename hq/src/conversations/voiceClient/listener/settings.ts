/**
 * The browser's side of adaptive voice listening (spec §The light model → *When it is asked*): when the light model is
 * asked, as settings the voice playground can change. hq's own limits (the call's time limit, the "not yet" bound, the
 * word caps) are hq's (`conversations/voice/listener`).
 */
export type ListenerTiming = {
  /**
   * The wait before the next check, in seconds, which hq's schedule sends: its value when hq gives none, and the range
   * a given one is held to.
   */
  nextCheck: { defaultSecs: number; minSecs: number; maxSecs: number }
  /**
   * A *sounds finished* call with no answer at all this long (hq unreachable, not merely slow: hq's own fallback answers
   * within seconds): its words go as a plain spoken message, and the rest of this voice is plain voice.
   */
  noAnswerMs: number
  /** `hum` and `acknowledge` play this far under a reply's level, since they may be said over the person. */
  quietGainDb: number
  /**
   * The quiet the sound model's READY needs before it ends the turn (the scheduler waits for it): `finishWaitMs` at
   * first, `finishWaitStepMs` more for each false finish this turn, at most `finishWaitMostMs`, and never past the pause
   * cap. A false finish: the person spoke again within `falseFinishMs` of the turn being sent. Counted afresh each turn.
   */
  finishWaitMs: number
  finishWaitStepMs: number
  finishWaitMostMs: number
  falseFinishMs: number
}

/** The quiet READY waits for now, after `count` false finishes this turn: never past the pause cap. */
export function finishWait(timing: ListenerTiming, count: number, capMs: number): number {
  const stretched = Math.min(timing.finishWaitMostMs, timing.finishWaitMs + count * timing.finishWaitStepMs)
  return Math.min(capMs, Math.max(timing.finishWaitMs, stretched))
}

export const LISTENER_TIMING: ListenerTiming = {
  nextCheck: { defaultSecs: 2, minSecs: 1, maxSecs: 30 },
  noAnswerMs: 15_000,
  quietGainDb: -6,
  finishWaitMs: 500,
  finishWaitStepMs: 500,
  finishWaitMostMs: 2_000,
  falseFinishMs: 1_000,
}
