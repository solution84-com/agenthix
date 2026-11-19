/**
 * The sound keeper (adaptive voice listening, spec §The sound keeper, B3): has a sound ready when a breath gets one, from
 * the hum library (`./library`). A pure component; the speaker holds the audio (`../adapters/speakerSounds`) and plays
 * what this starts.
 *
 * 1. **Warmed as voice starts.** The common sounds (`WARM_SOUNDS`: the continuers and receipts in calm, a laugh) are
 *    asked of hq at once (`hum.speak`, `warm`): hq sends those made for the agent's voice and makes the rest. Asked
 *    again every `WARM_AGAIN_MS` until a sound comes (voice may not be held on hq yet), at most `WARM_TRIES` times.
 * 2. **Asked for as each read comes.** A read's kind in its tone is asked of hq (`hum.speak`), in the background: hq
 *    sends the kind's words made for the voice that it has not sent yet, and makes one more, so the set fills. A laugh
 *    heard in the person's voice asks for the laugh too. Each sound is kept as it comes (`hum.sound`).
 * 3. **Play** (`backchannel.sound`) when a sound is due (`backchannel.hum`): a word of the due kind, picked at random
 *    among those here in its tone, never one of the last three played; else nothing (`backchannel.unplayed`, why).
 *    Never a word of another kind or tone, and never later: a sound not playable at its breath is dropped. Never over
 *    the person, never while any of the agent's audio plays or the agent holds the floor. One the speaker could not
 *    start counts as never played. Under `hums_off` nothing is asked for: it could not play.
 *
 * The sounds are kept per agent voice on hq's disk; here, in the page's memory for the voice session only.
 */
import type { FloorState, VoiceEventInput, VoiceEventOf } from '../events'
import type { Component } from '../runtime/types'
import { backchannelOn, type VoiceSettings } from '../settings'
import type { ListenStyleState } from '../pacing/style'
import { soundKey, type HumKind, type HumTone } from './kinds'
import { isKindWord, pickWord, WARM_SOUNDS } from './library'
import { laughDue, laughHeard } from './laugh'

type Kept = { tone: HumTone; words: string; made: 'new' | 'kept' }

type State = {
  sounds: Record<string, Kept>
  /** The words of the last three sounds played, oldest first: none of them is picked. */
  recent: string[]
  /** The common sounds were asked for this often, last at `warmAt`; a sound has come (`warmed`): no more asks. */
  warmed: boolean
  warmTries: number
  warmAt: number | null
  /** Sounds picked so far: varies the pick. */
  picks: number
  /** When the person's current pause began; null while they speak. */
  pausedAt: number | null
  floor: FloorState
  replyPlaying: boolean
  soundPlaying: boolean
  laughUntil: number | null
  /** The sound last started, until the speaker says it played: one it could not start gives its speech back. */
  started: { key: string; speechMs: number } | null
  hums: ListenStyleState['hums']
}

type Step = { state: State; emit: VoiceEventInput[] }

const RECENT = 3

export const WARM_AGAIN_MS = 2_000
export const WARM_TRIES = 5

const SPEAKING: ReadonlySet<FloorState> = new Set(['agent-speaking', 'ducked'])
const HOLDS: ReadonlySet<FloorState> = new Set(['agent-thinking', 'hand-raised'])

const agentAudio = (state: State) => state.replyPlaying || state.soundPlaying || SPEAKING.has(state.floor)

/** Why a sound may not start now; null when it may. */
const heldBack = (state: State): string | null =>
  state.pausedAt === null ? 'you were speaking' : agentAudio(state) ? 'the agent was speaking' : HOLDS.has(state.floor) ? 'the agent held the floor' : null

const nothing = (state: State): Step => ({ state, emit: [] })

/** A number in [0, 1) from the time and the picks so far: the same events pick the same word, different breaths vary. */
function chance(t: number, n: number): number {
  const x = Math.sin(t * 12.9898 + (n + 1) * 78.233) * 43_758.5453
  return x - Math.floor(x)
}

const ask = (state: State, t: number, hum: HumKind, tone: HumTone): Step =>
  (state.hums === 'off' ? nothing(state) : { state, emit: [{ kind: 'hum.speak', hum, tone, t }] })

function warm(state: State, t: number, settings: VoiceSettings): Step {
  if (state.warmed || state.warmTries >= WARM_TRIES || !backchannelOn(settings) || state.hums === 'off') return nothing(state)
  if (state.warmAt !== null && t - state.warmAt < WARM_AGAIN_MS) return nothing(state)
  return {
    state: { ...state, warmTries: state.warmTries + 1, warmAt: t },
    emit: WARM_SOUNDS.map(s => ({ kind: 'hum.speak' as const, hum: s.kind, tone: s.tone, warm: true as const, t })),
  }
}

const unplayed = (state: State, t: number, why: string, speechMs: number): Step => ({
  state,
  emit: [{ kind: 'backchannel.unplayed', why, speechMs, pausedMs: state.pausedAt === null ? null : t - state.pausedAt, t }],
})

function due(state: State, e: VoiceEventOf<'backchannel.hum'>): Step {
  const why = heldBack(state)
  if (why) return unplayed(state, e.t, why, e.speechMs)
  const made = Object.values(state.sounds).filter(s => s.tone === e.tone && isKindWord(e.hum, s.words)).map(s => s.words)
  const words = pickWord(e.hum, made, state.recent, () => chance(e.t, state.picks))
  if (words === null) {
    return unplayed(state, e.t, made.length === 0
      ? `no ${e.hum} sound in a ${e.tone} tone made yet`
      : `every ${e.hum} sound made in a ${e.tone} tone was among the last ${RECENT} played`, e.speechMs)
  }
  const key = soundKey(words, e.tone)
  const sound = state.sounds[key]!
  return {
    state: { ...state, picks: state.picks + 1, started: { key, speechMs: e.speechMs }, sounds: { ...state.sounds, [key]: { ...sound, made: 'kept' } } },
    emit: [{
      kind: 'backchannel.sound', key, words: sound.words, hum: e.hum, tone: sound.tone, made: sound.made,
      pausedMs: state.pausedAt === null ? null : e.t - state.pausedAt, t: e.t,
    }],
  }
}

/** The speaker could not start the sound: it never played, and its speech counts again. */
function refused(state: State, t: number, why: string): Step {
  const s = state.started
  return s ? unplayed({ ...state, started: null }, t, why, s.speechMs) : nothing(state)
}

export const keeper: Component<State> = {
  name: 'soundKeeper',
  accepts: ['hum.held', 'hum.sound', 'backchannel.hum', 'backchannel.played', 'clock.tick', 'acoustic.silence', 'orchestration.floor', 'playback.at',
    'phrase.at', 'tone.voice', 'listen.style'],
  init: () => ({
    sounds: {}, recent: [], warmed: false, warmTries: 0, warmAt: null, picks: 0, pausedAt: null, floor: 'open', replyPlaying: false, soundPlaying: false, laughUntil: null,
    started: null, hums: 'on',
  }),
  step(state, event, settings: VoiceSettings) {
    const keep = (patch: Partial<State> = {}): Step => nothing({ ...state, ...patch })
    switch (event.kind) {
      case 'hum.held':
        if (event.fallback || !event.humKind || event.humKind === 'none' || !event.tone) return keep()
        return ask(state, event.t, event.humKind, event.tone)
      case 'tone.voice': {
        const laughUntil = laughHeard(event, settings, agentAudio(state), state.laughUntil)
        const next = { ...state, laughUntil }
        const asked = laughUntil !== state.laughUntil && backchannelOn(settings) && laughDue(laughUntil, event.t)
        return asked ? ask(next, event.t, 'amusement', 'bright') : nothing(next)
      }
      case 'hum.sound':
        if (!event.ok) return keep({ warmed: true })
        return keep({ warmed: true, sounds: { ...state.sounds, [event.key]: { tone: event.tone, words: event.words, made: event.made ?? 'kept' } } })
      case 'backchannel.hum':
        return due(state, event)
      case 'backchannel.played':
        if (event.text === null) return refused(state, event.t, event.why ?? 'the speaker could not start it')
        return keep({ started: null, recent: [...state.recent, event.text].slice(-RECENT) })
      case 'listen.style':
        return keep({ hums: event.state.hums })
      case 'clock.tick':
        return warm(state, event.t, settings)
      case 'acoustic.silence':
        return keep({ pausedAt: event.silent ? event.t : null })
      case 'orchestration.floor':
        return keep({ floor: event.state })
      case 'playback.at':
        return keep({ replyPlaying: event.playing })
      case 'phrase.at':
        return keep({ soundPlaying: event.playing })
      default:
        return keep()
    }
  },
}
