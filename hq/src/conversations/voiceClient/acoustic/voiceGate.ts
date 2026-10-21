/**
 * The level gates silence detection applies on top of Silero's confidence, because the confidence alone cannot
 * tell the person from another voice: on the owner's recordings Silero scores the agent's own voice leaking back
 * (raw microphone, before the browser's echo cancellation) at 0.99 or more for most frames, and a talk show two
 * metres away as voice 95% of the time. The person, close to the microphone, is louder than either.
 *
 * - **While the agent speaks**, a frame is voice only if it is at least `gate.echoRatio` times as loud as the echo
 *   expected from what playback sent in the last half second: that loudness times the echo path's gain, learned
 *   as the median of the microphone's loudness over playback's while the agent plays. The median holds as long
 *   as the agent's echo is most of what is heard; a person speaking over it is a minority of the frames.
 * - **With other voices in the room**, a frame is voice only if it is at least `gate.roomRatio` times the room's median
 *   loudness over the last six seconds, the agent's audio left out.
 *
 * Pure: the silence detector holds this state and feeds it every frame.
 */
import { amplitude, percentile } from './levels'

import type { VoiceSettings } from '../settings'

type Gate = VoiceSettings['gate']

type Played = { t: number; amp: number }

export type GateState = {
  played: Played[]
  /** The microphone's loudness over playback's, frame by frame, while the agent plays. */
  ratios: Array<{ t: number; ratio: number }>
  /** The last gain learned; kept between replies, since it belongs to the device. */
  gain: number | null
  room: Array<{ t: number; amp: number }>
  roomMedian: number | null
  otherVoices: boolean
  /** Each recent frame's loudness and the bar it must clear, by its `t`, until its confidence arrives. */
  frames: Array<{ t: number; amp: number; bar: number }>
}

export const initialGate = (): GateState =>
  ({ played: [], ratios: [], gain: null, room: [], roomMedian: null, otherVoices: false, frames: [] })

export function gatePlayed(state: GateState, pcm: Int16Array, t: number, gate: Gate): GateState {
  const played = [...state.played.filter(p => p.t > t - gate.echoDelayMs), { t, amp: amplitude(pcm) }]
  return { ...state, played }
}

export function gateRoom(state: GateState, otherVoices: boolean): GateState {
  return { ...state, otherVoices }
}

/** Records a microphone frame, and the loudness it must reach to count as voice. */
export function gateFrame(state: GateState, pcm: Int16Array, t: number, gate: Gate): GateState {
  const amp = amplitude(pcm)
  const recent = state.played.filter(p => p.t > t - gate.echoDelayMs)
  const agent = recent.length > 0 && t - recent[recent.length - 1]!.t <= gate.agentTailMs
  let { ratios, gain, room, roomMedian } = state
  let bar = 0
  if (agent) {
    const loudest = Math.max(...recent.map(p => p.amp))
    if (loudest >= gate.minPlayedAmp) {
      ratios = [...ratios.filter(r => r.t > t - gate.gainWindowMs), { t, ratio: amp / loudest }]
      if (ratios.length >= gate.minGainFrames) gain = percentile(ratios.map(r => r.ratio), 0.5)
    }
    if (gain !== null) bar = gate.echoRatio * gain * loudest
  } else {
    room = [...room.filter(r => r.t > t - gate.roomWindowMs), { t, amp }]
    // The median moves slowly; working it out every eighth frame is enough.
    if (roomMedian === null || room.length % 8 === 0) roomMedian = percentile(room.map(r => r.amp), 0.5)
  }
  if (state.otherVoices && roomMedian !== null) bar = Math.max(bar, gate.roomRatio * roomMedian)
  const frames = [...state.frames.filter(f => f.t > t - 2_000), { t, amp, bar }]
  return { ...state, ratios, gain, room, roomMedian, frames }
}

/** Whether the frame at `t` is loud enough to be the person's voice; a frame not heard is let through. */
export function gatePasses(state: GateState, t: number): boolean {
  const frame = state.frames.findLast(f => f.t === t)
  return !frame || frame.amp >= frame.bar
}
