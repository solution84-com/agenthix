/**
 * The echo check (acoustic spec, §6), our code and no model: how much of what the microphone hears is the agent's
 * own voice leaking back past the device's echo cancellation. While the agent speaks, every `echo.readingMs` it
 * compares the loudness of the microphone, in 16 ms blocks over the last `echo.windowMs`, with the loudness of
 * what playback sent to the speaker, at each delay the speaker and the room could add. The level is the share of
 * the microphone's loudness that the agent's, at the best delay, explains (the squared correlation): about 1 when
 * the microphone hears only the agent, about 0 when it hears only the person or the room, and 0 when it hears
 * next to nothing, since echo too quiet to hear is no echo.
 *
 * Loudness rather than the samples themselves: the room and the device's processing change the waveform, but the
 * rise and fall of the agent's syllables come through.
 */
import type { Component } from '../runtime/types'
import { amplitude } from './levels'

const BLOCK = 256
const BLOCK_MS = 16
/** The delays tried, from a little before what playback reports to half a second after it. */
const DELAYS = { from: -4, to: 30 }

type Block = { t: number; amp: number }

type State = {
  /** What playback sent, by 16 ms block: the key is the block's time divided by 16, rounded. */
  played: Map<number, number>
  heard: Block[]
  lastPlaybackAt: number | null
  nextReadingAt: number | null
}

const blocks = (pcm: Int16Array, t: number): Block[] =>
  Array.from({ length: Math.floor(pcm.length / BLOCK) }, (_, i) =>
    ({ t: t + i * BLOCK_MS, amp: amplitude(pcm, i * BLOCK, (i + 1) * BLOCK) }))

function correlation(x: readonly number[], y: readonly number[]): number | null {
  const n = x.length
  let mx = 0, my = 0
  for (let i = 0; i < n; i++) { mx += x[i]!; my += y[i]! }
  mx /= n; my /= n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx, dy = y[i]! - my
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy
  }
  if (sxx === 0 || syy === 0) return null
  return sxy / Math.sqrt(sxx * syy)
}

function level(state: State, silentDb: number): number {
  const power = state.heard.reduce((sum, b) => sum + b.amp * b.amp, 0) / Math.max(1, state.heard.length)
  if (power === 0 || 10 * Math.log10(power) < silentDb) return 0
  const mic = state.heard.map(b => b.amp)
  let best = 0
  for (let d = DELAYS.from; d <= DELAYS.to; d++) {
    const agent = state.heard.map(b => state.played.get(Math.round(b.t / BLOCK_MS) - d) ?? 0)
    const r = correlation(mic, agent)
    if (r !== null && r > 0) best = Math.max(best, r * r)
  }
  return best
}

export const echoCheck: Component<State> = {
  name: 'echoCheck',
  accepts: ['audio.frame', 'playback.frame'],
  init: () => ({ played: new Map(), heard: [], lastPlaybackAt: null, nextReadingAt: null }),
  step(state, event, settings) {
    const { windowMs, readingMs, silentDb } = settings.echo
    if (event.kind === 'playback.frame') {
      const played = new Map(state.played)
      for (const b of blocks(event.pcm, event.t)) played.set(Math.round(b.t / BLOCK_MS), b.amp)
      const oldest = Math.round((event.t - windowMs - (DELAYS.to + 1) * BLOCK_MS) / BLOCK_MS)
      for (const key of played.keys()) if (key < oldest) played.delete(key)
      return { state: { ...state, played, lastPlaybackAt: event.t }, emit: [] }
    }
    if (event.kind !== 'audio.frame') return { state, emit: [] }
    const heard = [...state.heard, ...blocks(event.pcm, event.t)].filter(b => b.t > event.t - windowMs)
    const next: State = { ...state, heard }
    const agentSpeaking = state.lastPlaybackAt !== null && event.t - state.lastPlaybackAt <= settings.gate.agentTailMs
    if (!agentSpeaking) return { state: { ...next, nextReadingAt: null }, emit: [] }
    const nextReadingAt = state.nextReadingAt ?? event.t + windowMs - BLOCK_MS
    if (event.t < nextReadingAt) return { state: { ...next, nextReadingAt }, emit: [] }
    return {
      state: { ...next, nextReadingAt: nextReadingAt + readingMs },
      emit: [{ kind: 'acoustic.echoLevel', level: level(next, silentDb), t: event.t }],
    }
  },
}
