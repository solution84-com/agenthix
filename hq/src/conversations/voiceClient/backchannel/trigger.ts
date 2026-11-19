/**
 * The backchannel (adaptive voice listening, spec §The backchannel): when a small sound of listening ("Mm-hm.") plays
 * while the person talks. Rules, with no model call, so it is never late. A hum is due:
 *
 * - **In a pause** of `pauseMs` to `latestPauseMs` whose latest verdict from the sound model says they have not
 *   finished (KEEP_LISTENING or UNCERTAIN), or says READY while the false-finish wait holds it (`orchestration.finishHeld`:
 *   the turn is not sent yet, until the wait runs out); or
 * - **as the light model keeps the turn open**: a *sounds finished* call answered "not yet" with no line of its own
 *   means they paused at a sentence end mid-telling. It hums on the next tick, while they are still quiet, whatever the
 *   sound model said. An answer with a line never hums: one sound at a time. A line dropped because they spoke again
 *   (`listen.drop`) is no line: that answer is a "not yet" with nothing said.
 *
 * Either way only when they have spoken `speechMs`, summed, since the agent last made any sound (a reply, a line, a
 * stored phrase, a hum), which is the only spacing between hums (`reactionSpeechMs` for a reaction hum, `./reaction`);
 * at most once a pause; not after a question; never while the agent holds the floor or any of its audio plays; and
 * never once their turn is handed over (until the reply plays) or closed (until they speak again).
 *
 * A pause with no hum says why (`backchannel.miss`, the one rule that held it back, for the playground's Log) as it
 * ends, unless it ended the turn: then a "not yet" says its own, and a hand over nothing.
 *
 * Which sound is the listening read's (`./service`): the latest answer it holds this turn — kind and tone — as
 * the sound comes due; it outlives a send, since a turn kept open is still the same turn, and is forgotten when the turn
 * is handed over or closed. A reaction it answered stays held over plainer answers for a while, or until it plays
 * (`./reaction`); a reaction read is used once, at the breath it came due, played or not, and two reactions in a row
 * need a listening hum or `reactionGapSpeechMs` of speech between them. `none` plays nothing, and is a near miss that leaves the speech count as it was. When a read fails or
 * runs out of time, the answer before it stands; with none, or with the read off, a calm continuer stands in. While its first answer is still on the way, nothing plays (a near miss).
 * The spacing follows the kind's timing class (`./kinds`): *listen* needs `speechMs`, *react* and *laugh*
 * `reactionSpeechMs`.
 *
 * Adaptive pacing (`../pacing`) moves the latest a hum may start to the person's own breaths, once learned; the
 * listening style they asked for stops the hums (`hums_off`, a near miss each pause) or spaces them further (`hums_fewer`).
 *
 * It runs with the flag `voiceListener` and the backchannel's own switch on, with Adaptive voice on unless the settings
 * let the switch alone decide (`backchannelAlone`), until hq answers `off`. With the light model off it hums on the
 * sound model alone: KEEP_LISTENING or UNCERTAIN by the pause rules, READY never (the turn goes as plain voice), and a
 * plain send ends the turn, forgetting the hum service's answers about it.
 * It only says a sound is due (`backchannel.hum`), its kind and tone; the sound keeper (`./keeper`) picks a word of that
 * kind made in that tone and starts it at once, or says why none started (`backchannel.unplayed`), and then the speech
 * it counted is given back. A hum belongs
 * to no turn: it starts, ends and keeps open nothing, nothing in `../listener` reads it, and hq never hears of it.
 */
import type { FloorState, TurnAnswer, VoiceEventInput } from '../events'
import type { Component } from '../runtime/types'
import { backchannelOn, lightModelOn, type VoiceSettings } from '../settings'
import type { VoiceHumKind } from '@agenthix/core'
import { endsOnQuestion } from './question'
import { isHumKind, type HumKind, type HumTone } from './kinds'
import { HUM_STALE_MS } from './settings'
import { afterSound, isReaction, keepReaction, liveReaction, reactionTooSoon, spentReaction, type KeptReaction } from './reaction'
import { inForce, type Learned } from '../pacing/pace'
import type { ListenStyleState } from '../pacing/style'
import { laughDue, laughHeard } from './laugh'

type Failed = 'off' | 'timeout' | 'failed'

/** The listening read's latest usable answer this turn. */
type Held = { call: number; humKind: VoiceHumKind; tone: HumTone | null; at: number; askedAt: number; ms: number }

type State = {
  /** hq answered `off`: no light model listens, so voice is plain and says nothing until the reply. */
  off: boolean
  floor: FloorState
  /** When the pause began; null while they speak. */
  pausedAt: number | null
  /** When their voice began, while they speak. */
  speakingSince: number | null
  /** Their speech, summed, since the agent's last sound. */
  speechMs: number
  /** The sound model's latest verdict in this pause. */
  verdict: TurnAnswer | null
  /** This pause has had its hum. */
  hummed: boolean
  /** Why this pause has no hum yet, as of its window's last tick. */
  heldBy: string | null
  /** This pause's near miss is said, or is not this pause's to say (it had its hum, or a "not yet" said its own). */
  settled: boolean
  /** Their words were sent in this pause: it ended the turn, so the pause says no near miss of its own. */
  sent: boolean
  /** The latest *sounds finished* call, and the one whose answer was read: an answer delivered again is read once. */
  finishedCall: number | null
  readCall: number | null
  /** A "not yet" with no line just came: judged on the next tick, once the floor has followed it. */
  notYet: boolean
  /** The agent's audio playing: a reply, a line or a stored phrase. */
  replyPlaying: boolean
  soundPlaying: boolean
  text: string
  held: Held | null
  /** The read's latest call gave no answer, and why: the held one, if any, stands in. */
  failed: Failed | null
  /** The hum service's latest reaction answer, held over plainer ones until it plays or its hold runs out. */
  reaction: KeptReaction<Held> | null
  /** When the hum service's question in flight was asked; null with none. */
  asking: number | null
  /** The service's last question came back too late: it ran out of time. */
  lateAnswer: boolean
  /** An answer to the latest *sounds finished* call carried a line: whether it played or was dropped says what it meant. */
  lineAnswer: { lineId: string } | null
  /** The turn was handed over (no hum until the reply plays) or closed (none until they speak again). */
  ended: 'handedOver' | 'closed' | null
  /** This pause's READY is held by the false-finish wait until then; null with none, once sent, or once they go on. */
  heldUntil: number | null
  /** The pace learned from the person's breaths, and the hums they asked for. */
  learned: Learned | null
  hums: ListenStyleState['hums']
  /** A laugh heard in their voice may be answered until then (`./laugh`); null with none. */
  laughUntil: number | null
  /** The call of the last reaction read that came due: spent, it never plays at a later breath. */
  spent: number | null
  /** Their speech since the last reaction played, while no listen-class hum has played since; null with none. */
  sinceReactionMs: number | null
}

/** The agent's voice is heard. */
const SPEAKING: ReadonlySet<FloorState> = new Set(['agent-speaking', 'ducked'])
/** The agent holds the floor, or will. */
const HOLDS: ReadonlySet<FloorState> = new Set(['agent-thinking', 'hand-raised'])

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`

const isOn = (settings: VoiceSettings, state: State) => backchannelOn(settings) && !state.off

/** The agent made a sound: the person's speech counts again from now. */
const agentSound = (state: State, t: number, patch: Partial<State>): State =>
  ({ ...state, ...patch, speechMs: 0, speakingSince: state.speakingSince === null ? null : t })

/** READY is held by the false-finish wait now: the turn is not sent, so it is no finish yet. */
const inWait = (state: State, t: number) => state.verdict === 'READY' && state.heldUntil !== null && t < state.heldUntil

/** The speech a hum needs since the agent's last sound, plain or a reaction: more when the person asked for fewer. */
const spacing = (state: State, settings: VoiceSettings, reaction: boolean) =>
  (reaction ? settings.backchannel.reactionSpeechMs : settings.backchannel.speechMs) * (state.hums === 'fewer' ? settings.pacing.fewerTimes : 1)

/** The speech two reactions in a row need between them: more when the person asked for fewer. */
const gapOf = (state: State, settings: VoiceSettings) =>
  settings.backchannel.reactionGapSpeechMs * (state.hums === 'fewer' ? settings.pacing.fewerTimes : 1)

/** The one rule that holds a hum back now, in the order a person would look for it; null when none does. */
function heldBy(state: State, t: number, settings: VoiceSettings, notYet: boolean, now: KindNow): string | null {
  if (state.ended === 'handedOver') return 'the turn was handed over'
  if (state.ended === 'closed') return 'the light model closed the turn'
  if (state.replyPlaying || state.soundPlaying || SPEAKING.has(state.floor)) return 'the agent was speaking'
  if (HOLDS.has(state.floor)) return 'the agent held the floor'
  if (state.hums === 'off') return 'you asked for no hums'
  if (endsOnQuestion(state.text)) return 'after a question'
  if (!notYet && state.verdict === 'READY' && !inWait(state, t)) return 'the sound model said finished'
  if (!notYet && state.verdict === null) return 'no verdict from the sound model yet'
  const reaction = reactionDue(now)
  const needMs = spacing(state, settings, !!reaction)
  if (state.speechMs < needMs) {
    return `only ${secs(state.speechMs)} of speech since the agent's last sound${reaction ? ` (a ${reaction} hum needs ${secs(needMs)})` : ''}`
  }
  return reaction ? reactionTooSoon(state.sinceReactionMs, gapOf(state, settings)) : null
}

type Step = { state: State; emit: VoiceEventInput[] }

const miss = (state: State, t: number, why: string): Step => ({
  state: { ...state, settled: true },
  emit: [{ kind: 'backchannel.miss', why, pausedMs: state.pausedAt === null ? null : t - state.pausedAt, t }],
})

const FAILED: Record<Failed, string> = {
  off: 'no hum service is reached here', timeout: 'the hum service ran out of time', failed: 'the hum service failed',
}

type KindNow = {
  hum: HumKind; tone: HumTone; from?: { call: number; at: number; ms: number }; fallback?: string
  /** A reaction kept over a plainer answer that came after it. */
  heldOver?: true
  /** A laugh back: their voice laughed (`./laugh`). */
  laugh?: true
} | { miss: string }

/** The reaction kind about to play, if it is one: a calm continuer standing in is none. */
const reactionDue = (now: KindNow): HumKind | null => ('hum' in now && (now.from || now.laugh) && isReaction(now.hum) ? now.hum : null)

const calm = (fallback: string): KindNow => ({ hum: 'continuer', tone: 'calm', fallback })

const of = (held: Held, fallback?: string): KindNow => ({
  hum: held.humKind as HumKind, tone: held.tone ?? 'calm', from: { call: held.call, at: held.at, ms: held.ms }, ...(fallback && { fallback }),
})

/** The sound to play now, from the held answer; the one before a failed call, or a calm continuer; or none, and why. */
function kindNow(state: State, t: number, settings: VoiceSettings): KindNow {
  const held = state.held
  if (laughDue(state.laughUntil, t)) return { hum: 'amusement', tone: 'bright', laugh: true }
  if (!settings.backchannel.serviceOn) return calm('the hum service is off')
  const reaction = liveReaction(state.reaction, t)
  // A `none` about the words this pause follows wins for this pause: at a pause it means a question, or a cut-off end.
  if (reaction && held?.humKind === 'none' && state.pausedAt !== null && held.at >= state.pausedAt) {
    return { miss: `the hum service said none as you paused, over the ${reaction.humKind} held` }
  }
  if (reaction && !spentReaction(reaction, state.spent)) {
    const r = of(reaction)
    return reaction === held ? r : { ...r, heldOver: true }
  }
  if (held) {
    // `none`: nothing plays, so the agent made no sound and their speech goes on counting.
    if (held.humKind === 'none') return { miss: 'the hum service said none' }
    if (spentReaction(held, state.spent)) return { miss: `the hum service's ${held.humKind} was for an earlier breath` }
    return of(held, state.failed ? `${FAILED[state.failed]}: its last answer stands` : undefined)
  }
  if (state.failed) return calm(FAILED[state.failed])
  if (state.lateAnswer || (state.asking !== null && t - state.asking >= HUM_STALE_MS)) return calm(FAILED.timeout)
  return { miss: 'no answer from the hum service yet' }
}

function hum(state: State, t: number, notYet: boolean, settings: VoiceSettings, now: KindNow): Step {
  if ('miss' in now) return miss(state, t, now.miss)
  const { hum: kind, tone, from, fallback, heldOver, laugh } = now
  const reactionSpacing = !!reactionDue(now) && state.speechMs < spacing(state, settings, false)
  return {
    // The hum is the agent's sound: their speech counts again from it, played or not. A reaction held is now spent.
    state: {
      ...state, hummed: true, settled: true, speechMs: 0, reaction: null, laughUntil: null,
      ...(from && isReaction(kind) && { spent: from.call }),
    },
    emit: [{
      kind: 'backchannel.hum', pausedMs: t - state.pausedAt!, verdict: state.verdict, speechMs: state.speechMs,
      ...(notYet && { notYet: true as const }), ...(!notYet && inWait(state, t) && { inWait: true as const }), hum: kind, tone,
      ...(from && { from }), ...(fallback && { fallback }),
      ...(reactionSpacing && { reactionSpacing: true as const }), ...(heldOver && { reactionHeld: true as const }), ...(laugh && { laugh: true as const }), t,
    }],
  }
}

/** The latest a sound may start into a pause: the learned pace's, once learned, never before the pause rule's start. */
const latestPause = (state: State, settings: VoiceSettings) =>
  Math.max(settings.backchannel.pauseMs, inForce(state.learned, settings)?.latestPauseMs ?? settings.backchannel.latestPauseMs)

function tick(state: State, t: number, settings: VoiceSettings): Step {
  if (state.notYet) {
    const s = { ...state, notYet: false }
    if (s.pausedAt === null) return miss(s, t, 'you spoke again before the light model said not yet')
    if (s.hummed) return { state: s, emit: [] }
    const now = kindNow(s, t, settings)
    const why = heldBy(s, t, settings, true, now)
    return why ? miss(s, t, why) : hum(s, t, true, settings, now)
  }
  if (state.pausedAt === null || state.settled) return { state, emit: [] }
  const pausedMs = t - state.pausedAt
  if (pausedMs < settings.backchannel.pauseMs || pausedMs > latestPause(state, settings)) return { state, emit: [] }
  const now = kindNow(state, t, settings)
  const why = heldBy(state, t, settings, false, now)
  return why ? { state: why === state.heldBy ? state : { ...state, heldBy: why }, emit: [] } : hum(state, t, false, settings, now)
}

/** Their voice again: the pause that ended says why it had no hum, unless it is settled or ended the turn. */
function resumed(state: State, t: number, settings: VoiceSettings): Step {
  const next: State = {
    ...state, speakingSince: t, pausedAt: null, verdict: null, hummed: false, heldBy: null, settled: false, sent: false, heldUntil: null,
    ended: state.ended === 'closed' ? null : state.ended,
  }
  if (state.pausedAt === null || state.settled || state.sent || !isOn(settings, state)) return { state: next, emit: [] }
  const why = state.heldBy ?? `the pause ended at ${secs(t - state.pausedAt)}`
  return { state: next, emit: miss(state, t, why).emit }
}

/** hq's answer to the latest *sounds finished* call, once: "not yet" with no line hums; with a line, says why not. */
function answered(state: State, e: { call: number; action: string; lineId?: string; say?: string; turn?: string; t: number }): Step {
  if (e.call !== state.finishedCall || e.call === state.readCall) return { state, emit: [] }
  const s = { ...state, readCall: e.call }
  if (e.turn) return { state: s, emit: [] }
  // Whether the line plays or is dropped (they spoke again) comes next, from the listening runtime.
  if (e.lineId) return { state: { ...s, lineAnswer: { lineId: e.lineId } }, emit: [] }
  if (e.say) return lineSaid(s, e.t)
  return noLine(s, e.action)
}

const lineSaid = (state: State, t: number): Step => (state.hummed ? { state, emit: [] } : miss(state, t, 'the light model said a line of its own'))
const noLine = (state: State, action: string): Step => ({ state: action === 'keep_listening' ? { ...state, notYet: true } : state, emit: [] })

/** The line of the answer just read plays, or is dropped: a dropped line is no line, so the answer is a plain "not yet". */
function lineFate(state: State, e: { kind: 'listen.play' | 'listen.drop'; lineId: string; t: number }): Step {
  const answer = state.lineAnswer
  if (answer?.lineId !== e.lineId) return { state, emit: [] }
  const s = { ...state, lineAnswer: null }
  // The answer kept the turn open (it named no turn): with its line never heard, that is a "not yet" with nothing said.
  return e.kind === 'listen.play' ? lineSaid(s, e.t) : noLine(s, 'keep_listening')
}

/** The turn ends: the hum service's answers were about it, and none plays until the next. */
const turnEnded = (state: State, ended: 'handedOver' | 'closed'): State =>
  ({ ...state, ended, held: null, failed: null, reaction: null, asking: null, lateAnswer: false, notYet: false, lineAnswer: null, laughUntil: null })

export const backchannel: Component<State> = {
  name: 'backchannel',
  accepts: ['acoustic.silence', 'semantics.decision', 'orchestration.floor', 'orchestration.finishHeld', 'orchestration.ready',
    'orchestration.send', 'stt.utterance', 'playback.at',
    'phrase.at', 'listen.ask', 'listen.answer', 'listen.play', 'listen.drop', 'listen.turn', 'listen.sendPlain', 'reply.spoken',
    'hum.ask', 'hum.held', 'hum.dropped', 'backchannel.played', 'backchannel.unplayed', 'clock.tick', 'orchestration.pace', 'listen.style', 'tone.voice'],
  init: () => ({
    off: false, floor: 'open', pausedAt: null, speakingSince: null, speechMs: 0, verdict: null, hummed: false, heldBy: null,
    settled: false, sent: false, finishedCall: null, readCall: null, notYet: false, replyPlaying: false, soundPlaying: false, text: '',
    held: null, failed: null, reaction: null, asking: null, lateAnswer: false, lineAnswer: null, ended: null, heldUntil: null,
    learned: null, hums: 'on', laughUntil: null, spent: null, sinceReactionMs: null,
  }),
  step(state, event, settings) {
    const keep = (patch: Partial<State> = {}) => ({ state: { ...state, ...patch }, emit: [] })
    switch (event.kind) {
      case 'acoustic.silence': {
        if (!event.silent) return state.speakingSince !== null ? keep() : resumed(state, event.t, settings)
        if (state.speakingSince === null) return keep()
        return keep({
          speakingSince: null, pausedAt: event.t, speechMs: state.speechMs + (event.t - state.speakingSince), verdict: null,
          hummed: false, heldBy: null, settled: false, sent: false, heldUntil: null,
          sinceReactionMs: state.sinceReactionMs === null ? null : state.sinceReactionMs + (event.t - state.speakingSince),
        })
      }
      case 'semantics.decision':
        return state.pausedAt === null ? keep() : keep({ verdict: event.answer })
      case 'orchestration.floor':
        return keep({ floor: event.state })
      case 'orchestration.finishHeld':
        return state.pausedAt === null ? keep() : keep({ heldUntil: event.until })
      case 'orchestration.ready':
        // READY counted: the wait, if any, is over.
        return keep({ heldUntil: null })
      case 'orchestration.send':
        // In plain voice a send ends the turn: the hum service's answers were about it.
        return keep({ sent: true, heldUntil: null, ...(!event.via && !lightModelOn(settings) && { held: null, failed: null, reaction: null, asking: null, lateAnswer: false }) })
      case 'stt.utterance':
        // A send leaves the hum service's answer held: a turn kept open is still the turn it was about.
        return keep({ text: event.text })
      case 'hum.ask':
        // A question still open as the next goes out was given up: the service ran out of time on it.
        return keep({ asking: event.t, ...(state.asking !== null && { lateAnswer: true }) })
      case 'hum.held': {
        // No answer from this call: the one before it stands.
        if (event.fallback || event.humKind === null) return keep({ asking: null, lateAnswer: false, failed: event.fallback ?? 'failed' })
        const held: Held = { call: event.call, humKind: event.humKind, tone: event.tone, at: event.t, askedAt: event.askedAt, ms: event.ms }
        return keep({ asking: null, lateAnswer: false, failed: null, held, reaction: keepReaction(state.reaction, held, event.t, settings.backchannel.reactionHoldMs) })
      }
      case 'backchannel.played':
        // A reaction that played starts the count two in a row need; a listening hum ends it.
        return event.text !== null && isHumKind(event.hum) ? keep({ sinceReactionMs: afterSound(event.hum) }) : keep()
      case 'backchannel.unplayed':
        // The due sound never started: the agent made no sound, so the speech it counted counts again, and a "not yet"
        // later in this pause may still hum (the pause's own window stays settled).
        return keep({ speechMs: state.speechMs + event.speechMs, hummed: false })
      case 'hum.dropped':
        return keep({ asking: null, lateAnswer: true })
      case 'listen.turn':
        return event.state === 'notYet' ? keep() : keep(turnEnded(state, event.state))
      case 'listen.sendPlain':
        return keep(turnEnded(state, 'handedOver'))
      case 'listen.play':
      case 'listen.drop':
        return isOn(settings, state) ? lineFate(state, event) : keep()
      case 'reply.spoken':
        // The reply ended with nothing spoken: the turn handed over is done with.
        return event.sentences === 0 && state.ended === 'handedOver' ? keep({ ended: null }) : keep()
      case 'playback.at':
        // The reply plays: the turn it answers is over, and the next begins.
        return { state: agentSound(state, event.t, { replyPlaying: event.playing, ...(event.playing && state.ended === 'handedOver' && { ended: null }) }), emit: [] }
      case 'phrase.at':
        return { state: agentSound(state, event.t, { soundPlaying: event.playing }), emit: [] }
      case 'listen.ask':
        return event.moment === 'soundsFinished' ? keep({ finishedCall: event.call }) : keep()
      case 'listen.answer':
        if (event.off) return keep({ off: true, notYet: false })
        return isOn(settings, state) ? answered(state, event) : keep()
      case 'clock.tick':
        return isOn(settings, state) ? tick(state, event.t, settings) : keep()
      case 'orchestration.pace':
        return keep({ learned: event.learned })
      case 'listen.style':
        return keep({ hums: event.state.hums })
      case 'tone.voice':
        return keep({ laughUntil: laughHeard(event, settings, state.replyPlaying || state.soundPlaying || SPEAKING.has(state.floor), state.laughUntil) })
      default:
        return keep()
    }
  },
}
