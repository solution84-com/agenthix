/**
 * The listening runtime (adaptive voice listening, spec §The light model → *When it is asked*, §When a turn ends): it
 * decides only *when* the light model is asked (`listen.ask`, sent to hq as `listen`); the light model decides what. It
 * runs with the flag `voiceListener` on and the person's Adaptive voice on, until hq answers `off`; then, and with
 * Adaptive voice off, voice is plain: the scheduler's send goes as today.
 *
 * - **Sounds finished**: the sound model ended the turn (the scheduler's `orchestration.ready`, once the words have
 *   caught up). Always a fresh call, and it carries the message: hq takes it on a hand over or its fallback.
 * - **Quiet** at the wait hq sends (`nextCheckSecs`, from hq's schedule) while the person stays quiet — marked
 *   `keptOpen` after a *sounds finished* "not yet", which may then end the turn — and **working** at it from a hand
 *   over until the reply's first sentence is here (it may wait for a line to end before it plays: the wait is over all
 *   the same).
 *   Never while the reply plays. The person speaking again cancels a pending check; in a turn kept open, their next
 *   quiet starts the schedule again, at the quiet hq's first wait came at.
 *
 * Nothing is asked while they talk: the 0.3 s quiet-after-words call is gone (an older hq still answers it), and the
 * small sounds of listening are the backchannel's (`../backchannel`), which asks nothing.
 *
 * Words hq has not taken are carried: after a "not yet", or a *sounds finished* call superseded by the person going
 * on, the next call carries them with the new ones. After a hand over, words before any of the reply is heard join
 * the message as today's `continue`. An answer to a call that is no longer the latest decides nothing, and only its
 * acknowledgement may play (`listen.play`); the same answer delivered twice is read once. Calls are numbered (hq's `seq`)
 * upwards through the voice.
 *
 * An answer that comes after the person spoke again (since its call was asked, or as they speak) plays no line: the
 * line is about a pause that has ended, and would be said over them. The decision stands (a hand over still hands
 * over, a "not yet" keeps the turn open); its line is dropped (`listen.drop`), and hq hears it was skipped.
 *
 * The reply may set a listening style the person asked for (`set_listening_style`, `listen.styleAsked`, `../pacing/style`),
 * whatever call is the latest and with the light model listening or not: it holds for the rest of the conversation
 * (`listen.style`). Under `patient`, no line plays until the turn has really ended: an acknowledgement or an invitation
 * in the person's turn, and the hold a hand over says, are dropped the same way (the decision stands: a hand over still
 * hands over, and the reply plays); a closing line, and lines while the reply is worked out, play.
 */
import type { VoiceListenMoment } from '@agenthix/core'
import type { FloorState, VoiceEventInput, VoiceEventOf } from '../events'
import type { Component } from '../runtime/types'
import type { VoiceSettings } from '../settings'
import { applyStyle, NORMAL_STYLE, type ListenStyleState } from '../pacing/style'

type Phase = 'listening' | 'deciding' | 'handedOver'

type State = {
  /** The light model is asked: the flag and Adaptive voice on, and hq has not answered `off`. */
  light: boolean
  /** The last call asked (hq's `seq`). */
  call: number
  floor: FloorState
  silent: boolean
  voiceEndAt: number
  /**
   * The latest call asked when the person's voice last began: a line of that call or an earlier one is about a pause
   * they have since spoken after. By the order events came, not their times: a voice's start can be dated before a
   * call that went out first.
   */
  voiceCall: number
  /** The words on screen, not yet sent. */
  text: string
  /**
   * The last answer read, by its call and what it said: the same answer delivered again is read once. hq may answer a
   * call a second time with something new (its "not yet" limit, on the latest call), and that is read.
   */
  answered: string
  /** Words of this turn hq has not taken: those a *sounds finished* call carried, kept open or superseded. */
  carried: string
  phase: Phase
  /** The *sounds finished* call in flight, and when it went. */
  deciding: { call: number; at: number } | null
  /** The last decisive answer was "not yet", and the person has said nothing since. */
  keptOpen: boolean
  /** The message handed over, and when. */
  handed: { text: string; at: number } | null
  /** The reply to the message handed over has sent its first sentence: nothing more is checked while it waits. */
  replyHere: boolean
  /**
   * The chain of checks at hq's wait: its interval, and when the next is due (null: waiting for quiet or an answer);
   * in a turn kept open, `firstMs`, the quiet hq's first check came at, where the schedule starts again after new words.
   */
  check: { everyMs: number; due: number | null; firstMs?: number } | null
  /** The listening style the person asked for. */
  style: ListenStyleState
}

const SPEAKING: ReadonlySet<FloorState> = new Set(['agent-speaking', 'ducked'])

/** The person spoke after `call` was asked, or is speaking: its line would be said over them, or about a pause that ended. */
const spokeSince = (state: State, call: number) => !state.silent || state.voiceCall >= call

const join = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join(' ')

function nextCheckMs(secs: number, s: VoiceSettings['listener']['nextCheck']): number {
  const given = Number.isFinite(secs) && secs > 0 ? secs : s.defaultSecs
  return Math.min(s.maxSecs, Math.max(s.minSecs, given)) * 1000
}

type Step = { state: State; emit: VoiceEventInput[] }

function ask(state: State, t: number, moment: VoiceListenMoment, text: string, extra: { workingMs?: number; keptOpen?: boolean } = {}): Step {
  const call = state.call + 1
  const quietMs = Number.isFinite(state.voiceEndAt) ? Math.max(0, t - state.voiceEndAt) : 0
  return {
    state: { ...state, call },
    emit: [{ kind: 'listen.ask', call, moment, text, quietMs, ...extra, t }],
  }
}

/** The scheduler's send, under the light model. */
function ready(state: State, e: VoiceEventOf<'orchestration.ready'>, settings: VoiceSettings): Step {
  const send = (append: boolean): Step => ({ state, emit: [{ kind: 'orchestration.send', text: e.text, append, t: e.t }] })
  if (!state.light) return send(e.append)
  if (state.phase === 'handedOver' && e.append) {
    // Their words join the message: it is answered again, and that reply's wait is checked as the first one's was.
    if (!state.replyHere) return send(true)
    const everyMs = state.check?.everyMs ?? nextCheckMs(Number.NaN, settings.listener.nextCheck)
    return { ...send(true), state: { ...state, replyHere: false, check: { everyMs, due: state.silent ? e.t + everyMs : null } } }
  }
  const text = join(state.carried, e.text)
  const asked = ask(state, e.t, 'soundsFinished', text)
  return {
    state: {
      ...asked.state, phase: 'deciding', deciding: { call: asked.state.call, at: e.t }, carried: text, keptOpen: false,
      handed: null, check: null, text: '',
    },
    emit: [...asked.emit, { kind: 'orchestration.send', text, append: false, via: 'listen', t: e.t }],
  }
}

/** Under `patient`, a line said before the person's turn has really ended: in their turn, or a hand over's hold. */
const beforeTheEnd = (state: State, e: VoiceEventOf<'listen.answer'>) =>
  e.turn === 'handedOver' || e.turn === 'fallback' || ((e.action === 'acknowledge' || e.action === 'invite') && state.phase !== 'handedOver')

function answered(state: State, e: VoiceEventOf<'listen.answer'>, settings: VoiceSettings): Step {
  const key = [e.call, e.action, e.lineId, e.turn, e.turnId, e.off].join('|')
  if (!state.light || e.call > state.call || key === state.answered) return { state, emit: [] }
  state = { ...state, answered: key }
  const stale = e.call < state.call
  const quiet = e.action === 'hum' || e.action === 'acknowledge'
  const emit: VoiceEventInput[] = []
  if (e.lineId && (!stale || quiet)) {
    // The decision stands; only its line is dropped, never heard.
    const held = state.style.patient && beforeTheEnd(state, e)
    emit.push(spokeSince(state, e.call)
      ? { kind: 'listen.drop', lineId: e.lineId, call: e.call, why: 'you spoke again', t: e.t }
      : held ? { kind: 'listen.drop', lineId: e.lineId, call: e.call, why: 'you asked to be let finish', t: e.t }
        : { kind: 'listen.play', lineId: e.lineId, quiet, t: e.t })
  }
  const turn = (s: 'notYet' | 'closed' | 'handedOver') => emit.push({ kind: 'listen.turn', state: s, t: e.t })

  if (e.off) {
    const s: State = { ...state, light: false, check: null, keptOpen: false, deciding: null }
    if (e.turn === 'handedOver') {
      turn('handedOver')
      return { state: { ...s, phase: 'listening', carried: '', handed: null }, emit }
    }
    // A turn kept open that hq did not take: its words go as a plain message. One being decided is answered on its own.
    if (state.phase !== 'deciding' && state.carried) {
      emit.push({ kind: 'listen.sendPlain', text: state.carried, t: e.t })
      return { state: { ...s, phase: 'listening', carried: '' }, emit }
    }
    return { state: s, emit }
  }
  if (stale) return { state, emit }

  const everyMs = nextCheckMs(e.nextCheckSecs, settings.listener.nextCheck)
  const chain = { everyMs, due: state.silent && !SPEAKING.has(state.floor) ? e.t + everyMs : null }
  if (e.turn === 'closed') {
    turn('closed')
    return { state: { ...state, phase: 'listening', deciding: null, carried: '', keptOpen: false, check: null }, emit }
  }
  if (e.turn === 'handedOver' || e.turn === 'fallback') {
    turn('handedOver')
    return {
      state: { ...state, phase: 'handedOver', deciding: null, handed: { text: state.carried, at: e.t }, replyHere: false, carried: '', keptOpen: false, check: chain },
      emit,
    }
  }
  // The quiet the next check comes at; the first one after a "not yet" is where new words start the schedule again.
  const quietThen = Number.isFinite(state.voiceEndAt) ? Math.max(0, e.t - state.voiceEndAt) + everyMs : everyMs
  if (state.deciding?.call === e.call) {
    turn('notYet')
    return { state: { ...state, phase: 'listening', deciding: null, keptOpen: true, check: { ...chain, firstMs: quietThen } }, emit }
  }
  const firstMs = state.keptOpen ? state.check?.firstMs ?? quietThen : undefined
  return { state: { ...state, check: state.phase === 'handedOver' && state.replyHere ? null : { ...chain, ...(firstMs !== undefined && { firstMs }) } }, emit }
}

function tick(state: State, t: number, settings: VoiceSettings): Step {
  const s = settings.listener
  if (state.light && state.deciding && t - state.deciding.at >= s.noAnswerMs) {
    return {
      state: { ...state, light: false, phase: 'listening', deciding: null, carried: '', check: null },
      emit: [{ kind: 'listen.sendPlain', text: state.carried, t }],
    }
  }
  if (!state.light || !state.silent || SPEAKING.has(state.floor)) return { state, emit: [] }

  const due = state.check?.due
  if (due == null || t < due || state.phase === 'deciding') return { state, emit: [] }
  const check = { ...state.check!, due: null }
  if (state.phase === 'handedOver') {
    const asked = ask(state, t, 'working', '', { workingMs: t - (state.handed?.at ?? t) })
    return { state: { ...asked.state, check }, emit: asked.emit }
  }
  const asked = ask(state, t, 'quiet', join(state.carried, state.text), state.keptOpen ? { keptOpen: true } : {})
  return { state: { ...asked.state, check }, emit: asked.emit }
}

export const listenerTrigger: Component<State> = {
  name: 'listenerTrigger',
  accepts: ['orchestration.ready', 'orchestration.floor', 'acoustic.silence', 'stt.utterance', 'listen.answer',
    'reply.sentence', 'playback.at', 'reply.spoken', 'stt.flush', 'clock.tick', 'listen.style', 'listen.styleAsked'],
  init: settings => ({
    light: settings.voiceListener && settings.adaptiveVoice, call: 0, answered: '', floor: 'open', silent: true,
    voiceEndAt: -Infinity, voiceCall: 0, text: '', carried: '', phase: 'listening', deciding: null,
    keptOpen: false, handed: null, replyHere: false, check: null, style: NORMAL_STYLE,
  }),
  step(state, event, settings) {
    if (!settings.voiceListener) return { state, emit: [] }
    const keep = (patch: Partial<State> = {}): Step => ({ state: { ...state, ...patch }, emit: [] })
    switch (event.kind) {
      case 'orchestration.ready':
        return ready(state, event, settings)
      case 'orchestration.floor':
        return keep({ floor: event.state, ...(SPEAKING.has(event.state) && { check: null }) })
      case 'acoustic.silence': {
        if (!event.silent) {
          // New words: in a turn kept open, the schedule starts again from its first check.
          const first = state.check?.firstMs
          return keep({ silent: false, voiceCall: state.call, ...(state.check && { check: { ...state.check, due: null, ...(first !== undefined && { everyMs: first }) } }) })
        }
        const check = state.check && state.phase !== 'deciding' ? { ...state.check, due: event.t + state.check.everyMs } : state.check
        return keep({ silent: true, voiceEndAt: event.t, check })
      }
      case 'stt.utterance':
        return event.text === state.text ? keep() : keep({ text: event.text })
      case 'listen.answer':
        return answered(state, event, settings)
      case 'reply.sentence':
        // The reply is written and here, perhaps waiting for a line to end: nothing more to check on.
        return state.phase === 'handedOver' ? keep({ replyHere: true, check: null }) : keep()
      case 'playback.at':
        // The reply's first sentence plays: the wait is over, and nothing is asked while it plays.
        if (!event.playing) return keep()
        return keep({ check: null, ...(state.phase === 'handedOver' && { phase: 'listening' as const, handed: null }) })
      case 'reply.spoken':
        // The reply ended with nothing spoken: nothing more to wait for.
        return event.sentences === 0 && state.phase === 'handedOver' && event.t > (state.handed?.at ?? Infinity)
          ? keep({ phase: 'listening', handed: null, check: null }) : keep()
      case 'listen.style':
        // Held in the page's memory from earlier in the conversation.
        return event.restored ? keep({ style: event.state }) : keep()
      case 'listen.styleAsked': {
        const style = applyStyle(state.style, event.style)
        return { state: { ...state, style }, emit: [{ kind: 'listen.style', state: style, asked: event.style, t: event.t }] }
      }
      case 'stt.flush':
        // Voice ends by the person's hand with a turn kept open: its words, which hq has not taken, still go.
        if (!state.light || !state.carried || state.phase !== 'listening') return keep()
        return { state: { ...state, carried: '' }, emit: [{ kind: 'listen.sendPlain', text: state.carried, t: event.t }] }
      case 'clock.tick':
        return tick(state, event.t, settings)
      default:
        return keep()
    }
  },
}
