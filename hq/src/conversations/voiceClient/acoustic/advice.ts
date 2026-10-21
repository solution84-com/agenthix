/**
 * The headphones advice (acoustic spec, §5 and §6): suggests headphones when the agent's echo leaks back past the
 * device's echo cancellation (the echo level above `echo.headphonesAbove`), or the room has other voices, wind or
 * bursts of noise, for `advice.afterMs` together. A steady noise is left to the browser's noise suppression. The
 * advice is withdrawn after `advice.clearAfterMs` with neither, and at once when the person's output is headphones.
 */
import type { RoomLabel } from '../events'
import type { Component } from '../runtime/types'
import type { VoiceSettings } from '../settings'

const NOISY: ReadonlySet<RoomLabel> = new Set<RoomLabel>(['other-voices', 'wind', 'intermittent-noise'])

type State = {
  echo: number | null
  room: RoomLabel | null
  headphones: boolean
  /** Since when the reason for the advice has held, or has been absent; null until the first reading. */
  since: number | null
  reason: boolean
  advice: 'headphones' | null
}

const reasonNow = (state: State, settings: VoiceSettings) =>
  !state.headphones && ((state.echo !== null && state.echo > settings.echo.headphonesAbove) || (state.room !== null && NOISY.has(state.room)))

/** Takes a changed reading, restarting the wait when the reason starts or stops. */
function reading(state: State, t: number, settings: VoiceSettings) {
  const reason = reasonNow(state, settings)
  const next = { ...state, reason, since: reason === state.reason && state.since !== null ? state.since : t }
  if (state.headphones && state.advice !== null) {
    return { state: { ...next, advice: null }, emit: [{ kind: 'acoustic.advice' as const, advice: null, t }] }
  }
  return { state: next, emit: [] }
}

export const headphonesAdvice: Component<State> = {
  name: 'headphonesAdvice',
  accepts: ['acoustic.echoLevel', 'acoustic.room', 'acoustic.device', 'clock.tick'],
  init: () => ({ echo: null, room: null, headphones: false, since: null, reason: false, advice: null }),
  step(state, event, settings) {
    switch (event.kind) {
      case 'acoustic.echoLevel': return reading({ ...state, echo: event.level }, event.t, settings)
      case 'acoustic.room': return reading({ ...state, room: event.label }, event.t, settings)
      case 'acoustic.device': return reading({ ...state, headphones: event.output === 'headphones' }, event.t, settings)
      case 'clock.tick': {
        if (state.since === null) return { state, emit: [] }
        const held = event.t - state.since
        if (state.reason && state.advice === null && held >= settings.advice.afterMs) {
          return { state: { ...state, advice: 'headphones' }, emit: [{ kind: 'acoustic.advice', advice: 'headphones', t: event.t }] }
        }
        if (!state.reason && state.advice !== null && held >= settings.advice.clearAfterMs) {
          return { state: { ...state, advice: null }, emit: [{ kind: 'acoustic.advice', advice: null, t: event.t }] }
        }
        return { state, emit: [] }
      }
      default:
        return { state, emit: [] }
    }
  },
}
