/**
 * The Adapter (acoustic spec, §5): chooses the detector settings for the audio that follows from the room's label,
 * the echo level and whether the agent is speaking, and publishes `acoustic.detector` whenever they change.
 *
 * - While the agent speaks, strict settings (`detectorWhileAgentSpeaks`) unless the echo check has shown this
 *   device's echo cancellation leaves less than `echo.strictAbove`.
 * - Intermittent noise and wind: a longer minimum voice, so a burst of noise does not count as voice.
 * - Other voices: a longer minimum silence, so the gaps silence detection's room gate leaves in the background
 *   voice do not split the person's words (with the gate, see `voiceGate.ts`).
 *
 * Each change made for the room is a trial: the short bursts the detector took for voice are counted for
 * `adapter.trialMs` before and after it, and if they did not fall the change is put back, and not tried again until the
 * room has been something else. A short burst is the best sign of a false start the Adapter has; it counts the
 * person's very short answers too, so it is a rough one.
 */
import type { DetectorSettingsInUse, RoomLabel } from '../events'
import type { Component } from '../runtime/types'
import type { VoiceSettings } from '../settings'

type State = {
  agentSpeaking: boolean
  echo: number | null
  room: RoomLabel | null
  /** A room whose change was tried and put back; cleared when the room changes. */
  rejected: RoomLabel | null
  trial: { room: RoomLabel; startedAt: number; burstsBefore: number } | null
  voiceSince: number | null
  bursts: number[]
  inUse: DetectorSettingsInUse
}

function forRoom(base: DetectorSettingsInUse, room: RoomLabel | null, a: VoiceSettings['adapter']): DetectorSettingsInUse {
  switch (room) {
    case 'intermittent-noise':
    case 'wind':
      return { ...base, minVoiceMs: base.minVoiceMs + a.longerMinVoiceMs }
    case 'other-voices':
      return { ...base, minSilenceMs: Math.max(base.minSilenceMs, a.otherVoicesMinSilenceMs) }
    default:
      return base
  }
}

const same = (a: DetectorSettingsInUse, b: DetectorSettingsInUse) =>
  a.onThreshold === b.onThreshold && a.offThreshold === b.offThreshold && a.minVoiceMs === b.minVoiceMs && a.minSilenceMs === b.minSilenceMs

const strictNow = (state: State, settings: VoiceSettings) =>
  state.agentSpeaking && (state.echo === null || state.echo > settings.echo.strictAbove)

function wanted(state: State, settings: VoiceSettings): { detector: DetectorSettingsInUse; reason: string } {
  const room = state.room !== state.rejected ? state.room : null
  let detector = forRoom(settings.detector, room, settings.adapter)
  const reasons: string[] = []
  if (room && !same(detector, settings.detector)) reasons.push(`the room: ${room}`)
  if (strictNow(state, settings)) {
    const strict = settings.detectorWhileAgentSpeaks
    detector = { ...detector, onThreshold: Math.max(detector.onThreshold, strict.onThreshold), minVoiceMs: Math.max(detector.minVoiceMs, strict.minVoiceMs) }
    reasons.push(state.echo === null ? 'the agent is speaking; its echo is not measured yet' : `the agent is speaking; its echo is ${state.echo.toFixed(2)}`)
  }
  return { detector, reason: reasons.join('; ') || 'the starting settings' }
}

const burstsIn = (bursts: readonly number[], from: number, to: number) => bursts.filter(t => t >= from && t < to).length

/** Publishes the settings `next` wants, if they differ from those in use. */
function settle(next: State, settings: VoiceSettings, t: number, why?: string) {
  const { detector, reason } = wanted(next, settings)
  if (same(detector, next.inUse)) return { state: next, emit: [] }
  return {
    state: { ...next, inUse: detector },
    emit: [{ kind: 'acoustic.detector' as const, detector, reason: why ? `${reason}; ${why}` : reason, t }],
  }
}

export const detectorAdapter: Component<State> = {
  name: 'detectorAdapter',
  accepts: ['acoustic.echoLevel', 'acoustic.room', 'acoustic.silence', 'playback.at', 'clock.tick'],
  init: settings => ({
    agentSpeaking: false, echo: null, room: null, rejected: null, trial: null, voiceSince: null, bursts: [],
    inUse: { ...settings.detector },
  }),
  step(state, event, settings) {
    switch (event.kind) {
      case 'playback.at':
        return settle({ ...state, agentSpeaking: event.playing && !event.ended }, settings, event.t)
      case 'acoustic.echoLevel':
        return settle({ ...state, echo: event.level }, settings, event.t)
      case 'acoustic.room': {
        if (event.label === state.room) return { state, emit: [] }
        const rejected = event.label === state.rejected ? state.rejected : null
        const tried = !same(forRoom(settings.detector, event.label, settings.adapter), settings.detector) && rejected === null
        const trial = tried
          ? { room: event.label, startedAt: event.t, burstsBefore: burstsIn(state.bursts, event.t - settings.adapter.trialMs, event.t) }
          : null
        return settle({ ...state, room: event.label, rejected, trial }, settings, event.t)
      }
      case 'acoustic.silence': {
        if (!event.silent) return { state: { ...state, voiceSince: event.t }, emit: [] }
        const short = state.voiceSince !== null && !state.agentSpeaking && event.t - state.voiceSince < settings.adapter.burstMs
        const bursts = [...state.bursts.filter(t => t > event.t - 2 * settings.adapter.trialMs), ...(short ? [state.voiceSince!] : [])]
        return { state: { ...state, voiceSince: null, bursts }, emit: [] }
      }
      case 'clock.tick': {
        const { trial } = state
        if (!trial || event.t < trial.startedAt + settings.adapter.trialMs) return { state, emit: [] }
        const after = burstsIn(state.bursts, trial.startedAt, trial.startedAt + settings.adapter.trialMs)
        if (after === 0 || after < trial.burstsBefore) return { state: { ...state, trial: null }, emit: [] }
        return settle({ ...state, trial: null, rejected: trial.room }, settings, event.t,
          `the change for ${trial.room} did not reduce the short bursts (${trial.burstsBefore} before, ${after} after), so it is put back`)
      }
      default:
        return { state, emit: [] }
    }
  },
}
