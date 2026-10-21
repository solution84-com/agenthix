/**
 * When the audio at a point in the speech service's stream was captured, and when it was sent. The service times
 * its words in ms of the audio sent on one socket; each chunk sent is recorded with when its last sample was
 * captured and when it went out, so a word's time maps back to the clock the rest of the page uses. Silence left out
 * of the stream is no gap in it: the chunks on either side are recorded one after the other.
 */

type Chunk = { offset: number; ms: number; capturedAt: number; sentAt: number }

/** Chunks older than this, in stream time, are forgotten. */
const KEEP_MS = 120_000

export function createStreamClock() {
  let chunks: Chunk[] = []
  let streamMs = 0

  const chunkAt = (at: number) => chunks.find(ch => at < ch.offset + ch.ms) ?? chunks[chunks.length - 1]

  return {
    /** A new socket: its words count from its first audio. */
    reset() { chunks = []; streamMs = 0 },
    /** `sentAt` defaults to `capturedAt`: audio sent as it is captured. */
    sent(ms: number, capturedAt: number, sentAt = capturedAt) {
      chunks.push({ offset: streamMs, ms, capturedAt, sentAt })
      streamMs += ms
      while (chunks.length > 1 && chunks[0]!.offset + chunks[0]!.ms < streamMs - KEEP_MS) chunks.shift()
    },
    capturedAt(at: number): number | null {
      const c = chunkAt(at)
      return c ? c.capturedAt - (c.offset + c.ms - at) : null
    },
    /** When the audio at this point of the stream went out to the service. */
    sentAt(at: number): number | null {
      const c = chunkAt(at)
      return c ? c.sentAt : null
    },
    /** How much audio has been sent on this socket, in ms. */
    length: () => streamMs,
  }
}

export type StreamClock = ReturnType<typeof createStreamClock>
