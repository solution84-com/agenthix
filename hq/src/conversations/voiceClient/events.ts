/**
 * The contract between voice's components in the browser (adaptive voice spec, How it is built and tested). Every
 * component talks only through these events; the runtime delivers them through bounded queues and keeps a log of
 * them, which is also the measurements and a recording to replay.
 *
 * Every event carries `t`, when what it describes happened on the capture clock (ms, the clock `Clock.now` reads),
 * and `seq`, its order, assigned by the runtime. Events that belong to a reply carry its `replyId`: hq's turn id,
 * the generation id that lets anything from a cancelled reply be dropped wherever it is.
 */

import type { VoiceHint, VoiceHumKind, VoiceListenAction, VoiceListenMoment, VoiceListenStyle } from '@agenthix/core'
import type { HumKind, HumTone } from './backchannel/kinds'
import type { ListeningTier } from './orchestration/listeningTiers'
import type { Learned } from './pacing/pace'
import type { ListenStyleState } from './pacing/style'
import type { VoiceLabel } from './tone/voiceProfile'

// ── Shared shapes ──

/** A word as STT heard it, on the capture clock. */
export type TimedWord = { text: string; startAt: number; endAt: number }

export type RoomLabel = 'quiet' | 'steady-noise' | 'intermittent-noise' | 'other-voices' | 'wind'

export type FloorState =
  | 'open' | 'person-speaking' | 'person-pausing' | 'agent-thinking' | 'agent-speaking' | 'ducked' | 'hand-raised'

export type TurnAnswer = 'READY' | 'KEEP_LISTENING' | 'UNCERTAIN'

/** `idle`: no connection, since the person has been silent a while; their next speech opens one. */
export type SttState = 'connecting' | 'open' | 'idle' | 'reconnecting' | 'failed'

/** Which of the three loops an event travels in; each has its own bounded queue. */
export type VoiceLoop = 'inbound' | 'decision' | 'outbound'

// ── The events, by layer ──

export type VoiceEventBody =
  // The microphone, after the browser's processing: 16 kHz mono, 512 samples (32 ms) a frame.
  | { kind: 'audio.frame'; pcm: Int16Array }
  // Acoustic
  | { kind: 'acoustic.vadScore'; confidence: number }
  | { kind: 'acoustic.silence'; silent: boolean }
  | { kind: 'acoustic.echoLevel'; level: number }
  | { kind: 'acoustic.room'; label: RoomLabel }
  | {
      kind: 'acoustic.device'
      output: 'headphones' | 'speakers' | 'unknown'
      /** What the browser actually granted; null where it does not say. */
      processing: { echoCancellation: boolean | null; noiseSuppression: boolean | null; autoGainControl: boolean | null }
      sampleRate: number
    }
  | { kind: 'acoustic.detector'; detector: DetectorSettingsInUse; reason: string }
  | { kind: 'acoustic.advice'; advice: 'headphones' | null }
  // STT
  | { kind: 'stt.words'; text: string; words: TimedWord[]; committed: boolean; order: number | null }
  | { kind: 'stt.status'; state: SttState; reason?: string }
  | { kind: 'stt.lag'; lagMs: number; queuedMs: number }
  /** The echo filter's verdict on one transcript: `text` is what is not the agent's, nor noise over it. */
  | {
      kind: 'stt.heard'; heard: string; text: string; words: number; dropped: { echo: number; noise: number }
      committed: boolean; order: number | null; timed: TimedWord[]
    }
  /** The person's own words, after the echo filter and barge-in. */
  | { kind: 'stt.person'; text: string; committed: boolean; order: number | null; timed: TimedWord[] }
  /** What the person is saying now, before it is sent; empty when nothing is. */
  | { kind: 'stt.utterance'; text: string }
  /** Voice is ending by the person's hand: what they were saying is sent. */
  | { kind: 'stt.flush' }
  /** The person's turn is over: STT is asked to finish the turn it is hearing, with its final words. */
  | { kind: 'stt.endTurn' }
  /** Hand the microphone to a fresh speech connection; `dropped` records one the service closed, already replaced. */
  | { kind: 'stt.replace'; reason: 'queue-full' | 'lagging' | 'dropped' }
  | { kind: 'stt.muted'; muted: boolean }
  // Semantics
  /** The pause timer asks the turn model to score the speech with `silenceMs` of silence after it. */
  | { kind: 'semantics.ask'; silenceMs: number }
  | { kind: 'semantics.score'; score: number; silenceMs: number }
  /** The turn model failed, or its worker is gone: the fallback decides. */
  | { kind: 'semantics.failed'; reason: string }
  | { kind: 'semantics.decision'; answer: TurnAnswer; confidence: number | null; silenceMs: number; by: 'model' | 'fallback' }
  // Orchestration
  | { kind: 'orchestration.floor'; state: FloorState }
  /** `by`, on a stop: a stop word, enough of the person's own words, or the *Stop* button (or a raised hand's turn). */
  | { kind: 'orchestration.playback'; action: 'duck' | 'stop' | 'resume'; replyId: string; by?: 'stop-word' | 'words' | 'tap' }
  /**
   * What the person said goes to hq as a spoken message; `append` joins it to the message just sent. `trailedOff`:
   * the turn ended on the pause cap while the turn model still heard them mid-thought.
   */
  | {
      kind: 'orchestration.send'; text: string; append: boolean; trailedOff?: boolean
      /** The words went to hq with a *sounds finished* `listen`: hq takes them on a hand over, so they are not sent again. */
      via?: 'listen'
    }
  /**
   * Under the light model, the sound model ended the person's turn (the scheduler's send, not yet sent): the listening
   * runtime (`listener/trigger`) says where the words go.
   */
  | {
      kind: 'orchestration.ready'; text: string; append: boolean
      /** The quiet READY waited for, when false finishes this turn, the learned pace or `patient` set it. */
      waitedMs?: number
      /** The learned pace set the wait; the person asked for patience (`listen.style`). */
      paced?: true; patient?: true
    }
  /**
   * A false finish: the person spoke again `afterMs` after the sound model ended their turn. The `count` this turn, and
   * the quiet READY now waits for before it counts (`waitMs`).
   */
  | { kind: 'orchestration.falseFinish'; afterMs: number; count: number; waitMs: number }
  /**
   * Under the light model, after false finishes this turn, the sound model's READY came before the quiet it now needs:
   * it is held until `until` (the voice's end plus `waitMs`), and counts then unless the person goes on first.
   */
  | { kind: 'orchestration.finishHeld'; waitMs: number; until: number }
  /**
   * The listening family: a sound drawn from `tiers` (a hum or an acknowledging word in a long turn's pause, or an
   * invitation to go on after a stop word or a held turn).
   */
  | { kind: 'orchestration.phrase'; tiers: ListeningTier[] }
  /** `heardThrough`: the last sentence heard to its end; -1 for none. */
  | { kind: 'orchestration.cancel'; replyId: string; heardThrough: number }
  | { kind: 'orchestration.handRaise'; updateId: string; state: 'raised' | 'invited' | 'cleared'; critical: boolean }
  // The light model (adaptive voice listening): the questions asked of it, its answers, and the lines it plays.
  /**
   * Ask the light model about what just happened: hq's `listen`, whose `seq` is `call` (named apart from the runtime's
   * own `seq`), rising through the voice.
   */
  | { kind: 'listen.ask'; call: number; moment: VoiceListenMoment; text: string; quietMs: number; workingMs?: number; keptOpen?: boolean }
  /** hq's answer (`listened`), as it came. */
  | {
      kind: 'listen.answer'; call: number; action: VoiceListenAction; nextCheckSecs: number; say?: string; lineId?: string
      turn?: 'closed' | 'handedOver' | 'fallback'; turnId?: string; off?: boolean
    }
  /** Where the person's turn stands after an answer that decided it: kept open ("not yet"), closed alone, or handed over. */
  | { kind: 'listen.turn'; state: 'notYet' | 'closed' | 'handedOver' }
  /** A line of the light model's may play, as soon as its audio is here; `quiet`: a hum or acknowledgement, under a reply's level. */
  | { kind: 'listen.play'; lineId: string; quiet: boolean }
  /**
   * A line of the light model's is dropped, never heard: the person spoke after its call was asked (`call`: the listening
   * runtime, as the answer came), or was speaking as it would have started (no `call`: the speaker). `why`, in a few words.
   */
  | { kind: 'listen.drop'; lineId: string; call?: number; why: string }
  /** Words hq has not taken go as a plain spoken message: no answer came, or voice ends with the turn kept open. */
  | { kind: 'listen.sendPlain'; text: string }
  // The backchannel (adaptive voice listening, spec §The backchannel): a small sound of listening, by rule, no model call.
  /**
   * A hum is due now, `pausedMs` into a pause, after `speechMs` of the person's speech: in a pause the sound model says
   * is not the end (its `verdict`), or, `notYet`, as the light model kept the turn open with no line of its own.
   */
  | {
      kind: 'backchannel.hum'; pausedMs: number; verdict: TurnAnswer | null; speechMs: number; notYet?: true
      /** The sound model said READY, but the false-finish wait held it: the turn was not yet sent. */
      inWait?: true
      /**
       * A reaction hum (`backchannel/reaction`): `reactionSpacing`, due on less speech than a plain hum needs;
       * `reactionHeld`, kept over a plainer answer of the hum service's that came after it.
       */
      reactionSpacing?: true; reactionHeld?: true
      /** A laugh back: the voice profile heard them laugh (`backchannel/laugh`). */
      laugh?: true
      /**
       * The kind and tone to play: the listening read's latest answer (`from`), or with no usable answer the last one,
       * or a calm continuer, and why (`fallback`). The sound keeper picks the word (`./backchannel/keeper`).
       */
      hum: HumKind; tone: HumTone; from?: { call: number; at: number; ms: number }; fallback?: string
    }
  /**
   * The sound keeper starts a due sound (`backchannel/keeper`): its `key`, the word it picked; `made`, made new for this
   * voice in this conversation, or already made (`kept`); `pausedMs`, how far into the pause it starts.
   */
  | {
      kind: 'backchannel.sound'; key: string; words: string; hum: HumKind; tone: HumTone; made: 'new' | 'kept'
      pausedMs: number | null
    }
  /** A due sound that never started, and why; `speechMs`: the person's speech the due sound had counted, given back. */
  | { kind: 'backchannel.unplayed'; why: string; speechMs: number; pausedMs: number | null }
  /** A pause in the person's turn had no hum: the one rule that held it back, in a few words (the playground's near miss). */
  | { kind: 'backchannel.miss'; why: string; pausedMs: number | null }
  /**
   * The sound the speaker played, as the keeper started it (`backchannel.sound`), or, with `text` null, why none did.
   */
  | {
      kind: 'backchannel.played'; text: string | null; why?: string; hum?: HumKind; tone?: HumTone
      made?: 'new' | 'kept'; pausedMs?: number | null
    }
  // The hum service (spec §The backchannel): which kind of hum fits the person's words, asked of hq about once a second.
  /**
   * Ask hq (`backchannel`, its `seq` is `call`) about the turn's words so far; `skipped`: seconds skipped while the last
   * was in flight; `atPause`: asked as a pause began, on the words shown then (its answer and its drop carry it too).
   */
  | { kind: 'hum.ask'; call: number; text: string; skipped: number; atPause?: true; recent?: string[] }
  /** hq's answer (`backchannelKind`), as it came. */
  | {
      kind: 'hum.answer'; call: number; humKind: VoiceHumKind | null; tone: HumTone | null; ms: number
      failed?: 'off' | 'timeout' | 'failed'
    }
  /**
   * The latest answer, for the next hum: its kind and tone (no tone with `none`), and when it was asked; or,
   * `fallback`, that the call gave none (kind null), and the answer before it stands.
   */
  | {
      kind: 'hum.held'; call: number; humKind: VoiceHumKind | null; tone: HumTone | null; askedAt: number; ms: number
      skipped: number; fallback?: 'off' | 'timeout' | 'failed'; atPause?: true
    }
  /**
   * The sound keeper asks hq for the hum library's sounds of a kind in a tone: those made for the agent's voice, and one
   * more made; `warm`, as voice starts, every one.
   */
  | { kind: 'hum.speak'; hum: HumKind; tone: HumTone; warm?: true }
  /**
   * A sound of the library came (`ok`) and is kept by the speaker, made new or already made for the voice (`made`); or
   * it could not be made.
   */
  | { kind: 'hum.sound'; key: string; words: string; tone: HumTone; hum: HumKind; ok: boolean; made?: 'new' | 'kept' }
  /** An answer that came too late, or for words already sent: dropped, never held. */
  | { kind: 'hum.dropped'; call: number; humKind: VoiceHumKind | null; tone: HumTone | null; ms: number; waitedMs: number; skipped: number; atPause?: true }
  // From hq (the outbound loop's input)
  /** `encouragement`: the reply only asks the person to go on; what they say next joins their message. */
  | { kind: 'reply.sentence'; replyId: string; index: number; text: string; encouragement?: boolean }
  | { kind: 'reply.audio'; replyId: string; index: number; pcm24k: ArrayBuffer }
  | { kind: 'reply.spoken'; replyId: string; sentences: number }
  /** hq judged the person had not finished: no reply comes for this one, and their next words join its message. */
  | { kind: 'reply.held'; replyId: string }
  | { kind: 'reply.update'; updateId: string; critical: boolean }
  // Playback
  /** What playback is sending to the speaker, resampled to 16 kHz: the echo check's reference. */
  | { kind: 'playback.frame'; replyId: string; pcm: Int16Array }
  | { kind: 'playback.at'; replyId: string; index: number; elapsedMs: number; ended: boolean; playing: boolean }
  /**
   * A stored phrase (the standard acknowledgement, or a sound of the listening family) is being heard (`playing`), on each tick, and once when it ends;
   * never part of a reply.
   */
  | {
      kind: 'phrase.at'; text: string; playing: boolean; /** A light model's line (`listen.play`), not a stored phrase. */ lineId?: string
      /** One of the backchannel's hums. */
      backchannel?: true
    }
  /** The listening family asked for a sound and none played: why, in a few words (for the playground's trace). */
  | { kind: 'phrase.skipped'; why: string }
  // The person, on screen
  | { kind: 'person.tap'; target: 'hand-raise' | 'stop' }
  // The runtime's own clock tick, so components need no timers of their own.
  | { kind: 'clock.tick' }
  // Adaptive pacing and the listening style (spec §When a turn ends → *Adaptive pacing*; §The light model → *Listening style*).
  /**
   * A breath was heard (a pause in the person's turn after which they went on): the most recent kept (`breathMs`), how
   * many heard this conversation, and what they set, once there are enough.
   */
  | { kind: 'orchestration.pace'; heard: number; breathMs: number[]; learned: Learned | null }
  /** Voice starts again in a conversation whose breaths the page still holds in memory. */
  | { kind: 'orchestration.paceRestore'; heard: number; breathMs: number[] }
  /** The reply set a listening style (`set_listening_style`): hq's `listened` that carries only it. */
  | { kind: 'listen.styleAsked'; style: VoiceListenStyle }
  /**
   * The listening style now: changed as the reply asked (`asked`), or, `restored`, held in the page's memory from
   * earlier in the conversation.
   */
  | { kind: 'listen.style'; state: ListenStyleState; asked?: VoiceListenStyle; restored?: true }
  // The voice profile and Tone (adaptive voice listening, spec §Tone: `tone/`).
  /** How the person sounds, as Inworld's speech to text read it: labels most confident first; `final`, on a final transcript. */
  | { kind: 'tone.voice'; emotion: VoiceLabel[]; style: VoiceLabel[]; final: boolean }
  /** The voice hint changed (`tone/voiceHint`): how the person sounds now, or none (and none while Tone is off). */
  | { kind: 'tone.hint'; hint: VoiceHint | null }

export type VoiceEventKind = VoiceEventBody['kind']

/** An event as published: the runtime adds `seq`. */
export type VoiceEventInput = VoiceEventBody & { t: number }

export type VoiceEvent = VoiceEventInput & { seq: number }

export type VoiceEventOf<K extends VoiceEventKind> = Extract<VoiceEvent, { kind: K }>

/** The detector settings Acoustic is using now (a copy of `VoiceSettings['detector']` after the Adapter's changes). */
export type DetectorSettingsInUse = { onThreshold: number; offThreshold: number; minVoiceMs: number; minSilenceMs: number }

/** Which loop each event travels in. */
export function loopOf(kind: VoiceEventKind): VoiceLoop {
  if (kind.startsWith('reply.') || kind.startsWith('playback.') || kind === 'orchestration.playback'
    || kind === 'orchestration.cancel') return 'outbound'
  if (kind.startsWith('semantics.') || kind.startsWith('orchestration.') || kind.startsWith('listen.') || kind.startsWith('person.')
    || kind.startsWith('backchannel.') || kind.startsWith('hum.')
    || kind === 'clock.tick') return 'decision'
  if (kind.startsWith('tone.')) return 'decision'
  return 'inbound'
}
