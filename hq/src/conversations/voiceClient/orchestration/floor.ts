/**
 * The floor (adaptive voice spec, Orchestration §1): who holds the conversation now, read by every other part before
 * it acts. It follows silence (Acoustic), the message sent (the scheduler), the reply's audio (playback), the
 * duck, stop and resume (barge-in) and the raised hand, and publishes `orchestration.floor` when it changes.
 */
import type { FloorState } from '../events'
import type { Component } from '../runtime/types'

type State = {
  floor: FloorState
  /** The person is silent, as Acoustic last said. */
  silent: boolean
  /** An agent's hand is raised, waiting for an opening. */
  hand: boolean
  /** When the person's pause began, while the floor is theirs and pausing. */
  pausingSince: number | null
}

const SPEAKING: ReadonlySet<FloorState> = new Set(['agent-speaking', 'ducked'])

export const floor: Component<State> = {
  name: 'floor',
  accepts: ['acoustic.silence', 'orchestration.send', 'playback.at', 'orchestration.playback', 'reply.spoken',
    'reply.held', 'orchestration.handRaise', 'clock.tick'],
  init: () => ({ floor: 'open', silent: true, hand: false, pausingSince: null }),
  step(state, event, settings) {
    const rest: FloorState = state.hand ? 'hand-raised' : 'open'
    const go = (next: FloorState, patch: Partial<State> = {}) => {
      const s = { ...state, ...patch }
      const pausingSince = next === 'person-pausing' ? (state.floor === 'person-pausing' ? state.pausingSince : event.t) : null
      const moved = next !== state.floor
      return { state: { ...s, floor: next, pausingSince }, emit: moved ? [{ kind: 'orchestration.floor', state: next, t: event.t } as const] : [] }
    }
    const stay = (patch: Partial<State> = {}) => ({ state: { ...state, ...patch }, emit: [] })
    const open = state.floor === 'open' || state.floor === 'hand-raised'

    switch (event.kind) {
      case 'acoustic.silence': {
        const patch = { silent: event.silent }
        if (!event.silent) {
          if (open || state.floor === 'person-pausing' || state.floor === 'agent-thinking') return go('person-speaking', patch)
          return stay(patch)
        }
        return state.floor === 'person-speaking' ? go('person-pausing', patch) : stay(patch)
      }
      case 'orchestration.send':
        return SPEAKING.has(state.floor) ? stay() : go('agent-thinking')
      case 'playback.at':
        if (event.playing) return open || state.floor === 'agent-thinking' ? go('agent-speaking') : stay()
        return SPEAKING.has(state.floor) || state.floor === 'agent-thinking' ? go(rest) : stay()
      case 'orchestration.playback':
        if (event.action === 'duck') return state.floor === 'agent-speaking' ? go('ducked') : stay()
        if (event.action === 'resume') return state.floor === 'ducked' ? go('agent-speaking') : stay()
        return SPEAKING.has(state.floor) ? go(state.silent ? 'person-pausing' : 'person-speaking') : stay()
      case 'reply.spoken':
        return event.sentences === 0 && state.floor === 'agent-thinking' ? go(rest) : stay()
      case 'reply.held':
        return state.floor === 'agent-thinking' ? go(rest) : stay()
      case 'orchestration.handRaise': {
        const hand = event.state === 'raised'
        if (event.state === 'invited' && !SPEAKING.has(state.floor)) return go('agent-thinking', { hand })
        if (open) return go(hand ? 'hand-raised' : 'open', { hand })
        return stay({ hand })
      }
      case 'clock.tick': {
        const since = state.pausingSince
        if (state.floor !== 'person-pausing' || since === null) return stay()
        return event.t - since > settings.pause.capMs + settings.floor.pauseGraceMs ? go(rest) : stay()
      }
      default:
        return stay()
    }
  },
}
