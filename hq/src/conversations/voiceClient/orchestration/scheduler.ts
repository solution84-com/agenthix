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
 * after it stopped the reply, is no message: the listening family invites them to go on, and it joins what the
 * person says next. An encouragement response, only asking the person to go on, leaves their message open: what they
 * say next joins it, as if no reply had been heard. So does a turn hq held (`reply.held`): the agent judged the
 * person had not finished, and no reply comes.
 *
 * With the flag `voiceListener` on there is no trailed-off note, and under the light model (Adaptive voice on too) the
 * send is `orchestration.ready`: the listening runtime sends the words with its *sounds finished* call, or as `continue`.
 *
 * Under the light model, false finishes stretch the wait. A false finish: the person spoke again within
 * `listener.falseFinishMs` of a send. Each one this turn makes READY wait for more quiet before it counts
 * (`finishWait`: 0.5 s, then 1.0 s, 1.5 s, then 2.0 s at most, never past the pause cap). A READY before that much quiet
 * waits for it (`orchestration.finishHeld`, so the backchannel may hum meanwhile), and the person going on cancels it. The count starts afresh with each turn: once a reply is heard, or the
 * light model closes the turn.
 *
 * Adaptive pacing (`../pacing`) sets where that wait starts once the person's breaths are learned (`orchestration.pace`),
 * and then READY waits for it in every turn, as it does in a turn after a false finish; the false finishes step up from
 * it. The listening style `patient` (`listen.style`) adds its extra quiet on top, in every turn, still under the cap.
 *
 * A READY that comes while the reply is ducked (the person spoke over it, and the words that will decide are still on
 * their way) is kept, not dropped: once the reply has stopped and the person's words are shown, it counts as if it came
 * then, through the same finish wait, so the turn goes the wait after they stopped. Their voice again, or the reply
 * resuming, forgets it.
 *
 * Words are never left unsent. Silence detection can miss the person's voice (taken for a stored phrase's echo),
 * and then no pause is timed and no READY comes: words shown while the person is not heard speaking, unchanged for
 * `pause.capMs`, are sent as the pause cap would have sent them.
 */
import type { FloorState, VoiceEventInput, VoiceEventOf } from '../events'
import type { Component } from '../runtime/types'
import type { VoiceSettings } from '../settings'
import { trailedOff } from '../semantics/rule'
import { finishWaitNow, inForce, type Learned } from '../pacing/pace'
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
  /** Under the light model: a READY that came before the quiet it needs, waiting for it. */
  waitingQuiet: boolean
  /** When the words were last sent, while a false finish may still follow it; null after. */
  sentAt: number | null
  /** False finishes this turn. */
  falseFinishes: number
  /** The pace learned from the person's breaths, and whether they asked for patience. */
  learned: Learned | null
  patient: boolean
  /** The sound model's READY heard while the reply was ducked, kept until it has stopped; null with none. */
  keptReady: VoiceEventOf<'semantics.decision'> | null
}

const SPEAKING: ReadonlySet<FloorState> = new Set(['agent-speaking', 'ducked'])

const light = (settings: VoiceSettings) => settings.voiceListener && settings.adaptiveVoice

const waitNow = (s: State, settings: VoiceSettings) => finishWaitNow(settings, inForce(s.learned, settings), s.falseFinishes, s.patient)
const waitOf = (s: State, settings: VoiceSettings) => waitNow(s, settings).waitMs

const caughtUp = (s: State, settings: VoiceSettings) =>
  !s.unfinished && s.heardUntil >= s.voiceEnd - settings.inbound.readyHeardMs

function send(state: State, t: number, settings: VoiceSettings): { state: State; emit: VoiceEventInput[] } {
  const text = state.text.trim()
  const s = { ...state, holding: null, unfinished: false }
  if (!text || SPEAKING.has(state.floor)) return { state: s, emit: [] }
  if (state.hand && invites(text, settings.handRaise.invitations)) return { state: { ...s, text: '' }, emit: [] }
  if (state.stoppedByWord && isOnly(text, settings.bargeIn.stopWords)) return { state: { ...s, text: '' }, emit: [] }
  const trailed = state.trailed ? { trailedOff: true } : {}
  const append = state.pending && state.joining
  // Under the light model, where the words go is the listening runtime's to say (`../listener/trigger`).
  const wait = waitNow(state, settings)
  const stretched = wait.applies
    ? { waitedMs: wait.waitMs, ...(inForce(state.learned, settings) && { paced: true as const }), ...(state.patient && { patient: true as const }) }
    : {}
  const out: VoiceEventInput = light(settings)
    ? { kind: 'orchestration.ready', text, append, ...stretched, t }
    : { kind: 'orchestration.send', text, append, ...trailed, t }
  return {
    state: {
      ...s, text: '', pending: true, joining: false, trailed: false, stoppedByWord: false, encouraging: null, waitingQuiet: false,
      sentAt: light(settings) ? t : null,
    },
    emit: [out],
  }
}

/** READY counts: the message goes once the words have caught up, or waits for them, asking STT to finish its turn. */
function ready(s: State, t: number, settings: VoiceSettings): { state: State; emit: VoiceEventInput[] } {
  const state = { ...s, waitingQuiet: false }
  if (caughtUp(state, settings)) return send(state, t, settings)
  const ask = state.holding === null && state.unfinished
  return { state: { ...state, holding: state.holding ?? t }, emit: ask ? [{ kind: 'stt.endTurn', t }] : [] }
}

/** The sound model's READY counts now: at once, or after the finish wait under the light model. */
function decided(state: State, event: VoiceEventOf<'semantics.decision'>, t: number, settings: VoiceSettings): { state: State; emit: VoiceEventInput[] } {
  const capped = event.by === 'model' && event.silenceMs >= settings.pause.capMs
  const s = { ...state, keptReady: null, trailed: capped && !settings.voiceListener && trailedOff(settings.pause, event.confidence) }
  // Under the light model, after false finishes this turn, with a learned pace or with `patient`, READY waits for
  // the quiet set before it counts (with none of these, it counts as it comes, as before).
  const wait = waitNow(s, settings)
  if (light(settings) && wait.applies && t - s.voiceEnd < wait.waitMs) {
    const { waitMs } = wait
    // Said once a pause: the backchannel may hum in it, since the turn is not sent yet.
    const held: VoiceEventInput[] = state.waitingQuiet ? [] : [{ kind: 'orchestration.finishHeld', waitMs, until: s.voiceEnd + waitMs, t }]
    return { state: { ...s, waitingQuiet: true }, emit: held }
  }
  return ready(s, t, settings)
}

/** Their voice again, under the light model: soon after a send, a false finish, and READY waits longer from now. */
function falseFinish(state: State, t: number, settings: VoiceSettings): { state: State; emit: VoiceEventInput[] } {
  const s = { ...state, sentAt: null }
  if (!light(settings) || state.sentAt === null || t - state.sentAt > settings.listener.falseFinishMs) return { state: s, emit: [] }
  const next = { ...s, falseFinishes: state.falseFinishes + 1 }
  return {
    state: next,
    // A voice's start can be dated a little before the send it came after.
    emit: [{ kind: 'orchestration.falseFinish', afterMs: Math.max(0, t - state.sentAt), count: next.falseFinishes, waitMs: waitOf(next, settings), t }],
  }
}

export const scheduler: Component<State> = {
  name: 'scheduler',
  accepts: ['orchestration.floor', 'stt.utterance', 'stt.words', 'stt.lag', 'semantics.decision', 'acoustic.silence',
    'playback.at', 'reply.spoken', 'reply.held', 'reply.sentence', 'orchestration.handRaise', 'orchestration.playback', 'listen.turn',
    'clock.tick', 'orchestration.pace', 'listen.style'],
  init: () => ({
    floor: 'open', text: '', pending: false, joining: false, hand: false, voiceEnd: -Infinity, heardUntil: -Infinity,
    lagMs: 0, holding: null, unfinished: false, textAt: -Infinity, trailed: false, stoppedByWord: false, encouraging: null,
    waitingQuiet: false, sentAt: null, falseFinishes: 0, learned: null, patient: false, keptReady: null,
  }),
  step(state, event, settings) {
    // The reply is heard: the turn is over, and the next counts its false finishes afresh.
    const settled = { ...state, pending: false, joining: false, encouraging: null, sentAt: null, falseFinishes: 0 }
    switch (event.kind) {
      case 'orchestration.floor':
        // The reply came back: a READY kept over it was about a sound, not a turn.
        return { state: { ...state, floor: event.state, ...(event.state === 'agent-speaking' && { keptReady: null }) }, emit: [] }
      case 'orchestration.pace':
        return { state: { ...state, learned: event.learned }, emit: [] }
      case 'listen.style':
        return { state: { ...state, patient: event.state.patient }, emit: [] }
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
        // The person goes on: a message waiting for its last words, or for its quiet, is not finished after all.
        return falseFinish({ ...state, holding: null, waitingQuiet: false, joining: state.pending || state.joining, trailed: false, keptReady: null }, event.t, settings)
      case 'listen.turn':
        // The light model closed the turn alone: the next is a new one.
        return event.state === 'closed' ? { state: { ...state, sentAt: null, falseFinishes: 0 }, emit: [] } : { state, emit: [] }
      case 'reply.sentence':
        return event.encouragement && state.pending ? { state: { ...state, encouraging: event.replyId }, emit: [] } : { state, emit: [] }
      case 'playback.at':
        return state.pending && event.replyId !== state.encouraging ? { state: settled, emit: [] } : { state, emit: [] }
      case 'reply.spoken':
        return event.sentences === 0 && state.pending ? { state: settled, emit: [] } : { state, emit: [] }
      case 'reply.held':
        // No reply will come: the message stays open, even if its turn's end came first and settled it.
        return { state: { ...state, pending: true, joining: state.joining || state.text.trim() !== '', encouraging: null }, emit: [] }
      case 'clock.tick': {
        // The reply talked over has stopped and the words that stopped it are shown: the READY kept counts now.
        if (state.keptReady && !SPEAKING.has(state.floor) && state.text.trim()) return decided(state, state.keptReady, event.t, settings)
        if (state.waitingQuiet) {
          return event.t - state.voiceEnd >= waitOf(state, settings) && !SPEAKING.has(state.floor) ? ready(state, event.t, settings) : { state, emit: [] }
        }
        const since = state.holding
        if (since !== null) {
          return event.t < since + state.lagMs + settings.inbound.catchUpGraceMs ? { state, emit: [] } : send(state, event.t, settings)
        }
        const stranded = state.text.trim() !== '' && state.floor !== 'person-speaking' && event.t - state.textAt >= settings.pause.capMs
        return stranded ? send(state, event.t, settings) : { state, emit: [] }
      }
      case 'semantics.decision': {
        if (event.answer !== 'READY') return { state, emit: [] }
        if (state.floor === 'ducked') return { state: { ...state, keptReady: event }, emit: [] }
        if (SPEAKING.has(state.floor)) return { state, emit: [] }
        return decided(state, event, event.t, settings)
      }
      default:
        return { state, emit: [] }
    }
  },
}
