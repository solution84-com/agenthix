/**
 * Adaptive pacing's listener (spec §When a turn ends → *Adaptive pacing*): it times the person's breaths, the pauses in
 * their turn after which they went on talking, and says each one with the pace it sets (`orchestration.pace`), which the
 * scheduler and the backchannel apply. A pause in which the agent made any sound but a hum (a reply, a line, a stored
 * phrase) is no breath: the agent answered, so its length says nothing of theirs. Neither is one past the pause cap,
 * which ends a turn whatever was learned. A false finish is a breath: no sound came before they went on.
 *
 * It runs with the light model listening (the flag `voiceListener` and Adaptive voice on). What it learns lives in this
 * runtime's memory, and the page's (`./memory`) while the conversation is open; it is never stored or sent.
 */
import type { FloorState } from '../events'
import type { Component } from '../runtime/types'
import type { VoiceSettings } from '../settings'
import { learnedOf, withBreath } from './pace'

type State = { floor: FloorState; pausedAt: number | null; spoiled: boolean; breathMs: number[]; heard: number }

const SPEAKING: ReadonlySet<FloorState> = new Set(['agent-speaking', 'ducked'])

const light = (settings: VoiceSettings) => settings.voiceListener && settings.adaptiveVoice

export const pace: Component<State> = {
  name: 'pace',
  accepts: ['acoustic.silence', 'orchestration.floor', 'playback.at', 'phrase.at', 'orchestration.paceRestore'],
  init: () => ({ floor: 'open', pausedAt: null, spoiled: false, breathMs: [], heard: 0 }),
  step(state, event, settings) {
    if (!light(settings)) return { state, emit: [] }
    switch (event.kind) {
      case 'orchestration.floor':
        return { state: { ...state, floor: event.state, spoiled: state.spoiled || SPEAKING.has(event.state) }, emit: [] }
      case 'playback.at':
        return event.playing ? { state: { ...state, spoiled: true }, emit: [] } : { state, emit: [] }
      case 'phrase.at':
        return event.playing && !event.backchannel ? { state: { ...state, spoiled: true }, emit: [] } : { state, emit: [] }
      case 'orchestration.paceRestore': {
        const breathMs = event.breathMs.slice(-settings.pacing.keep)
        return {
          state: { ...state, breathMs, heard: event.heard },
          emit: [{ kind: 'orchestration.pace', heard: event.heard, breathMs, learned: learnedOf(breathMs, settings.pacing), t: event.t }],
        }
      }
      case 'acoustic.silence': {
        if (event.silent) return { state: { ...state, pausedAt: event.t, spoiled: SPEAKING.has(state.floor) }, emit: [] }
        const gap = state.pausedAt === null ? null : event.t - state.pausedAt
        const s = { ...state, pausedAt: null, spoiled: false }
        if (gap === null || state.spoiled || gap <= 0 || gap > settings.pause.capMs) return { state: s, emit: [] }
        const breathMs = withBreath(state.breathMs, gap, settings.pacing)
        const heard = state.heard + 1
        return {
          state: { ...s, breathMs, heard },
          emit: [{ kind: 'orchestration.pace', heard, breathMs, learned: learnedOf(breathMs, settings.pacing), t: event.t }],
        }
      }
      default:
        return { state, emit: [] }
    }
  },
}
