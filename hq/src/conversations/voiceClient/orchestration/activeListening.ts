/**
 * Active listening (adaptive voice spec, Orchestration §5): when the agent shows it is following, and when it
 * encourages the person to go on. The speaker plays what this asks for (`orchestration.phrase`), in the agent's voice.
 *
 * - **An active listening phrase in a long turn's pause.** Once the person has been speaking `afterSpeechMs` in the
 *   message they are speaking, a pause the decision rule answers KEEP_LISTENING (they are mid-thought) gets one,
 *   never closer than `gapMs` to the last; never on UNCERTAIN or READY, where it could be taken for the reply
 *   starting.
 * - **An encouragement phrase after a stop word.** A reply stopped by a stop word, and the person silent `afterMs`
 *   after it: the agent invites them to go on, once. Words of theirs beyond the stop word, the *Stop* button, or a
 *   stop on their own words, and there is none: they are already saying what they stopped it for.
 */
import type { FloorState, VoiceEventInput } from '../events'
import type { Component } from '../runtime/types'
import { isOnly } from './words'

type State = {
  floor: FloorState
  silent: boolean
  /** When the person began speaking in the message they are speaking; null before they have. */
  speechSince: number | null
  /** When their voice last ended. */
  pausedAt: number
  lastListenedAt: number
  /** This pause has had its active listening phrase, or its chance of one. */
  listened: boolean
  /** After a stop word: waiting for the person to fall silent, or the encouragement phrase due at a time. */
  encourage: 'off' | 'silence' | number
}

export const activeListening: Component<State> = {
  name: 'activeListening',
  accepts: ['acoustic.silence', 'orchestration.floor', 'orchestration.send', 'orchestration.playback', 'semantics.decision',
    'stt.utterance', 'clock.tick'],
  init: () => ({ floor: 'open', silent: true, speechSince: null, pausedAt: -Infinity, lastListenedAt: -Infinity, listened: false, encourage: 'off' }),
  step(state, event, settings) {
    const afterMs = settings.encouragement.afterMs
    const phrase = (kind: 'active-listening' | 'encouragement'): VoiceEventInput => ({ kind: 'orchestration.phrase', phrase: kind, t: event.t })
    switch (event.kind) {
      case 'acoustic.silence': {
        if (event.silent) {
          const encourage = state.encourage === 'silence' ? event.t + afterMs : state.encourage
          return { state: { ...state, silent: true, pausedAt: event.t, encourage }, emit: [] }
        }
        // They speak again: the pause's phrase is spent, and encouragement waiting for their silence is not wanted.
        const speechSince = state.speechSince ?? event.t
        const encourage = state.encourage === 'silence' ? 'silence' : 'off'
        return { state: { ...state, silent: false, speechSince, listened: false, encourage }, emit: [] }
      }
      case 'orchestration.floor':
        return { state: { ...state, floor: event.state, encourage: event.state === 'agent-speaking' ? 'off' : state.encourage }, emit: [] }
      case 'orchestration.send':
        return { state: { ...state, speechSince: null, encourage: 'off' }, emit: [] }
      case 'orchestration.playback': {
        if (event.action !== 'stop') return { state, emit: [] }
        if (event.by !== 'stop-word') return { state: { ...state, encourage: 'off' }, emit: [] }
        return { state: { ...state, encourage: state.silent ? event.t + afterMs : 'silence' }, emit: [] }
      }
      case 'stt.utterance': {
        const more = event.text.trim() !== '' && !isOnly(event.text, settings.bargeIn.stopWords)
        return more && state.encourage !== 'off' ? { state: { ...state, encourage: 'off' }, emit: [] } : { state, emit: [] }
      }
      case 'semantics.decision': {
        const s = settings.activeListening
        const long = state.speechSince !== null && state.pausedAt - state.speechSince >= s.afterSpeechMs
        const may = event.answer === 'KEEP_LISTENING' && state.floor === 'person-pausing' && long && !state.listened
          && event.t - state.lastListenedAt >= s.gapMs
        if (!may) return { state, emit: [] }
        return { state: { ...state, listened: true, lastListenedAt: event.t }, emit: [phrase('active-listening')] }
      }
      case 'clock.tick':
        if (typeof state.encourage !== 'number' || event.t < state.encourage) return { state, emit: [] }
        return { state: { ...state, encourage: 'off' }, emit: state.silent ? [phrase('encouragement')] : [] }
      default:
        return { state, emit: [] }
    }
  },
}
