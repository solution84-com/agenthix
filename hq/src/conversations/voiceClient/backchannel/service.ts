/**
 * The listening read in the browser (adaptive voice listening, spec §The listening read, B1): which sound fits what the
 * person has said so far — its kind and tone — asked of hq about once a second while they speak, and the
 * latest answer held, as "if you pause now, say this". A pure component: it only asks (`hum.ask`, which
 * `../adapters/hqBackchannel` sends, with the words of the last three sounds the agent made in this conversation) and
 * says what it holds (`hum.held`); the pause rules (`./trigger`) decide when a sound is due, and the sound keeper
 * (`./keeper`) has it ready.
 *
 * - **While they speak**, their voice on, with words on screen that grew since the last question; and **once more as a
 *   pause begins**, on the words shown then (`atPause`), so the answer held in the pause is about their latest words.
 *   Never later in a silence, or while the agent holds the floor or any of its audio plays.
 * - **About the turn's words so far**: those a *sounds finished* call already sent, in a turn kept open, and the new
 *   ones; a send changes nothing else, since the turn goes on. Only the turn's end (handed over, closed) starts afresh.
 * - **One question at a time**: a second is skipped while one is in flight (and counted); one in flight past
 *   `HUM_STALE_MS` is given up, and an answer that late is dropped, as is one for a turn that has ended.
 * - **A failed answer holds nothing new** (`fallback`): the answer before it stands; once hq says no listening read is
 *   reached here, it asks no more.
 * - Only while the backchannel may hum (`backchannelOn`: with the light model or, with `backchannelAlone`, without it)
 *   and its own switch is on. In plain voice a send ends the turn, as the light model's hand over does.
 */
import type { FloorState, VoiceEventInput, VoiceEventOf } from '../events'
import type { Component } from '../runtime/types'
import { backchannelOn, lightModelOn, type VoiceSettings } from '../settings'
import { HUM_STALE_MS } from './settings'

/** The sounds the read is told of: its last three. */
const RECENT = 3

type State = {
  /** hq answered a `listen` with `off`, or the hum service with `off`. */
  off: boolean
  serviceOff: boolean
  floor: FloorState
  speaking: boolean
  replyPlaying: boolean
  soundPlaying: boolean
  text: string
  /** The words of this turn a *sounds finished* call sent: the turn is kept open, and they are still its words. */
  sent: string
  /** The words last asked about, so a second with nothing new asks nothing. */
  asked: string
  calls: number
  /** The words of the last sounds the agent made in this conversation, oldest first. */
  recent: string[]
  inFlight: { call: number; at: number; skipped: number; atPause: boolean } | null
  lastAt: number | null
  skipped: number
}

const AGENT: ReadonlySet<FloorState> = new Set(['agent-speaking', 'ducked', 'agent-thinking', 'hand-raised'])

const isOn = (settings: VoiceSettings, state: State) => backchannelOn(settings) && settings.backchannel.serviceOn && !state.off && !state.serviceOff

type Step = { state: State; emit: VoiceEventInput[] }

const ENDED: Partial<State> = { sent: '', asked: '', inFlight: null, lastAt: null, skipped: 0 }

/** Ask about the turn's words so far, unless a question is in flight (its answer stands) or they have not grown. */
function ask(state: State, t: number, atPause: boolean): Step {
  if (state.inFlight && t - state.inFlight.at < HUM_STALE_MS) return { state: { ...state, lastAt: t, skipped: state.skipped + 1 }, emit: [] }
  const text = [state.sent, state.text.trim()].filter(Boolean).join(' ')
  if (text === state.asked) return { state, emit: [] }
  const call = state.calls + 1
  return {
    state: { ...state, calls: call, asked: text, inFlight: { call, at: t, skipped: state.skipped, atPause }, lastAt: t, skipped: 0 },
    emit: [{
      kind: 'hum.ask', call, text, skipped: state.skipped, ...(atPause && { atPause: true as const }), ...(state.recent.length > 0 && { recent: state.recent }), t,
    }],
  }
}

const mayAsk = (state: State, settings: VoiceSettings) =>
  isOn(settings, state) && !!state.text.trim() && !state.replyPlaying && !state.soundPlaying && !AGENT.has(state.floor)

function tick(state: State, t: number, settings: VoiceSettings): Step {
  if (!state.speaking || !mayAsk(state, settings)) return { state, emit: [] }
  if (state.lastAt !== null && t - state.lastAt < settings.backchannel.serviceIntervalMs) return { state, emit: [] }
  return ask(state, t, false)
}

/** Their voice ends: a pause begins, and the service is asked about the words shown now. */
function paused(state: State, t: number, settings: VoiceSettings): Step {
  const s = { ...state, speaking: false }
  if (!state.speaking || !mayAsk(s, settings)) return { state: s, emit: [] }
  // A question in flight now is not counted as a skipped second: its answer is the pause's.
  if (s.inFlight && t - s.inFlight.at < HUM_STALE_MS) return { state: s, emit: [] }
  return ask(s, t, true)
}

function answered(state: State, e: VoiceEventOf<'hum.answer'>): Step {
  const asked = state.inFlight?.call === e.call ? state.inFlight : null
  const waitedMs = asked ? e.t - asked.at : e.ms
  const next = asked ? { ...state, inFlight: null } : state
  if (!asked || waitedMs > HUM_STALE_MS) {
    return {
      state: next,
      emit: [{
        kind: 'hum.dropped', call: e.call, humKind: e.humKind, tone: e.tone, ms: e.ms, waitedMs, skipped: asked?.skipped ?? 0,
        ...(asked?.atPause && { atPause: true as const }), t: e.t,
      }],
    }
  }
  const held = {
    kind: 'hum.held' as const, call: e.call, askedAt: asked.at, ms: e.ms, skipped: asked.skipped, ...(asked.atPause && { atPause: true as const }), t: e.t,
  }
  if (e.failed || e.humKind === null) {
    return {
      state: { ...next, serviceOff: next.serviceOff || e.failed === 'off' },
      emit: [{ ...held, humKind: null, tone: null, fallback: e.failed ?? 'failed' }],
    }
  }
  const none = e.humKind === 'none'
  return { state: next, emit: [{ ...held, humKind: e.humKind, tone: none ? null : e.tone }] }
}

export const humService: Component<State> = {
  name: 'humService',
  accepts: ['acoustic.silence', 'orchestration.floor', 'orchestration.send', 'stt.utterance', 'playback.at', 'phrase.at', 'listen.answer',
    'listen.turn', 'listen.sendPlain', 'hum.answer', 'backchannel.played', 'clock.tick'],
  init: () => ({
    off: false, serviceOff: false, floor: 'open', speaking: false, replyPlaying: false, soundPlaying: false, text: '', sent: '', asked: '',
    calls: 0, recent: [], inFlight: null, lastAt: null, skipped: 0,
  }),
  step(state, event, settings) {
    const keep = (patch: Partial<State> = {}) => ({ state: { ...state, ...patch }, emit: [] })
    switch (event.kind) {
      case 'acoustic.silence':
        return event.silent ? paused(state, event.t, settings) : keep({ speaking: true })
      case 'orchestration.floor':
        return keep({ floor: event.state })
      case 'stt.utterance':
        return keep({ text: event.text })
      case 'orchestration.send':
        // The words went with a *sounds finished* call (the whole turn's so far): the turn may be kept open.
        if (event.via === 'listen') return keep({ sent: event.text.trim() })
        return lightModelOn(settings) ? keep() : keep(ENDED)
      case 'listen.turn':
        // The turn ended: a question about its words is no longer anyone's.
        return event.state === 'notYet' ? keep() : keep(ENDED)
      case 'listen.sendPlain':
        return keep(ENDED)
      case 'playback.at':
        return keep({ replyPlaying: event.playing })
      case 'phrase.at':
        return keep({ soundPlaying: event.playing })
      case 'listen.answer':
        return event.off ? keep({ off: true }) : keep()
      case 'hum.answer':
        return answered(state, event)
      case 'backchannel.played':
        return event.text ? keep({ recent: [...state.recent, event.text].slice(-RECENT) }) : keep()
      case 'clock.tick':
        return tick(state, event.t, settings)
      default:
        return keep()
    }
  },
}
