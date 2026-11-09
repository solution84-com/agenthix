/**
 * The echo filter (`echo.ts`) as a component: it learns what the agent says from the reply's sentences, when each
 * is heard from playback, and a stored phrase as it is heard, and sets the agent's own words apart from every
 * transcript the speech service sends.
 */
import type { TimedWord } from '../events'
import { echoAudible, echoSaid, echoSift, NO_ECHO, type EchoState, type HeardWord } from './echo'
import type { Component } from '../runtime/types'

type State = {
  echo: EchoState
  /** The reply whose sentences are known, and their text by index. */
  replyId: string | null
  sentences: Readonly<Record<number, string>>
  /** The sentence last heard beginning. */
  heardIndex: number | null
  /** The stored phrase (the standard acknowledgement, active listening or encouragement) being heard. */
  holding: string | null
}

const heardWords = (words: TimedWord[]): HeardWord[] => words.map(w => ({ text: w.text, at: w.startAt, endAt: w.endAt }))

export const echoFilter: Component<State> = {
  name: 'echoFilter',
  accepts: ['reply.sentence', 'playback.at', 'phrase.at', 'stt.words'],
  init: () => ({ echo: NO_ECHO, replyId: null, sentences: {}, heardIndex: null, holding: null }),
  step(state, event) {
    switch (event.kind) {
      case 'reply.sentence': {
        const fresh = state.replyId !== event.replyId
        return {
          state: {
            ...state,
            replyId: event.replyId,
            sentences: { ...(fresh ? {} : state.sentences), [event.index]: event.text },
            heardIndex: fresh ? null : state.heardIndex,
          },
          emit: [],
        }
      }
      case 'playback.at': {
        // Playback ended or was stopped: sentences that come after it begin a new hearing, even of the same reply.
        if (!event.playing) return { state: { ...state, replyId: null, sentences: {}, heardIndex: null }, emit: [] }
        let { echo, heardIndex } = state
        const text = state.sentences[event.index]
        if (event.index !== heardIndex && text !== undefined) { heardIndex = event.index; echo = echoSaid(echo, text, event.t) }
        return { state: { ...state, heardIndex, echo: echoAudible(echo, event.t) }, emit: [] }
      }
      case 'phrase.at': {
        if (!event.playing) return { state: { ...state, holding: null }, emit: [] }
        const echo = state.holding === event.text ? state.echo : echoSaid(state.echo, event.text, event.t)
        return { state: { ...state, holding: event.text, echo: echoAudible(echo, event.t) }, emit: [] }
      }
      case 'stt.words': {
        const sifted = echoSift(state.echo, event.text, event.words.length ? heardWords(event.words) : undefined, event.t)
        return {
          state,
          emit: [{
            kind: 'stt.heard', heard: event.text, ...sifted, committed: event.committed, order: event.order,
            timed: event.words, t: event.t,
          }],
        }
      }
      default:
        return { state, emit: [] }
    }
  },
}
