/**
 * The inbound loop's send queue (adaptive voice spec, The real-time runtime): the person's audio between the
 * microphone and the speech connection, as frames, each marked with whether silence detection heard a voice in it.
 *
 * The queue catches up only by leaving out silence, never words: every run of silence in it is cut to the last
 * `prerollMs` before what follows, so speech starts with the moment before it (silence detection marks a voice a
 * little after it begins). Audio goes out at the pace of speech, never in a burst; a backlog, faster.
 */

export type Frame = {
  pcm: Int16Array
  /** When its last sample was captured. */
  t: number
  ms: number
  /** Silence detection heard a voice. */
  speech: boolean
}

export const msOf = (frames: readonly Frame[]): number => frames.reduce((ms, f) => ms + f.ms, 0)

/** Each run of silence cut to its last `prerollMs` (whole frames, at least that much). */
export function leaveOutSilence(frames: readonly Frame[], prerollMs: number): Frame[] {
  const out: Frame[] = []
  let run: Frame[] = []
  const endRun = () => {
    let kept = 0
    let from = run.length
    while (from > 0 && kept < prerollMs) kept += run[--from]!.ms
    out.push(...run.slice(from))
    run = []
  }
  for (const frame of frames) {
    if (frame.speech) { endRun(); out.push(frame) } else run.push(frame)
  }
  endRun()
  return out
}

/** The audio a fresh connection is given: what is held from `from` on (less the preroll), silence left out. */
export function resumeFrom(held: readonly Frame[], from: number, prerollMs: number): Frame[] {
  return leaveOutSilence(held.filter(f => f.t > from - prerollMs), prerollMs)
}

/**
 * Keeps the queue under `capMs`, a backstop far beyond the queue's limit (the connection is replaced long before):
 * silence goes first, then the oldest audio. Returns what was left out of the queue that held speech, in ms.
 */
export function capQueue(frames: Frame[], capMs: number, prerollMs: number): { frames: Frame[]; lostSpeechMs: number } {
  if (msOf(frames) <= capMs) return { frames, lostSpeechMs: 0 }
  const kept = leaveOutSilence(frames, prerollMs)
  let lostSpeechMs = 0
  while (kept.length > 1 && msOf(kept) > capMs) {
    const dropped = kept.shift()!
    if (dropped.speech) lostSpeechMs += dropped.ms
  }
  return { frames: kept, lostSpeechMs }
}

export type Pace = { budgetMs: number; at: number | null }

/** At most this much audio goes out in one go: the pace of speech, with room for a late timer. */
export const MAX_BURST_MS = 64

/**
 * The audio that may go out now: as much as real time has passed since the last send, times `rate` (1, the pace of
 * speech; more, to catch up a backlog).
 */
export function paced(pace: Pace, now: number, rate = 1): Pace {
  const elapsed = (pace.at === null ? MAX_BURST_MS : Math.max(0, now - pace.at)) * rate
  // A larger budget granted on purpose (the moment before speech, sent at once) is kept until spent.
  return { budgetMs: Math.max(pace.budgetMs, Math.min(MAX_BURST_MS * rate, pace.budgetMs + elapsed)), at: now }
}
