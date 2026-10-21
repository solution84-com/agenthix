/**
 * Silence detection (acoustic spec, §2): Silero VAD's confidence for each 32 ms frame turned into silence: no and
 * silence: yes by the detector settings in use. A frame at or above the on threshold is voice, one below the off
 * threshold is not, and one in between changes nothing, so voice does not flicker off mid-word. Voice must last
 * the minimum voice before silence: no, and silence the minimum silence before silence: yes.
 *
 * The confidence alone cannot tell the person from the agent's echo or another voice in the room, so a frame
 * must also pass the level gates in `voiceGate.ts` to be voice; one that does not counts as no voice.
 *
 * Each `acoustic.silence` carries, as `t`, the moment the voice or the silence began, not the moment it was
 * confirmed: Semantics times the pause from there.
 */
import type { DetectorSettingsInUse } from '../events'
import type { Component } from '../runtime/types'
import { gateFrame, gatePasses, gatePlayed, gateRoom, initialGate, type GateState } from './voiceGate'

export const FRAME_MS = 32

type State = {
  detector: DetectorSettingsInUse
  silent: boolean
  /** Where the run that may change `silent` began; null while there is none. */
  runSince: number | null
  gate: GateState
}

export const silenceDetector: Component<State> = {
  name: 'silenceDetector',
  accepts: ['acoustic.vadScore', 'acoustic.detector', 'audio.frame', 'playback.frame', 'acoustic.room', 'stt.muted'],
  init: settings => ({ detector: { ...settings.detector }, silent: true, runSince: null, gate: initialGate() }),
  step(state, event, settings) {
    switch (event.kind) {
      case 'acoustic.detector': return { state: { ...state, detector: event.detector }, emit: [] }
      case 'audio.frame': return { state: { ...state, gate: gateFrame(state.gate, event.pcm, event.t, settings.gate) }, emit: [] }
      case 'playback.frame': return { state: { ...state, gate: gatePlayed(state.gate, event.pcm, event.t, settings.gate) }, emit: [] }
      case 'acoustic.room': return { state: { ...state, gate: gateRoom(state.gate, event.label === 'other-voices') }, emit: [] }
      // Muted, the person is no longer heard: a voice in progress has ended.
      case 'stt.muted':
        return event.muted && !state.silent
          ? { state: { ...state, silent: true, runSince: null }, emit: [{ kind: 'acoustic.silence', silent: true, t: event.t }] }
          : { state, emit: [] }
      case 'acoustic.vadScore': break
      default: return { state, emit: [] }
    }
    const { onThreshold, offThreshold, minVoiceMs, minSilenceMs } = state.detector
    const loudEnough = gatePasses(state.gate, event.t)
    const voice = event.confidence >= onThreshold && loudEnough
    const none = event.confidence < offThreshold || !loudEnough
    // A frame of the kind that would end the current state starts or continues a run; the opposite kind ends it.
    const towards = state.silent ? voice : none
    const away = state.silent ? none : voice
    if (away) return { state: { ...state, runSince: null }, emit: [] }
    if (!towards && state.runSince === null) return { state, emit: [] }
    const runSince = state.runSince ?? event.t
    const lasted = event.t - runSince + FRAME_MS
    if (lasted < (state.silent ? minVoiceMs : minSilenceMs)) return { state: { ...state, runSince }, emit: [] }
    return {
      state: { ...state, silent: !state.silent, runSince: null },
      emit: [{ kind: 'acoustic.silence', silent: !state.silent, t: runSince }],
    }
  },
}
