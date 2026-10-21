/**
 * The pause timer and the decision rule (semantics spec, §1, §3, §4) as one component. A pause is silence after the
 * person has spoken. At `scoreAtMs` of it the turn model is asked once (`semantics.ask`); that one score is then
 * applied at each mark. No score within `modelTimeoutMs`, or a failure, and silence alone decides: READY at `capMs`.
 */
import { answerAt } from './rule'
import type { TurnAnswer, VoiceEventInput } from '../events'
import type { Component } from '../runtime/types'
import type { VoiceSettings } from '../settings'

export type PauseState = {
  /** The person has spoken since the last decision: a pause can begin. */
  spoke: boolean
  silentSince: number | null
  askedAt: number | null
  score: number | null
  failed: boolean
  fallback: boolean
  /** Index in `marksMs` of the next mark to apply. */
  mark: number
  /** The pause has been answered READY. */
  done: boolean
}

const IDLE: PauseState = { spoke: false, silentSince: null, askedAt: null, score: null, failed: false, fallback: false, mark: 0, done: false }

function advance(s: PauseState, t: number, pause: VoiceSettings['pause']): { state: PauseState; emit: VoiceEventInput[] } {
  if (s.silentSince === null || s.done) return { state: s, emit: [] }
  const emit: VoiceEventInput[] = []
  const silenceMs = t - s.silentSince
  let state = s
  const decide = (answer: TurnAnswer, atMs: number, by: 'model' | 'fallback') =>
    emit.push({ kind: 'semantics.decision', answer, confidence: by === 'model' ? state.score : null, silenceMs: atMs, by, t })

  if (state.askedAt === null && silenceMs >= pause.scoreAtMs) {
    state = { ...state, askedAt: t }
    emit.push({ kind: 'semantics.ask', silenceMs: pause.scoreAtMs, t })
  }
  const timedOut = state.score === null && state.askedAt !== null && t - state.askedAt >= pause.modelTimeoutMs
  if (!state.fallback && (timedOut || state.failed || (state.score === null && silenceMs >= pause.capMs))) {
    state = { ...state, fallback: true }
    decide('UNCERTAIN', silenceMs, 'fallback')
  }
  if (state.fallback) {
    if (silenceMs >= pause.capMs) {
      decide('READY', pause.capMs, 'fallback')
      state = { ...state, done: true }
    }
    return { state, emit }
  }
  while (state.score !== null && state.mark < pause.marksMs.length && silenceMs >= pause.marksMs[state.mark]!) {
    const mark = pause.marksMs[state.mark]!
    const answer = answerAt(pause, mark, state.score)
    decide(answer, mark, 'model')
    state = { ...state, mark: state.mark + 1, done: answer === 'READY' }
    if (state.done) return { state, emit }
  }
  if (state.score !== null && silenceMs >= pause.capMs) {
    decide('READY', pause.capMs, 'model')
    state = { ...state, done: true }
  }
  return { state, emit }
}

export const pauseTimer: Component<PauseState> = {
  name: 'pauseTimer',
  accepts: ['acoustic.silence', 'clock.tick', 'semantics.score', 'semantics.failed'],
  init: () => IDLE,
  step(state, event, settings) {
    switch (event.kind) {
      case 'acoustic.silence':
        if (!event.silent) return { state: { ...IDLE, spoke: true }, emit: [] }
        if (!state.spoke || state.silentSince !== null) return { state, emit: [] }
        return advance({ ...state, silentSince: event.t }, event.t, settings.pause)
      case 'semantics.score':
        // Only the answer to the question asked in this pause counts.
        if (state.askedAt === null || state.score !== null || state.fallback || state.silentSince === null) return { state, emit: [] }
        return advance({ ...state, score: event.score }, event.t, settings.pause)
      case 'semantics.failed':
        if (state.silentSince === null || state.fallback || state.score !== null) return { state, emit: [] }
        return advance({ ...state, failed: true }, event.t, settings.pause)
      case 'clock.tick':
        return advance(state, event.t, settings.pause)
      default:
        return { state, emit: [] }
    }
  },
}
