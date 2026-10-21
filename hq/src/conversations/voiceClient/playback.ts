/**
 * Plays the holder's audio, sentence by sentence, gapless, and says where the person's ear is: which sentence is
 * playing and how far into it. That position is what the reply's text is revealed by, and what an interruption
 * reports as heard. 24 kHz mono PCM16, as hq sends it.
 *
 * Everything goes through one gain control, so barge-in can duck the reply at once and resume it with a ramp, in the
 * page. What has gone to the speaker is handed back at 16 kHz (`heardAudio`), for Acoustic's echo check.
 */
import { createResampler, SPEECH_RATE } from './resample'

const SAMPLE_RATE = 24_000
const LEAD_SECS = 0.1

type SentenceClock = { start: number; end: number }

export type Playhead = {
  /** The latest sentence whose audio has started. */
  index: number
  /** Seconds into it, at most its length. */
  elapsed: number
  /** Its audio has played to the end. */
  ended: boolean
}

export type Playback = {
  enqueue: (index: number, pcm16: ArrayBuffer) => void
  /** Every sentence of the turn has been sent: the last one is whole. */
  finish: () => void
  stop: () => number
  position: () => Playhead | null
  /** Nothing scheduled is still to be heard. */
  idle: () => boolean
  close: () => void
  // Optional so a test's stand-in for playback need not have them; the real one always does.
  /** Lowers everything playing by `db`, over `rampMs`. */
  duck?: (db: number, rampMs: number) => void
  /** Back to full volume, over `rampMs`. */
  resume?: (rampMs: number) => void
  /** What has gone to the speaker since the last call, at 16 kHz, at the volume it played. */
  heardAudio?: () => Int16Array
}

/** A level in decibels below full as a gain. */
export const gainOf = (db: number) => 10 ** (-Math.abs(db) / 20)

type Scheduled = { start: number; samples: Float32Array }

/** `count` samples of the timeline from `from` (s), at `rate`: what is scheduled there, silence where nothing is. */
export function timelineSlice(scheduled: readonly Scheduled[], from: number, count: number, rate: number): Float32Array {
  const out = new Float32Array(Math.max(0, count))
  for (const { start, samples } of scheduled) {
    const offset = Math.round((start - from) * rate)
    const begin = Math.max(0, -offset)
    const end = Math.min(samples.length, count - offset)
    for (let i = begin; i < end; i++) out[i + offset] = samples[i]!
  }
  return out
}

function toPcm16(samples: Float32Array, gain: number): Int16Array {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]! * gain))
    out[i] = v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff)
  }
  return out
}

/** Pure part: where the ear is, from the sentences' clocks and the time now. */
export function playheadAt(clocks: Map<number, SentenceClock>, now: number, whole: (index: number) => boolean): Playhead | null {
  let latest: number | null = null
  for (const [index, c] of clocks) if (c.start <= now && (latest === null || index > latest)) latest = index
  if (latest === null) return null
  const c = clocks.get(latest)!
  return { index: latest, elapsed: Math.min(now, c.end) - c.start, ended: whole(latest) && now >= c.end }
}

/** The last sentence heard to its end at `now`: every one up to it whole and finished; -1 when none. */
export function heardThrough(clocks: Map<number, SentenceClock>, now: number, whole: (index: number) => boolean): number {
  let heard = -1
  const indexes = [...clocks.keys()].sort((a, b) => a - b)
  for (const i of indexes) {
    const c = clocks.get(i)!
    if (!whole(i) || c.end > now) break
    heard = i
  }
  return heard
}

export function createPlayback(makeContext: () => AudioContext = () => new AudioContext({ sampleRate: SAMPLE_RATE })): Playback {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  /** The level everything plays at now, or is ramping to. */
  let level = 1
  let cursor = 0
  let finished = false
  const clocks = new Map<number, SentenceClock>()
  const sources: AudioBufferSourceNode[] = []
  let first = true
  let scheduled: Scheduled[] = []
  let tapAt: number | null = null
  let toSpeech = createResampler(SAMPLE_RATE, SPEECH_RATE)

  const open = (): AudioContext => {
    if (ctx) return ctx
    ctx = makeContext()
    master = ctx.createGain()
    master.gain.setValueAtTime(level, ctx.currentTime)
    master.connect(ctx.destination)
    cursor = ctx.currentTime + LEAD_SECS
    return ctx
  }
  const shut = () => {
    for (const s of sources) { s.onended = null; try { s.stop() } catch { /* already stopped */ } }
    sources.length = 0
    void ctx?.close().catch(() => undefined)
    ctx = null
    master = null
    clocks.clear()
    scheduled = []
    tapAt = null
    level = 1
    toSpeech = createResampler(SAMPLE_RATE, SPEECH_RATE)
  }
  const rampTo = (target: number, rampMs: number) => {
    level = target
    if (!ctx || !master) return
    const now = ctx.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(master.gain.value, now)
    master.gain.linearRampToValueAtTime(target, now + Math.max(rampMs, 1) / 1000)
  }

  // A sentence is whole once a later one has begun or the turn is finished.
  const whole = (index: number) => finished || [...clocks.keys()].some(i => i > index)

  return {
    enqueue(index, pcm16) {
      const audio = open()
      const samples = new Int16Array(pcm16)
      const buffer = audio.createBuffer(1, samples.length, SAMPLE_RATE)
      const channel = buffer.getChannelData(0)
      for (let i = 0; i < samples.length; i++) channel[i] = samples[i]! / (samples[i]! < 0 ? 0x8000 : 0x7fff)
      const start = Math.max(cursor, audio.currentTime + 0.01)
      const gain = audio.createGain()
      if (first) { gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(1, start + 0.03); first = false } else gain.gain.setValueAtTime(1, start)
      const source = audio.createBufferSource()
      source.buffer = buffer
      source.connect(gain)
      gain.connect(master!)
      sources.push(source)
      scheduled.push({ start, samples: channel.slice() })
      source.start(start)
      cursor = start + buffer.duration
      const held = clocks.get(index)
      clocks.set(index, { start: held?.start ?? start, end: cursor })
    },
    finish() { finished = true },
    stop() {
      const now = ctx?.currentTime ?? 0
      const heard = heardThrough(clocks, now, whole)
      shut()
      finished = false
      first = true
      return heard
    },
    position() { return ctx ? playheadAt(clocks, ctx.currentTime, whole) : null },
    idle() { return !ctx || (finished && ctx.currentTime >= cursor) },
    close() { shut() },
    duck(db, rampMs) { rampTo(gainOf(db), rampMs) },
    resume(rampMs) { rampTo(1, rampMs) },
    heardAudio() {
      if (!ctx) return new Int16Array(0)
      const now = ctx.currentTime
      const from = tapAt ?? scheduled[0]?.start ?? now
      const count = Math.floor((now - from) * SAMPLE_RATE)
      if (count <= 0) return new Int16Array(0)
      const slice = timelineSlice(scheduled, from, count, SAMPLE_RATE)
      tapAt = from + count / SAMPLE_RATE
      scheduled = scheduled.filter(s => s.start + s.samples.length / SAMPLE_RATE > tapAt!)
      return toPcm16(toSpeech(slice), level)
    },
  }
}

/** The soft chime of a raised hand: two quiet notes, rising, about half a second in all. */
export function playChime(makeContext: () => AudioContext = () => new AudioContext()): void {
  let ctx: AudioContext
  try { ctx = makeContext() } catch { return }
  const at = ctx.currentTime + 0.02
  const notes: Array<[number, number]> = [[660, 0], [880, 0.16]]
  for (const [hz, offset] of notes) {
    const tone = ctx.createOscillator()
    const gain = ctx.createGain()
    tone.type = 'sine'
    tone.frequency.setValueAtTime(hz, at + offset)
    gain.gain.setValueAtTime(0, at + offset)
    gain.gain.linearRampToValueAtTime(0.08, at + offset + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + offset + 0.3)
    tone.connect(gain)
    gain.connect(ctx.destination)
    tone.start(at + offset)
    tone.stop(at + offset + 0.32)
  }
  setTimeout(() => { void ctx.close().catch(() => undefined) }, 800)
}
