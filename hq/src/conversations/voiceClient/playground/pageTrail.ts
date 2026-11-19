/**
 * What the Log keeps of the page's own voice events, beside what the server tells it: when the person began speaking,
 * their words as they grew, the sound model ending their turn (with its verdicts before it), each light model check
 * as it was asked and answered, each line as it began and stopped playing, each backchannel hum and why it came, each
 * pause it let pass and why (a near miss), and
 * each time you stopped the reply by speaking over it. Times are on the page's clock (ms since the epoch), mapped from the events' capture clock once per
 * voice runtime.
 *
 * SOUND's end is placed when the sound side ended the turn, with the check that caused it, not at its verdict: over a
 * reply, the verdict can come before your words reach the page. When you stopped speaking, as it heard, is `stoppedAt`.
 */
import { profileWords } from '../tone/voiceProfile'
import type { VoiceListenAction, VoiceListenMoment } from '@agenthix/core'
import type { FloorState, VoiceEvent } from '../events'
import type { Learned } from '../pacing/pace'
import { isNormal, NORMAL_STYLE, type ListenStyleState } from '../pacing/style'

/** The sound model ended the turn: the verdict that did it, if one did, and how many said "not finished" before it. */
export type SoundEnd = {
  at: number; stoppedAt: number; confidence: number | null; silenceMs: number | null; by: 'model' | 'fallback' | 'cap'; notFinished: number
  /** The sound model was not sure, and its pause limit ended the turn: its verdict came at the limit. */
  atLimit?: boolean
  /** False finishes this turn, the learned pace or `patient` made READY wait for this much quiet. */
  waitedMs?: number
  paced?: boolean; patient?: boolean
  /** It was a false finish: you went on `afterMs` after it, the `count`th this turn, and READY now waits `waitMs`. */
  falseFinish?: { afterMs: number; count: number; waitMs: number }
}
export type TrailAsk = { at: number; call: number; moment: VoiceListenMoment; quietMs: number; workingMs?: number; keptOpen?: boolean }
export type TrailAnswer = {
  at: number; call: number; action: VoiceListenAction; lineId?: string; say?: string
  turn?: 'closed' | 'handedOver' | 'fallback'; turnId?: string; off?: boolean
}
export type TrailPlay = { lineId: string; text: string; start: number; end: number | null }
/** A light model's line dropped, never heard, and why: as its answer came (`call`), or as it would have started. */
export type TrailDrop = { at: number; lineId: string; call?: number; why: string }
/**
 * A backchannel sound: why it was due, its kind and tone, and the answer they came from (`fromAt`, that answer's time,
 * and how long its call took), or why something stood in (`fallback`); what played (`text`, the word the keeper picked;
 * `made`, made new for the voice in this conversation, else already made; `playedAtMs`, how far into the pause it
 * started), or why nothing did. `notYet`: as the light model kept the turn open; `inWait`: READY, held by the false-finish wait;
 * `reactionSpacing`, `reactionHeld`: a reaction hum, due on less speech, or kept over a plainer answer.
 */
export type TrailHum = {
  at: number; pausedMs: number; verdict: string | null; speechMs: number; notYet?: boolean; inWait?: boolean; text: string | null; why?: string
  reactionSpacing?: boolean; reactionHeld?: boolean; laugh?: boolean
  kind: string; tone: string; fromAt?: number; fromMs?: number; fallback?: string
  made?: 'new' | 'kept'; playedAtMs?: number | null
}
/**
 * One answer of the hum service: held, or `dropped` (too late, or for words already sent), with its call's time;
 * `atPause`: its question was asked as a pause began.
 */
export type TrailHumAnswer = {
  at: number; kind: string | null; tone: string | null; ms: number; skipped: number; dropped?: boolean; waitedMs?: number
  fallback?: string; atPause?: boolean
}
/** A voice profile reading that changed, its words (`happy 0.71 · laughing 0.83`), and how many readings came so far. */
export type TrailVoice = { at: number; words: string; final: boolean; count: number }
/** The voice hint as it changed: how you sound (a voice profile label), or none. */
export type TrailTone = { at: number; hint: string | null }
/** A pause with no hum, placed where the pause began, and the rule that held it back. */
export type TrailMiss = { at: number; why: string; pausedMs: number | null }
/** The pace in force as the sound model ended a turn: breaths heard, and what they set once learned. */
export type TrailPace = { at: number; heard: number; learned: Learned | null; style: ListenStyleState }
/** The listening style changed: as the reply asked (`asked`), or held from earlier (`restored`). */
export type TrailStyle = { at: number; state: ListenStyleState; asked?: string; restored?: boolean }

export type PageTrail = {
  speechStarts: number[]
  words: { at: number; text: string }[]
  sounds: SoundEnd[]
  asks: TrailAsk[]
  answers: TrailAnswer[]
  plays: TrailPlay[]
  drops: TrailDrop[]
  /** When you stopped the reply by speaking over it: a stop word, or enough words of your own. */
  stops: number[]
  hums: TrailHum[]
  misses: TrailMiss[]
  humAnswers: TrailHumAnswer[]
  paces: TrailPace[]
  styles: TrailStyle[]
  voices: TrailVoice[]
  tones: TrailTone[]
}

export const emptyTrail = (): PageTrail => ({
  speechStarts: [], words: [], sounds: [], asks: [], answers: [], plays: [], drops: [], stops: [], hums: [], misses: [], humAnswers: [], paces: [], styles: [],
  voices: [], tones: [],
})

const KEPT = 2_000
const PERSON: ReadonlySet<FloorState> = new Set(['person-speaking', 'person-pausing'])
/** You began speaking: from a quiet floor, or over the reply, which ducks it. */
const STARTS: ReadonlySet<FloorState> = new Set(['person-speaking', 'ducked'])

function push<T>(list: T[], item: T): void {
  list.push(item)
  if (list.length > KEPT) list.splice(0, list.length - KEPT)
}

/** A reader for one voice runtime, writing into `trail`; true when it changed what the Log shows. */
/** `pauseCapMs`: the sound model's pause limit, at which it ends a turn however unsure it is. */
export function createTrailReader(trail: PageTrail, now: () => number = Date.now, pauseCapMs?: number) {
  let offset: number | null = null
  let floor: FloorState = 'open'
  let verdict: { at: number; confidence: number | null; silenceMs: number; by: 'model' | 'fallback' } | null = null
  let notFinished = 0
  let readyAt: number | null = null
  let lastWords = ''
  let humDue: Omit<TrailHum, 'text' | 'why'> | null = null
  // Null until adaptive pacing has said anything: a card has no PACE row without it, or a style asked for.
  let pace: { heard: number; learned: Learned | null } | null = null
  let style: ListenStyleState = NORMAL_STYLE
  let readings = 0
  return (event: VoiceEvent): boolean => {
    offset ??= now() - event.t
    const at = event.t + offset
    switch (event.kind) {
      case 'orchestration.floor': {
        const was = floor
        floor = event.state
        if (!STARTS.has(event.state) || PERSON.has(was) || was === 'ducked') return false
        // A verdict on words before these (a stop word alone, which the turn dropped) is not theirs.
        verdict = null
        notFinished = 0
        push(trail.speechStarts, at)
        return true
      }
      case 'stt.utterance':
        if (event.text === lastWords) return false
        lastWords = event.text
        push(trail.words, { at, text: event.text })
        return true
      case 'semantics.decision':
        if (event.answer === 'READY') verdict = { at, confidence: event.confidence, silenceMs: event.silenceMs, by: event.by }
        else notFinished++
        return false
      case 'orchestration.ready':
      case 'orchestration.send': {
        // The listening runtime's own sends follow a ready, or go with a check: the sound model did not end a turn there.
        if (event.kind === 'orchestration.send' && (event.via === 'listen' || readyAt === event.t)) return false
        if (event.kind === 'orchestration.ready') readyAt = event.t
        const v = verdict
        push(trail.sounds, v
          ? {
            at, stoppedAt: v.at - v.silenceMs, confidence: v.confidence, silenceMs: v.silenceMs, by: v.by, notFinished,
            ...(v.by === 'model' && pauseCapMs !== undefined && v.silenceMs >= pauseCapMs && { atLimit: true }),
            ...(event.kind === 'orchestration.ready' && event.waitedMs !== undefined && { waitedMs: event.waitedMs }),
            ...(event.kind === 'orchestration.ready' && event.paced && { paced: true }),
            ...(event.kind === 'orchestration.ready' && event.patient && { patient: true }),
          }
          : { at, stoppedAt: at, confidence: null, silenceMs: null, by: 'cap', notFinished })
        if (pace || !isNormal(style)) push(trail.paces, { at, heard: 0, learned: null, ...pace, style })
        verdict = null
        notFinished = 0
        return true
      }
      case 'orchestration.falseFinish': {
        const sound = trail.sounds.at(-1)
        if (!sound) return false
        sound.falseFinish = { afterMs: event.afterMs, count: event.count, waitMs: event.waitMs }
        return true
      }
      case 'orchestration.pace':
        pace = { heard: event.heard, learned: event.learned }
        return false
      case 'listen.style':
        style = event.state
        push(trail.styles, {
          at, state: event.state, ...(event.asked && { asked: event.asked }), ...(event.restored && { restored: true }),
        })
        return true
      case 'listen.drop':
        if (trail.drops.some(d => d.lineId === event.lineId)) return false
        push(trail.drops, { at, lineId: event.lineId, ...(event.call !== undefined && { call: event.call }), why: event.why })
        return true
      case 'orchestration.playback':
        if (event.action !== 'stop' || (event.by !== 'stop-word' && event.by !== 'words')) return false
        push(trail.stops, at)
        return true
      case 'listen.ask':
        push(trail.asks, {
          at, call: event.call, moment: event.moment, quietMs: event.quietMs,
          ...(event.workingMs !== undefined && { workingMs: event.workingMs }), ...(event.keptOpen && { keptOpen: true }),
        })
        return true
      case 'listen.answer':
        push(trail.answers, {
          at, call: event.call, action: event.action,
          ...(event.lineId && { lineId: event.lineId }), ...(event.say && { say: event.say }), ...(event.turn && { turn: event.turn }),
          ...(event.turnId && { turnId: event.turnId }), ...(event.off && { off: true }),
        })
        return true
      case 'backchannel.hum':
        humDue = {
          at, pausedMs: event.pausedMs, verdict: event.verdict, speechMs: event.speechMs, ...(event.notYet && { notYet: true }),
          ...(event.inWait && { inWait: true }), ...(event.reactionSpacing && { reactionSpacing: true }), ...(event.reactionHeld && { reactionHeld: true }),
          ...(event.laugh && { laugh: true }), kind: event.hum, tone: event.tone,
          ...(event.from && { fromAt: event.from.at + offset, fromMs: event.from.ms }),
          ...(event.fallback && { fallback: event.fallback }),
        }
        return false
      case 'hum.held':
        push(trail.humAnswers, {
          at, kind: event.humKind, tone: event.tone, ms: event.ms, skipped: event.skipped, ...(event.fallback && { fallback: event.fallback }),
          ...(event.atPause && { atPause: true }),
        })
        return true
      case 'hum.dropped':
        push(trail.humAnswers, {
          at, kind: event.humKind, tone: event.tone, ms: event.ms, skipped: event.skipped, dropped: true, waitedMs: event.waitedMs,
          ...(event.atPause && { atPause: true }),
        })
        return true
      case 'tone.voice': {
        readings++
        const words = profileWords(event)
        if (!words || trail.voices.at(-1)?.words === words) return false
        push(trail.voices, { at, words, final: event.final, count: readings })
        return true
      }
      case 'tone.hint':
        push(trail.tones, { at, hint: event.hint })
        return true
      case 'backchannel.miss':
        push(trail.misses, { at: at - (event.pausedMs ?? 0), why: event.why, pausedMs: event.pausedMs })
        return true
      case 'backchannel.played': {
        if (!humDue) return false
        push(trail.hums, {
          ...humDue, text: event.text, ...(event.why && { why: event.why }),
          ...(event.made !== undefined && { made: event.made }), ...(event.pausedMs !== undefined && { playedAtMs: event.pausedMs }),
        })
        humDue = null
        return true
      }
      case 'backchannel.unplayed': {
        if (!humDue) return false
        push(trail.hums, { ...humDue, text: null, why: event.why })
        humDue = null
        return true
      }
      case 'phrase.at': {
        if (!event.lineId) return false
        const play = trail.plays.findLast(p => p.lineId === event.lineId)
        if (event.playing) {
          if (play && play.end === null) return false
          push(trail.plays, { lineId: event.lineId, text: event.text, start: at, end: null })
          return true
        }
        if (!play || play.end !== null) return false
        play.end = at
        return true
      }
      default:
        return false
    }
  }
}
