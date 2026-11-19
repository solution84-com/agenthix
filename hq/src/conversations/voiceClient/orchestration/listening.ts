/**
 * The listening family (voice that stays in the conversation, spec §3): when the agent shows it is following, and
 * when it invites the person to go on. It asks for a sound by the tiers it may be drawn from
 * (`orchestration.phrase`); the speaker's player (`../adapters/listenerPhrases`) picks the clip, none of the last few
 * played, and plays it under the reply's level.
 *
 * - **A hum or an acknowledging word, in a brief pause where their words end in punctuation**, once the person has spoken `afterSpeechMs` (counted across
 *   a run of messages hq held, from the first words), and a random gap of `minGapMs` to `maxGapMs` after the last sound
 *   of the family. It does not wait for the audio model or the lead to rule on the pause: a hum is not a reply, it
 *   says the agent is still with them, so it comes while they talk. The pause is `humAfterPauseMs` of silence: a
 *   breath, and the speech service's punctuation at the end of what it has heard says the clause is done; if that
 *   arrives late, the sound is late (one that has not come when they speak again is dropped), and past
 *   `longestWaitMs` any pause will do. A hum can fall at any pause; an acknowledging word only where the last words fit one (`./fit`: not
 *   inside a clause, not after a question or a request). Never while the agent speaks or is about to.
 * - **An invitation after a stop word**: a reply stopped by a stop word, and the person silent
 *   `invitationAfterStopMs` after it. Words of theirs beyond the stop word, the *Stop* button, or a stop on their own
 *   words, and there is none: they are already saying what they stopped it for.
 * - **An invitation after a held turn**: hq said they had not finished (`reply.held`), and they stay silent
 *   `invitationAfterHoldMs`; never closer than `minGapMs` to the last sound.
 *
 * Nothing plays with the person's Adaptive voice off, nor with the flag `voiceListener` on: the light model listens
 * then. The gap is drawn from a seeded generator kept in the state, so
 * a run is the same each time it is replayed from the same seed.
 */
import type { FloorState, VoiceEventInput } from '../events'
import type { Component } from '../runtime/types'
import type { VoiceSettings } from '../settings'
import { fitOf, tiersFor } from './fit'
import type { ListeningTier } from './listeningTiers'
import { isOnly } from './words'

type Invite = { after: 'stop' | 'hold'; due: 'silence' | number }

type State = {
  floor: FloorState
  silent: boolean
  /** When the person began speaking in the message they are speaking; null before they have. */
  speechSince: number | null
  /** When they began speaking in the run of messages hq has held and they have gone on with; kept across a send until a reply is not held. */
  runSince: number | null
  /** When their voice last ended. */
  pausedAt: number
  /** What they are saying now, for the fit. */
  text: string
  /** When the family last played a sound, and the gap drawn after it. */
  lastAt: number
  gapMs: number
  /** This pause has had its sound. */
  listened: boolean
  invite: Invite | null
  seed: number
}

/** The agent holds the floor, or will: no sound of the family then. */
const AGENTS: ReadonlySet<FloorState> = new Set(['agent-thinking', 'agent-speaking', 'ducked'])

/** One step of mulberry32: a number in [0, 1) and the next seed. */
function draw(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) | 0
  let r = Math.imul(next ^ (next >>> 15), 1 | next)
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
  return [((r ^ (r >>> 14)) >>> 0) / 4_294_967_296, next]
}

function played(state: State, t: number, tiers: ListeningTier[], s: VoiceSettings['listening']) {
  const [r, seed] = draw(state.seed)
  const gapMs = s.minGapMs + r * Math.max(0, s.maxGapMs - s.minGapMs)
  const emit: VoiceEventInput[] = [{ kind: 'orchestration.phrase', tiers, t }]
  return { state: { ...state, lastAt: t, gapMs, seed, listened: true, invite: null }, emit }
}

/** A hum or word in the pause the person is in, if one may play; nothing otherwise. */
function pauseSound(state: State, t: number, s: VoiceSettings['listening']): { state: State; emit: VoiceEventInput[] } | null {
  const from = state.runSince ?? state.speechSince
  if (!state.silent || state.listened || from === null || !Number.isFinite(state.pausedAt)) return null
  if (t - state.pausedAt < s.humAfterPauseMs || state.pausedAt - from < s.afterSpeechMs || AGENTS.has(state.floor)) return null
  if (t - state.lastAt < state.gapMs) {
    return { state: { ...state, listened: true }, emit: [{ kind: 'phrase.skipped', why: 'a pause, but too soon after the last sound', t }] }
  }
  const since = Number.isFinite(state.lastAt) ? state.lastAt : from
  // Where a clause or a sentence ends, the speech service's punctuation says: a sound waits for it, however late it
  // arrives (that lateness is the delay of listening through an intercom), until the longest wait, when any pause will do.
  const waitedLong = t - since >= s.longestWaitMs
  if (!waitedLong && !/[.,;:?!…]["')\]]*\s*$/.test(state.text.trim())) return null
  const fits = tiersFor(fitOf(state.text), waitedLong)
  return played(state, t, fits.includes('hum') ? fits : ['hum', ...fits], s)
}

/** The listening component; `random` seeds its gaps as each voice starts. */
export function createListening(random: () => number = Math.random): Component<State> {
  return {
    name: 'listening',
    accepts: ['acoustic.silence', 'orchestration.floor', 'orchestration.send', 'orchestration.playback',
      'stt.utterance', 'reply.held', 'clock.tick'],
    init: () => ({
      floor: 'open', silent: true, speechSince: null, runSince: null, pausedAt: -Infinity, text: '', lastAt: -Infinity, gapMs: 0,
      listened: false, invite: null, seed: Math.floor(random() * 4_294_967_296),
    }),
    step(state, event, settings) {
      if (!settings.adaptiveVoice || settings.voiceListener) return { state, emit: [] }
      const s = settings.listening
      const keep = (patch: Partial<State> = {}) => ({ state: { ...state, ...patch }, emit: [] })
      const invite = state.invite
      switch (event.kind) {
        case 'acoustic.silence': {
          if (event.silent) {
            const wait = invite?.after === 'hold' ? s.invitationAfterHoldMs : s.invitationAfterStopMs
            const next = invite?.due === 'silence' ? { ...invite, due: event.t + wait } : invite
            return keep({ silent: true, pausedAt: event.t, invite: next })
          }
          // They speak again: the pause's sound is spent, and an invitation is wanted only after a stop word they are still saying.
          const waiting = invite?.after === 'stop' && invite.due === 'silence' ? invite : null
          return keep({ silent: false, speechSince: state.speechSince ?? event.t, listened: false, invite: waiting })
        }
        case 'orchestration.floor':
          // A reply that is spoken ends the run of held messages: the next words begin a new one.
          return keep({ floor: event.state, ...(event.state === 'agent-speaking' && { runSince: null }), invite: event.state === 'agent-speaking' ? null : invite })
        case 'orchestration.send':
          return keep({ speechSince: null, runSince: event.append ? state.runSince ?? state.speechSince : state.speechSince, invite: null })
        case 'orchestration.playback': {
          if (event.action !== 'stop') return keep()
          if (event.by !== 'stop-word') return keep({ invite: null })
          return keep({ invite: { after: 'stop', due: state.silent ? event.t + s.invitationAfterStopMs : 'silence' } })
        }
        case 'reply.held':
          return keep({ invite: { after: 'hold', due: state.silent ? event.t + s.invitationAfterHoldMs : 'silence' } })
        case 'stt.utterance': {
          const more = event.text.trim() !== '' && !isOnly(event.text, settings.bargeIn.stopWords)
          return keep({ text: event.text, invite: more && invite?.after === 'stop' ? null : invite })
        }
        case 'clock.tick': {
          const hum = pauseSound(state, event.t, s)
          if (hum) return hum
          if (!invite || typeof invite.due !== 'number' || event.t < invite.due) return keep()
          const allowed = state.lastAt + s.minGapMs
          if (invite.after === 'hold' && event.t < allowed) return keep({ invite: { ...invite, due: allowed } })
          if (!state.silent || AGENTS.has(state.floor)) return keep({ invite: null })
          return played(state, event.t, ['invitation'], s)
        }
        default:
          return keep()
      }
    },
  }
}

export const listening = createListening()
