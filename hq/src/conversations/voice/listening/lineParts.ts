/**
 * A light model's line cut into parts as its speech streams in (adaptive voice listening, spec §How its words are
 * played): the first part goes once it holds `firstMs` of audio with a voice in it, so playback does not run dry at the
 * start, and each later part as soon as it adds a voice; the quiet after the last voice is held back, so the line ends
 * `keepMs` after its last word — the silence the speech service leaves after a line is never sent, as `withoutTail`
 * does for a whole one. 24 kHz PCM16.
 */

const RATE = 24_000
/** 20 ms windows, as `withoutTail` reads. */
const WINDOW = 480
const LOUD = 0.01

/** Audio the first part holds at least: the next part comes about 0.1–0.4 s later, each worth more than it plays. */
export const LINE_FIRST_PART_MS = 200

const bytesOf = (ms: number) => Math.round((ms / 1000) * RATE) * 2

/** The byte just past the last window with a voice in it, or 0 when none has. */
function loudEnd(audio: Buffer): number {
  let end = 0
  const samples = Math.floor(audio.length / 2)
  for (let i = 0; i + WINDOW <= samples; i += WINDOW) {
    let sum = 0
    for (let j = 0; j < WINDOW; j++) {
      const v = audio.readInt16LE((i + j) * 2)
      sum += v * v
    }
    if (Math.sqrt(sum / WINDOW) / 32768 > LOUD) end = (i + WINDOW) * 2
  }
  return end
}

export function lineParts(firstMs = LINE_FIRST_PART_MS, keepMs = 80) {
  let held = Buffer.alloc(0)
  let sent = false
  return {
    /** A piece of the line's speech: the part to send now, or null while it is held. */
    take(piece: Buffer): Buffer | null {
      held = Buffer.concat([held, piece])
      if (!sent && held.length < bytesOf(firstMs)) return null
      const end = loudEnd(held)
      if (end === 0) return null
      const part = held.subarray(0, end)
      held = held.subarray(end)
      sent = true
      return part
    },
    /** The speech is all here: the last part, up to `keepMs` past the last voice (a line all quiet: all of it). */
    end(): Buffer {
      const voiceEnd = sent ? 0 : loudEnd(held)
      const last = sent || voiceEnd > 0 ? held.subarray(0, Math.min(held.length, voiceEnd + bytesOf(keepMs))) : held
      held = Buffer.alloc(0)
      return last
    },
    /** Whether any part was sent. */
    get sent(): boolean { return sent },
  }
}
