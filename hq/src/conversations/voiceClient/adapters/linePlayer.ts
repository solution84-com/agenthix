/**
 * The light model's lines (adaptive voice listening, spec §How its words are played), played in the browser: a line
 * plays once its answer allows it (`listen.play`) and its audio (`line`) is here — either may come first; a stored hold
 * phrase's audio comes before its answer. A line made as it is spoken comes in parts (`index`, the last `end`): it
 * starts with its first part and the rest follow into the same playback. One plays at a time, in order, each to its
 * end: once started, nothing cuts it, not the person's voice nor barge-in nor the reply, which waits for it; and it
 * waits, in turn, for a backchannel hum playing (`waits`). It never starts over the person: a line due while they
 * speak is dropped (`mayStart`), as is one whose answer came after they spoke again (`drop`). An acknowledgement plays under a reply's level, since it may be said over
 * the person. hq is told of each line played to its end (`linePlayed`). One decision plays its line exactly once: a
 * line played or skipped is remembered, so its answer or its audio arriving again plays nothing.
 *
 * A line that comes due while a reply is playing is dropped: the light model is never asked while the reply plays, so
 * such a line is a late answer, and a hum after the agent's own words would be heard as a non sequitur. hq is told it
 * was skipped (`linePlayed` with `skipped`), so it is not stored as heard.
 */
import type { VoiceLineEvent } from '@agenthix/core'
import type { Playback } from '../playback'
import { atGain } from './listenerPhrases'
import type { Heard } from './standardAcknowledgement'

/** Lines waiting for their answer, and answers waiting for their line, kept at most: older ones are let go. */
const WAITING = 8
/** A line whose parts stop coming for this long is taken as ended where it got to, so a reply never waits on it for ever. */
export const LINE_STALL_MS = 5_000

/** A line's audio as it comes: whole, or in parts until its `end`. */
type Audio = { text: string; parts: ArrayBuffer[]; ended: boolean; lastAt: number }
type Line = { lineId: string; audio: Audio; quiet: boolean }

export type LinePlayerDeps = {
  createPlayback: () => Playback
  /** The line played to its end. */
  played: (lineId: string) => void
  /** The line was dropped, never to be heard, and why (when the player itself dropped it). */
  skipped?: (lineId: string, why?: string) => void
  quietGainDb: () => number
  /** Whether a line may start now: null when it may, else why not (a reply playing, the person speaking). */
  mayStart?: () => string | null
  /** A line waits, neither started nor skipped, while this holds: a backchannel hum playing. */
  waits?: () => boolean
  now?: () => number
}

export function bufferOf(audio: unknown): ArrayBuffer {
  if (audio instanceof ArrayBuffer) return audio
  const view = audio as { buffer: ArrayBuffer; byteOffset: number; byteLength: number }
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
}

const bounded = <V>(map: Map<string, V>, most = WAITING) => { while (map.size > most) map.delete(map.keys().next().value!) }
/** The lines already played or skipped, remembered: one decision plays its line once, whatever arrives again. */
const DONE = 64

export function createLinePlayer(deps: LinePlayerDeps) {
  const now = deps.now ?? (() => Date.now())
  const arrived = new Map<string, Audio>()
  const allowed = new Map<string, { quiet: boolean }>()
  let queue: Line[] = []
  let playing: { playback: Playback; line: Line; fed: number } | null = null
  const done = new Map<string, true>()
  const finished = (lineId: string) => { done.set(lineId, true); bounded(done, DONE) }

  /** The parts of the line playing not yet in its playback go in; once it has them all, it may end. */
  const feed = () => {
    if (!playing) return
    const { playback, line } = playing
    for (; playing.fed < line.audio.parts.length; playing.fed++) {
      const part = line.audio.parts[playing.fed]!
      playback.enqueue(0, line.quiet ? atGain(part, deps.quietGainDb()) : part.slice(0))
    }
    if (line.audio.ended) playback.finish()
  }
  const start = () => {
    while (!playing && queue.length && !deps.waits?.()) {
      const line = queue.shift()!
      const why = deps.mayStart?.() ?? null
      if (why !== null) { finished(line.lineId); deps.skipped?.(line.lineId, why); continue }
      playing = { playback: deps.createPlayback(), line, fed: 0 }
      feed()
    }
  }
  const ready = (line: Line) => { queue.push(line); start() }
  const known = (lineId: string): Audio | undefined =>
    playing?.line.lineId === lineId ? playing.line.audio : queue.find(l => l.lineId === lineId)?.audio ?? arrived.get(lineId)

  return {
    /** A line's audio from hq: the whole of it, or its next part. */
    add(e: Pick<VoiceLineEvent, 'lineId' | 'text' | 'audio' | 'index' | 'end'>) {
      if (done.has(e.lineId)) return
      const audio = bufferOf(e.audio)
      const whole = e.index === undefined
      const ends = whole || e.end === true
      const had = known(e.lineId)
      if (had) {
        // A part already here (sent again) is not played twice.
        if (!whole && e.index! < had.parts.length) return
        if (audio.byteLength > 0) had.parts.push(audio)
        had.ended ||= ends
        had.lastAt = now()
        if (playing?.line.audio === had) feed()
        return
      }
      const line: Audio = { text: e.text, parts: audio.byteLength > 0 ? [audio] : [], ended: ends, lastAt: now() }
      const permit = allowed.get(e.lineId)
      if (permit) { allowed.delete(e.lineId); ready({ lineId: e.lineId, audio: line, quiet: permit.quiet }); return }
      arrived.set(e.lineId, line)
      bounded(arrived)
    },
    /** Its answer allows the line. */
    allow(lineId: string, quiet: boolean) {
      if (done.has(lineId) || playing?.line.lineId === lineId || queue.some(l => l.lineId === lineId)) return
      const audio = arrived.get(lineId)
      if (audio) { arrived.delete(lineId); ready({ lineId, audio, quiet }); return }
      allowed.set(lineId, { quiet })
      bounded(allowed)
    },
    /** The listening runtime dropped the line as its answer came: it is never heard, whenever its audio comes. */
    drop(lineId: string) {
      if (done.has(lineId) || playing?.line.lineId === lineId) return
      allowed.delete(lineId)
      arrived.delete(lineId)
      queue = queue.filter(l => l.lineId !== lineId)
      finished(lineId)
      deps.skipped?.(lineId)
    },
    busy: () => playing !== null,
    /** What of the line playing was heard since the last tick; at its end, hq is told and the next one starts. */
    tick(): (Heard & { lineId: string }) | null {
      if (!playing) start()
      if (!playing) return null
      const { playback, line } = playing
      if (!line.audio.ended && now() - line.audio.lastAt >= LINE_STALL_MS) {
        line.audio.ended = true
        playback.finish()
      }
      const audio = playback.heardAudio?.() ?? new Int16Array(0)
      const text = line.audio.text
      if (!playback.idle()) return { text, lineId: line.lineId, playing: true, audio }
      playback.close()
      playing = null
      finished(line.lineId)
      deps.played(line.lineId)
      start()
      return { text, lineId: line.lineId, playing: false, audio }
    },
    /** Voice ended: everything stops and is forgotten; the words of the line it cut, or null. */
    clear(): string | null {
      const text = playing?.line.audio.text ?? null
      playing?.playback.close()
      playing = null
      queue = []
      arrived.clear()
      allowed.clear()
      done.clear()
      return text
    },
  }
}

export type LinePlayer = ReturnType<typeof createLinePlayer>
