/**
 * The response scheduler (adaptive voice spec, Orchestration §3): on READY, what the person said goes to hq as a
 * spoken message (`orchestration.send`). If the person speaks again after it was sent but before any of the reply is
 * heard, the turn ended too early: the next message is sent with `append`, and hq cancels the pending reply and
 * answers the whole of it (the socket's `continue`). A premature reply is never heard.
 *
 * The words are what the person is saying now (`stt.utterance`), once STT has heard them to the end of their speech:
 * its words arrive late, later still after a connection is replaced, and a message sent at READY with the last
 * words still to come would leave them out. So READY waits until the words reach the moment the person's voice
 * ended (within `inbound.readyHeardMs`) and STT has finished the turn, or for STT's lag and
 * `inbound.catchUpGraceMs` more, whichever comes first. Silence detection can miss a soft last word, and STT's last
 * word can still be part of one ("do" for "dokie"), so a turn STT has not finished is asked to finish
 * (`stt.endTurn`), and the message goes with its final words.
 * Words over the reply are barge-in's, and an invitation to a raised hand is the hand-raise's: neither is sent.
 *
 * A turn the pause cap ended while the turn model still heard the person mid-thought goes marked `trailedOff`, so
 * the lead can ask them to go on rather than answer half a thought (Orchestration §5). A stop word said alone, just
 * after it stopped the reply, is no message: an encouragement phrase answers it, and it joins what the
 * person says next. An encouragement response, only asking the person to go on, leaves their message open: what they
 * say next joins it, as if no reply had been heard.
 *
 * Words are never left unsent. Silence detection can miss the person's voice (taken for the filler phrase's echo),
 * and then no pause is timed and no READY comes: words shown while the person is not heard speaking, unchanged for
 * `pause.capMs`, are sent as the pause cap would have sent them.
 */
import type { FloorState, VoiceEventInput } from '../events'
import type { Component } from '../runtime/types'
import type { VoiceSettings } from '../settings'
import { trailedOff } from '../semantics/rule'
import { invites, isOnly } from './words'

type State = {
  floor: FloorState
  /** What the person is saying, not yet sent. */
  text: string
  /** A message was sent and none of its reply has been heard yet. */
  pending: boolean
  /** The person spoke again while it was pending: the next message joins it. */
  joining: boolean
  hand: boolean
  /** When the person's voice last ended, the end of the last word STT has heard, and STT's lag. */
  voiceEnd: number
  heardUntil: number
  lagMs: number
  /** READY came before STT had heard to the end of the speech: since when it waits. */
  holding: number | null
  /** STT is showing a turn it has not finished. */
  unfinished: boolean
  /** When `text` last changed. */
  textAt: number
  /** The turn READY ended was ended by the pause cap with the person still heard mid-thought. */
  trailed: boolean
  /** A stop word stopped the reply, and nothing has been sent since. */
  stoppedByWord: boolean
  /** The reply to the message pending is an encouragement response. */
  encouraging: string | null
}

const SPEAKING: ReadonlySet<FloorState> = new Set(['agent-speaking', 'ducked'])

const caughtUp = (s: State, settings: VoiceSettings) =>
  !s.unfinished && s.heardUntil >= s.voiceEnd - settings.inbound.readyHeardMs

function send(state: State, t: number, settings: VoiceSettings): { state: State; emit: VoiceEventInput[] } {
  const text = state.text.trim()
  const s = { ...state, holding: null, unfinished: false }
  if (!text || SPEAKING.has(state.floor)) return { state: s, emit: [] }
  if (state.hand && invites(text, settings.handRaise.invitations)) return { state: { ...s, text: '' }, emit: [] }
  if (state.stoppedByWord && isOnly(text, settings.bargeIn.stopWords)) return { state: { ...s, text: '' }, emit: [] }
  const trailed = state.trailed ? { trailedOff: true } : {}
  return {
    state: { ...s, text: '', pending: true, joining: false, trailed: false, stoppedByWord: false, encouraging: null },
    emit: [{ kind: 'orchestration.send', text, append: state.pending && state.joining, ...trailed, t }],
  }
}

export const scheduler: Component<State> = {
  name: 'scheduler',
  accepts: ['orchestration.floor', 'stt.utterance', 'stt.words', 'stt.lag', 'semantics.decision', 'acoustic.silence',
    'playback.at', 'reply.spoken', 'reply.sentence', 'orchestration.handRaise', 'orchestration.playback', 'clock.tick'],
  init: () => ({
    floor: 'open', text: '', pending: false, joining: false, hand: false, voiceEnd: -Infinity, heardUntil: -Infinity,
    lagMs: 0, holding: null, unfinished: false, textAt: -Infinity, trailed: false, stoppedByWord: false, encouraging: null,
  }),
  step(state, event, settings) {
    const settled = { ...state, pending: false, joining: false, encouraging: null }
    switch (event.kind) {
      case 'orchestration.floor':
        return { state: { ...state, floor: event.state }, emit: [] }
      case 'stt.words': {
        // STT ending its turn proves nothing: it can end one before the person's last word.
        const end = event.words.reduce((at, w) => Math.max(at, w.endAt), state.heardUntil)
        return { state: { ...state, heardUntil: end, unfinished: !event.committed }, emit: [] }
      }
      case 'stt.lag':
        return { state: { ...state, lagMs: event.lagMs }, emit: [] }
      case 'stt.utterance': {
        // The words that came after `stt.words` caught up are in this text: a message waiting for them goes now.
        // Words shown while the reply is awaited are the person speaking again, though their voice was missed.
        const joining = state.joining || (state.pending && event.text.trim() !== '')
        const s = { ...state, text: event.text, textAt: event.text === state.text ? state.textAt : event.t, joining }
        return s.holding !== null && caughtUp(s, settings) ? send(s, event.t, settings) : { state: s, emit: [] }
      }
      case 'orchestration.handRaise':
        return { state: { ...state, hand: event.state === 'raised' }, emit: [] }
      case 'orchestration.playback':
        return event.action === 'stop' ? { state: { ...state, stoppedByWord: event.by === 'stop-word' }, emit: [] } : { state, emit: [] }
      case 'acoustic.silence':
        if (event.silent) return { state: { ...state, voiceEnd: event.t }, emit: [] }
        // The person goes on: a message waiting for its last words is not finished after all.
        return { state: { ...state, holding: null, joining: state.pending || state.joining, trailed: false }, emit: [] }
      case 'reply.sentence':
        return event.encouragement && state.pending ? { state: { ...state, encouraging: event.replyId }, emit: [] } : { state, emit: [] }
      case 'playback.at':
        return state.pending && event.replyId !== state.encouraging ? { state: settled, emit: [] } : { state, emit: [] }
      case 'reply.spoken':
        return event.sentences === 0 && state.pending ? { state: settled, emit: [] } : { state, emit: [] }
      case 'clock.tick': {
        const since = state.holding
        if (since !== null) {
          return event.t < since + state.lagMs + settings.inbound.catchUpGraceMs ? { state, emit: [] } : send(state, event.t, settings)
        }
        const stranded = state.text.trim() !== '' && state.floor !== 'person-speaking' && event.t - state.textAt >= settings.pause.capMs
        return stranded ? send(state, event.t, settings) : { state, emit: [] }
      }
      case 'semantics.decision': {
        if (event.answer !== 'READY' || SPEAKING.has(state.floor)) return { state, emit: [] }
        const capped = event.by === 'model' && event.silenceMs >= settings.pause.capMs
        const s = { ...state, trailed: capped && trailedOff(settings.pause, event.confidence) }
        if (caughtUp(s, settings)) return send(s, event.t, settings)
        const ask = s.holding === null && s.unfinished
        return {
          state: { ...s, holding: s.holding ?? event.t },
          emit: ask ? [{ kind: 'stt.endTurn', t: event.t }] : [],
        }
      }
      default:
        return { state, emit: [] }
    }
  },
}
