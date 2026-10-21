/** Synthetic audio for Acoustic's tests: seeded noise, low rumble and envelopes, as 16 kHz PCM16. */
import type { VoiceEvent, VoiceEventInput } from '../../events'
import type { Component } from '../../runtime/types'
import { VOICE_SETTINGS, type VoiceSettings } from '../../settings'

export const RATE = 16_000
export const FRAME = 512
export const FRAME_MS = 32

/** A seeded generator, so a test's noise is the same on every run. */
export function seeded(seed = 1): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32 * 2 - 1
  }
}

/** White noise at about `db` dB relative to full scale. */
export function noise(samples: number, db: number, random = seeded()): Int16Array {
  // Uniform noise in [-a, a] has power a² / 3.
  const a = Math.sqrt(3 * 10 ** (db / 10)) * 32767
  return Int16Array.from({ length: samples }, () => Math.round(a * random()))
}

/** A low rumble: a 30 Hz tone whose loudness swells and falls, as wind on a microphone does. */
export function rumble(samples: number, db: number, start = 0): Int16Array {
  const a = Math.sqrt(2 * 10 ** (db / 10)) * 32767
  return Int16Array.from({ length: samples }, (_, i) => {
    const n = start + i
    const swell = 0.1 + 0.9 * Math.abs(Math.sin((2 * Math.PI * 0.7 * n) / RATE))
    return Math.round(a * swell * Math.sin((2 * Math.PI * 30 * n) / RATE))
  })
}

/** Runs one component over events, `seq` added in order, and returns what it emitted. */
export function stepper<S>(component: Component<S>, settings: VoiceSettings = VOICE_SETTINGS) {
  let state = component.init(settings)
  let seq = 0
  const emitted: VoiceEventInput[] = []
  return {
    emitted,
    state: () => state,
    step(event: VoiceEventInput) {
      const result = component.step(state, { ...event, seq: seq++ } as VoiceEvent, settings)
      state = result.state
      emitted.push(...result.emit)
      return result.emit
    },
  }
}
