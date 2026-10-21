/**
 * The room monitor (acoustic spec, §4): labels the room's condition from the clean audio's level and brightness
 * and Silero VAD's confidence, read once every `room.windowMs` over that window. The noise labels come from the
 * frames that hold no voice at all; other voices from a voice heard almost all the time, over three windows, at
 * a level further from the microphone than the person usually is. What the microphone hears while the agent
 * speaks is left out, since it holds the agent's own voice. The label changes only when two readings in a row
 * agree on it, so a single loud moment does not change it.
 *
 * The levels are dB relative to full scale, measured on the owner's recordings in a quiet room, with a fan,
 * typing and a talk show; no wind was recorded, so its levels are not measured.
 */
import type { RoomLabel } from '../events'
import type { Component } from '../runtime/types'
import type { VoiceSettings } from '../settings'
import { brightness, percentile, powerDb } from './levels'
import { FRAME_MS } from './silenceDetector'

/** A reading needs at least this share of a window's frames to be the room's own sound. */
const MIN_BACKGROUND_SHARE = 0.25
/** Other voices need this share of three windows' frames scored, and none of them the agent's. */
const MIN_HEARD_SHARE = 0.8

type Heard = { t: number; db: number; brightness: number; confidence: number | null; agent: boolean }

type State = {
  frames: Heard[]
  lastPlaybackAt: number | null
  nextReadingAt: number | null
  label: RoomLabel | null
  candidate: RoomLabel | null
}

function reading(frames: readonly Heard[], t: number, windowMs: number, L: VoiceSettings['room']['levels']): RoomLabel | null {
  const perWindow = windowMs / FRAME_MS
  const long = frames.filter(f => f.t > t - 3 * windowMs && !f.agent && f.confidence !== null)
  if (long.length >= MIN_HEARD_SHARE * 3 * perWindow) {
    const noVoice = long.filter(f => f.confidence! < L.noVoiceBelow).length / long.length
    const voiced = long.filter(f => f.confidence! >= L.voiceFrom).map(f => f.db)
    if (noVoice < L.otherVoicesNoVoiceShare && percentile(voiced, 0.5) < L.otherVoicesBelowDb) return 'other-voices'
  }
  const background = frames.filter(f => f.t > t - windowMs && !f.agent && f.confidence !== null && f.confidence < L.noVoiceBelow)
  if (background.length < MIN_BACKGROUND_SHARE * perWindow) return null
  const levels = background.map(f => f.db)
  const floor = percentile(levels, 0.2)
  const loud = percentile(levels, 0.9)
  const dark = percentile(background.map(f => f.brightness), 0.5)
  if (floor >= L.windFloorDb && dark <= L.windBrightness && loud - floor >= L.burstSpreadDb) return 'wind'
  if (loud >= L.burstDb && loud - floor >= L.burstSpreadDb) return 'intermittent-noise'
  if (floor >= L.steadyFloorDb) return 'steady-noise'
  return 'quiet'
}

export const roomMonitor: Component<State> = {
  name: 'roomMonitor',
  accepts: ['audio.frame', 'acoustic.vadScore', 'playback.frame'],
  init: () => ({ frames: [], lastPlaybackAt: null, nextReadingAt: null, label: null, candidate: null }),
  step(state, event, settings) {
    const windowMs = settings.room.windowMs
    switch (event.kind) {
      case 'playback.frame':
        return { state: { ...state, lastPlaybackAt: event.t }, emit: [] }
      case 'audio.frame': {
        const agent = state.lastPlaybackAt !== null && event.t - state.lastPlaybackAt <= settings.gate.agentTailMs
        const heard: Heard = { t: event.t, db: powerDb(event.pcm), brightness: brightness(event.pcm), confidence: null, agent }
        const frames = [...state.frames.filter(f => f.t > event.t - 3 * windowMs), heard]
        return { state: { ...state, frames, nextReadingAt: state.nextReadingAt ?? event.t + windowMs }, emit: [] }
      }
      case 'acoustic.vadScore': {
        const at = state.frames.findLastIndex(f => f.t === event.t)
        if (at < 0) return { state, emit: [] }
        const frames = state.frames.slice()
        frames[at] = { ...frames[at]!, confidence: event.confidence }
        const next = { ...state, frames }
        if (state.nextReadingAt === null || event.t < state.nextReadingAt) return { state: next, emit: [] }
        next.nextReadingAt = state.nextReadingAt + windowMs * Math.ceil((event.t - state.nextReadingAt + 1) / windowMs)
        const now = reading(frames, event.t, windowMs, settings.room.levels)
        if (now === null || now === state.label) return { state: { ...next, candidate: null }, emit: [] }
        if (state.label !== null && now !== state.candidate) return { state: { ...next, candidate: now }, emit: [] }
        return { state: { ...next, label: now, candidate: null }, emit: [{ kind: 'acoustic.room', label: now, t: event.t }] }
      }
      default:
        return { state, emit: [] }
    }
  },
}
