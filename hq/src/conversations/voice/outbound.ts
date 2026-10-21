/**
 * The outbound buffer (adaptive voice spec, runtime: Outbound loop): where the holder's playback has got to, as
 * hq can know it — each sentence plays when the one before it ends, for as long as its audio lasts — so speech is
 * synthesized at most `sentencesAhead` sentences ahead of what has been heard. A slow speech service then shows as
 * a pause, and a fast one never builds a backlog of audio in the browser.
 */
import { VOICE_SETTINGS } from '../voiceClient/settings'

/** Audio sent to the holder: 24 kHz PCM16, one channel. */
const BYTES_PER_MS = (24_000 * 2) / 1000

export const SENTENCES_AHEAD = VOICE_SETTINGS.outbound.sentencesAhead

export function audioMs(bytes: number): number {
  return bytes / BYTES_PER_MS
}

export class PlaybackTimeline {
  /** When each sentence sent and not yet heard ends, in order. */
  private ends: number[] = []
  /** When the last sentence heard ended. */
  private last = 0

  /** A sentence was sent at `now`: it plays after the ones before it. */
  sent(now: number, durationMs: number): void {
    this.prune(now)
    const start = Math.max(now, this.ends.at(-1) ?? now)
    this.ends.push(start + Math.max(0, durationMs))
  }

  /** Sentences sent that the holder has not yet heard to their end. */
  unheard(now: number): number {
    this.prune(now)
    return this.ends.length
  }

  /** How long until fewer than `ahead` sentences are unheard, so the next may be made: 0 when it may be now. */
  waitMs(now: number, ahead: number): number {
    this.prune(now)
    const over = this.ends.length - Math.max(1, ahead)
    if (over < 0) return 0
    return this.ends[over]! - now
  }

  /** When the last sentence sent ends: the agent is speaking until then. 0 when nothing was sent. */
  speakingUntil(): number {
    return this.ends.at(-1) ?? this.last
  }

  /** The person spoke over it: nothing sent is playing any more. */
  clear(): void {
    this.ends = []
    this.last = 0
  }

  private prune(now: number): void {
    while (this.ends.length > 0 && this.ends[0]! <= now) this.last = this.ends.shift()!
  }
}
