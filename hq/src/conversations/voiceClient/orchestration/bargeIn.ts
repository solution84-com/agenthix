/**
 * Barge-in (adaptive voice spec, Orchestration §2): the person speaking over the agent takes precedence.
 *
 * On silence: no while the agent speaks, the reply is ducked at once, with no call to hq, and a confirmation window
 * opens, long enough for the words, which arrive about a second late. Then the words decide, after the echo filter
 * has set the agent's own apart: a stop word, or enough of the person's own words, stop the reply; acknowledgements
 * alone, or nothing with silence back, resume it; one unclear word keeps it ducked a little longer, then resumes.
 * Nothing with silence back after more of the person's voice than a short sound (`wordsVoiceMs`, summed over the
 * window) is words still on their way: the reply stays ducked for them, up to `wordsWaitMs` more, then resumes.
 * It never asks aloud.
 *
 * It also makes the person's words theirs (`stt.person`) from what the echo filter kept: at once when the agent is
 * not speaking; over the reply, only once they have stopped it, and only after the stop has been delivered, so
 * whatever acts on them happens with the reply already stopped. Words that were let go are dropped.
 */
import type { FloorState, VoiceEventInput, VoiceEventOf } from '../events'
import type { Component } from '../runtime/types'
import { said, type Said } from './words'

type Phase = 'idle' | 'window' | 'unclear' | 'stopping'

type State = {
  floor: FloorState
  replyId: string | null
  silent: boolean
  phase: Phase
  /** When the window, or its extension, closes. */
  until: number
  /** The person's voice in the window, summed, and since when it is on (null while silent). */
  voiceMs: number
  voiceSince: number | null
  /** The person's words in the window, the latest transcript of each turn the speech service heard. */
  texts: Readonly<Record<string, string>>
  /** Their words as the person's, held until the stop they caused is delivered. */
  held: readonly VoiceEventInput[]
}

const SPEAKING: ReadonlySet<FloorState> = new Set(['agent-speaking', 'ducked'])

const keyOf = (order: number | null) => (order === null ? 'none' : String(order))

const person = (e: VoiceEventOf<'stt.heard'>): VoiceEventInput =>
  ({ kind: 'stt.person', text: e.text, committed: e.committed, order: e.order, timed: e.timed, t: e.t })

const IDLE = { phase: 'idle', until: 0, voiceMs: 0, voiceSince: null, texts: {}, held: [] } as const

export const bargeIn: Component<State> = {
  name: 'bargeIn',
  accepts: ['orchestration.floor', 'reply.sentence', 'playback.at', 'acoustic.silence', 'stt.heard', 'clock.tick',
    'person.tap', 'orchestration.playback'],
  init: () => ({ floor: 'open', replyId: null, silent: true, ...IDLE }),
  step(state, event, settings) {
    const playback = (action: 'duck' | 'stop' | 'resume') =>
      ({ kind: 'orchestration.playback', action, replyId: state.replyId ?? '', t: event.t }) as const
    const stop = (s: State, by: 'stop-word' | 'words' | 'tap') =>
      ({ state: { ...s, phase: 'stopping' as const }, emit: [{ ...playback('stop'), by }] })
    const byOf = (verdict: Said) => (verdict === 'stop' ? 'stop-word' : 'words')
    const resume = (s: State) => ({ state: { ...s, ...IDLE }, emit: [playback('resume')] })
    const heardSoFar = (s: State): Said => said(Object.values(s.texts).join(' '), settings.bargeIn)
    const deciding = state.phase === 'window' || state.phase === 'unclear'

    switch (event.kind) {
      case 'orchestration.floor': {
        if (SPEAKING.has(event.state) || state.phase === 'idle') return { state: { ...state, floor: event.state }, emit: [] }
        // The reply ended on its own while the window was open: what the person said is theirs, unless it was only
        // an acknowledgement or nothing.
        const keep = deciding && !['ack', 'none'].includes(heardSoFar(state))
        return { state: { ...state, floor: event.state, ...IDLE }, emit: keep ? [...state.held] : [] }
      }
      case 'reply.sentence':
        return { state: { ...state, replyId: event.replyId }, emit: [] }
      case 'playback.at':
        return event.playing ? { state: { ...state, replyId: event.replyId }, emit: [] } : { state, emit: [] }
      case 'acoustic.silence': {
        const s = { ...state, silent: event.silent }
        if (deciding) {
          const voice = event.silent
            ? { voiceMs: state.voiceMs + (state.voiceSince === null ? 0 : event.t - state.voiceSince), voiceSince: null }
            : { voiceSince: state.voiceSince ?? event.t }
          return { state: { ...s, ...voice }, emit: [] }
        }
        if (event.silent || state.floor !== 'agent-speaking' || state.phase !== 'idle') return { state: s, emit: [] }
        return {
          state: { ...s, phase: 'window', until: event.t + settings.bargeIn.confirmWindowMs, voiceMs: 0, voiceSince: event.t, texts: {}, held: [] },
          emit: [playback('duck')],
        }
      }
      case 'stt.heard': {
        if (!event.text) return { state, emit: [] }
        if (!SPEAKING.has(state.floor)) return { state, emit: [person(event)] }
        if (state.phase === 'stopping') return { state: { ...state, held: [...state.held, person(event)] }, emit: [] }
        const key = keyOf(event.order)
        const texts = { ...state.texts, [key]: event.text }
        const held = [...state.held.filter(e => e.kind !== 'stt.person' || keyOf(e.order) !== key), person(event)]
        const s = { ...state, texts, held }
        const verdict = heardSoFar(s)
        if (verdict === 'stop' || verdict === 'own') return stop(s, byOf(verdict))
        // Over the reply without the voice detected first, only enough words to stop count.
        return deciding ? { state: s, emit: [] } : { state, emit: [] }
      }
      case 'clock.tick': {
        if (!deciding || event.t < state.until) return { state, emit: [] }
        const verdict = heardSoFar(state)
        if (verdict === 'stop' || verdict === 'own') return stop(state, byOf(verdict))
        if (state.phase === 'unclear' || verdict === 'ack') return resume(state)
        if (verdict === 'none' && state.silent) {
          // Their voice was more than a short sound: its words are on the way, so the reply waits for them.
          if (state.voiceMs <= settings.bargeIn.wordsVoiceMs) return resume(state)
          return { state: { ...state, phase: 'unclear', until: event.t + settings.bargeIn.wordsWaitMs }, emit: [] }
        }
        return { state: { ...state, phase: 'unclear', until: event.t + settings.bargeIn.unclearExtraMs }, emit: [] }
      }
      case 'person.tap':
        return event.target === 'stop' && SPEAKING.has(state.floor) ? stop({ ...state, held: [] }, 'tap') : { state, emit: [] }
      case 'orchestration.playback':
        if (event.action !== 'stop') return { state, emit: [] }
        return { state: { ...state, ...IDLE }, emit: [...state.held] }
      default:
        return { state, emit: [] }
    }
  },
}
