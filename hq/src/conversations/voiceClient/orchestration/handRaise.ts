/**
 * The hand-raise (adaptive voice spec, Orchestration §4): an agent with an ordinary update asks for attention instead
 * of interrupting. hq marks the update (`reply.update`); the hand is raised (the screen chimes and shows a badge),
 * and it waits for an opening, the floor open for `handRaise.openingMs` since the hand went up or the person last
 * held the floor, or for the person's invitation: a tap on the badge, or one of `handRaise.invitations`. Then it is
 * invited, and hq gives the agent its turn. A reply the person is waiting for always comes first.
 *
 * A critical update (governed by policy elsewhere) does not wait for an opening: it is invited at once, or, while
 * the agent speaks, after the current sentence, the reply being stopped there. A hand still raised after
 * `handRaise.unansweredMs` is cleared, as hq lets it go then and gives its update its turn as text.
 */
import type { FloorState, VoiceEventInput } from '../events'
import type { Component } from '../runtime/types'
import { invites } from './words'

type Update = { updateId: string; critical: boolean }

type State = {
  floor: FloorState
  /** The updates waiting, the raised one first. */
  queue: readonly Update[]
  /** Since when the floor has been open for the raised hand; null while it is not. */
  openSince: number | null
  /** When the hand at the front went up. */
  raisedAt: number
  /** The sentence playing now, and the one a critical update waits for the end of. */
  playingIndex: number | null
  criticalAfter: number | null
  /** The reply was stopped for a critical update, which is invited once the stop is delivered. */
  stopping: boolean
}

const SPEAKING: ReadonlySet<FloorState> = new Set(['agent-speaking', 'ducked'])
const OPEN: ReadonlySet<FloorState> = new Set(['open', 'hand-raised'])

export const handRaise: Component<State> = {
  name: 'handRaise',
  accepts: ['reply.update', 'orchestration.floor', 'clock.tick', 'person.tap', 'stt.person', 'playback.at',
    'orchestration.playback'],
  init: () => ({ floor: 'open', queue: [], openSince: null, raisedAt: 0, playingIndex: null, criticalAfter: null, stopping: false }),
  step(state, event, settings) {
    const t = event.t
    const note = (u: Update, s: 'raised' | 'invited' | 'cleared'): VoiceEventInput =>
      ({ kind: 'orchestration.handRaise', updateId: u.updateId, state: s, critical: u.critical, t })

    /** The front of `s.queue` has just been raised: a critical one goes at once, or after the sentence playing. */
    const raised = (s: State): { state: State; emit: VoiceEventInput[] } => {
      const front = s.queue[0]
      if (!front) return { state: s, emit: [] }
      const up = { ...s, openSince: OPEN.has(s.floor) ? t : null, raisedAt: t }
      if (!front.critical) return { state: up, emit: [note(front, 'raised')] }
      if (SPEAKING.has(s.floor)) return { state: { ...up, criticalAfter: s.playingIndex ?? -1 }, emit: [note(front, 'raised')] }
      const next = invite(up)
      return { state: next.state, emit: [note(front, 'raised'), ...next.emit] }
    }
    const invite = (s: State): { state: State; emit: VoiceEventInput[] } => {
      const [front, ...rest] = s.queue
      if (!front) return { state: s, emit: [] }
      const after = raised({ ...s, queue: rest, criticalAfter: null })
      return { state: after.state, emit: [note(front, 'invited'), ...after.emit] }
    }

    const front = state.queue[0]
    switch (event.kind) {
      case 'reply.update': {
        if (state.queue.some(u => u.updateId === event.updateId)) return { state, emit: [] }
        const queue = [...state.queue, { updateId: event.updateId, critical: event.critical }]
        if (queue.length > settings.handRaise.maxWaiting) {
          // The raised one is never the one dropped: the oldest waiting behind it is.
          const [dropped] = queue.splice(1, 1)
          return { state: { ...state, queue }, emit: [note(dropped!, 'cleared')] }
        }
        return state.queue.length === 0 ? raised({ ...state, queue }) : { state: { ...state, queue }, emit: [] }
      }
      case 'orchestration.floor': {
        const open = OPEN.has(event.state)
        const openSince = open ? (OPEN.has(state.floor) ? state.openSince : t) : null
        return { state: { ...state, floor: event.state, openSince }, emit: [] }
      }
      case 'clock.tick':
        if (front && t - state.raisedAt >= settings.handRaise.unansweredMs) {
          const next = raised({ ...state, queue: state.queue.slice(1), criticalAfter: null })
          return { state: next.state, emit: [note(front, 'cleared'), ...next.emit] }
        }
        if (!front || front.critical || state.openSince === null) return { state, emit: [] }
        return t - state.openSince >= settings.handRaise.openingMs ? invite(state) : { state, emit: [] }
      case 'person.tap':
        return event.target === 'hand-raise' ? invite(state) : { state, emit: [] }
      case 'stt.person':
        return front && invites(event.text, settings.handRaise.invitations) ? invite(state) : { state, emit: [] }
      case 'playback.at': {
        const s = { ...state, playingIndex: event.playing ? event.index : null }
        if (state.criticalAfter === null) return { state: s, emit: [] }
        if (event.playing && event.index <= state.criticalAfter) return { state: s, emit: [] }
        if (!event.playing) return invite(s)
        return {
          state: { ...s, criticalAfter: null, stopping: true },
          emit: [{ kind: 'orchestration.playback', action: 'stop', replyId: event.replyId, t }],
        }
      }
      case 'orchestration.playback':
        return event.action === 'stop' && state.stopping ? invite({ ...state, stopping: false }) : { state, emit: [] }
      default:
        return { state, emit: [] }
    }
  },
}
