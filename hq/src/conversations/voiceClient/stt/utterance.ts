/**
 * What the person is saying now (`stt.utterance`), from their words as they come (`stt.person`): the turn decision,
 * not the speech service's end of turn, ends a message (adaptive voice spec, Semantics), so the service's turns
 * are joined while the person goes on, and what they are saying is shown as they say it. The response scheduler
 * sends it on READY; this sends only when the person ends voice by hand (`stt.flush`).
 *
 * - **The same words again.** Within a turn the service's latest transcript replaces the earlier ones, and words
 *   of a message already sent can still arrive. They are not shown, nor sent, twice: only what is new.
 * - **A stray word.** One word heard just after a message, before any reply was heard, is noise the service turned
 *   into a word: it is not shown, so it is not sent on its own.
 * - **No voice, no words.** Words heard when silence detection has heard no voice since the last message are not
 *   the person's: the agent's last words heard back after its audio stopped ("much since" written "Synthesis"),
 *   which ending voice would otherwise send. Words over the reply count once they stopped it. Words over a light
 *   model's line (adaptive voice listening) count as they are: the line is said over the person, so silence
 *   detection, which then hears the person against the line's echo, can miss them, and the echo filter has already
 *   set the line's own words apart.
 */
import type { FloorState, VoiceEventInput } from '../events'
import type { Component } from '../runtime/types'
import { TAIL_MS } from './echo'

/** Words that repeat the last message are cut only this soon after it. */
export const REPEAT_WINDOW_MS = 30_000
/** One word this soon after a message, with no reply heard yet, is a stray. */
export const STRAY_WINDOW_MS = 5_000

type Heard = { text: string; order: number | null }

function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

function bare(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/** The words of `text` after `prefix`, when `text` starts with every word of `prefix`; null when it does not. */
export function after(text: string, prefix: string): string | null {
  const want = wordsOf(prefix).map(bare).filter(Boolean)
  const have = wordsOf(text)
  let at = 0
  let matched = 0
  while (matched < want.length) {
    if (at >= have.length) return null
    const word = bare(have[at]!)
    at++
    if (word === '') continue
    if (word !== want[matched]) return null
    matched++
  }
  return have.slice(at).join(' ')
}

type State = {
  floor: FloorState
  /** The service's last ended turn, which the next words continue; null when none since the last message. */
  held: Heard | null
  /** Everything heard since the last message. */
  live: Heard | null
  /** The last message, as heard whole. */
  last: (Heard & { at: number }) | null
  /** Silence detection heard the person, or they stopped the reply, since the last message. */
  voiced: boolean
  /** Until when a light model's line can still be heard back: it plays, or ended less than `TAIL_MS` ago. */
  lineUntil: number
}

/** The utterance so far: the held turn continued by `next`, or replaced by it when it says it again. */
function joined(held: Heard | null, next: Heard): string {
  if (!held) return next.text
  if (next.order !== null && next.order === held.order) return next.text
  if (after(next.text, held.text) !== null) return next.text
  return `${held.text} ${next.text}`
}

/** What has not been sent yet: the words after the last message, when this says that message again. */
function unsent(last: State['last'], whole: string, order: number | null, now: number): string {
  if (!last || now - last.at > REPEAT_WINDOW_MS) return whole
  const rest = after(whole, last.text)
  if (rest !== null) return rest
  // The same turn heard again with some words changed: what follows as many words as were sent is the new part.
  if (order !== null && order === last.order) return wordsOf(whole).slice(wordsOf(last.text).length).join(' ')
  return whole
}

/** What is shown, and what READY would send, of the words heard since the last message. */
function shown(s: State, t: number): string {
  if (!s.live) return ''
  const text = unsent(s.last, s.live.text, s.live.order, t)
  // A reply is awaited from when a message is sent until the agent is heard or the turn ends.
  const stray = wordsOf(text).length <= 1 && s.last !== null && t - s.last.at < STRAY_WINDOW_MS && s.floor === 'agent-thinking'
  return stray ? '' : text
}

const showing = (text: string, t: number): VoiceEventInput => ({ kind: 'stt.utterance', text, t })

export const utterance: Component<State> = {
  name: 'utterance',
  accepts: ['stt.person', 'orchestration.send', 'orchestration.floor', 'stt.flush', 'stt.muted', 'acoustic.silence',
    'orchestration.playback', 'phrase.at'],
  init: () => ({ floor: 'open', held: null, live: null, last: null, voiced: false, lineUntil: -Infinity }),
  step(state, event) {
    switch (event.kind) {
      case 'acoustic.silence':
        return { state: event.silent ? state : { ...state, voiced: true }, emit: [] }
      case 'orchestration.playback':
        return { state: event.action === 'stop' ? { ...state, voiced: true } : state, emit: [] }
      case 'orchestration.floor':
        return { state: { ...state, floor: event.state }, emit: [] }
      case 'phrase.at':
        if (!event.lineId) return { state, emit: [] }
        return { state: { ...state, lineUntil: event.playing ? Infinity : event.t + TAIL_MS }, emit: [] }
      case 'stt.person': {
        if (!state.voiced && event.t > state.lineUntil) return { state, emit: [showing('', event.t)] }
        state = { ...state, voiced: true }
        const next = { text: event.text, order: event.order }
        const live = { text: joined(state.held, next), order: event.order }
        // Words of the message already sent, arriving late: kept, they would be joined to the next message.
        if (state.last && unsent(state.last, live.text, live.order, event.t) === '') {
          return { state: { ...state, held: null, live: null }, emit: [showing('', event.t)] }
        }
        const s = { ...state, live, held: event.committed ? live : state.held }
        return { state: s, emit: [showing(shown(s, event.t), event.t)] }
      }
      case 'orchestration.send': {
        const last = state.live ? { ...state.live, at: event.t } : state.last
        return { state: { ...state, held: null, live: null, last, voiced: false }, emit: [showing('', event.t)] }
      }
      case 'stt.flush': {
        const text = shown(state, event.t)
        return { state, emit: text ? [{ kind: 'orchestration.send', text, append: false, t: event.t }] : [] }
      }
      case 'stt.muted':
        return event.muted ? { state: { ...state, held: null, live: null, voiced: false }, emit: [showing('', event.t)] } : { state, emit: [] }
      default:
        return { state, emit: [] }
    }
  },
}
