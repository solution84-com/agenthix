/**
 * The contract between voice's components in the browser (adaptive voice spec, How it is built and tested). Every
 * component talks only through these events; the runtime delivers them through bounded queues and keeps a log of
 * them, which is also the measurements and a recording to replay.
 *
 * Every event carries `t`, when what it describes happened on the capture clock (ms, the clock `Clock.now` reads),
 * and `seq`, its order, assigned by the runtime. Events that belong to a reply carry its `replyId`: hq's turn id,
 * the generation id that lets anything from a cancelled reply be dropped wherever it is.
 */

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
  | { kind: 'orchestration.send'; text: string; append: boolean; trailedOff?: boolean }
  /** Active listening: an active listening phrase in a long turn's pause, or an encouragement phrase after a stop word. */
  | { kind: 'orchestration.phrase'; phrase: 'active-listening' | 'encouragement' }
  /** `heardThrough`: the last sentence heard to its end; -1 for none. */
  | { kind: 'orchestration.cancel'; replyId: string; heardThrough: number }
  | { kind: 'orchestration.handRaise'; updateId: string; state: 'raised' | 'invited' | 'cleared'; critical: boolean }
  // From hq (the outbound loop's input)
  /** `encouragement`: the reply only asks the person to go on; what they say next joins their message. */
  | { kind: 'reply.sentence'; replyId: string; index: number; text: string; encouragement?: boolean }
  | { kind: 'reply.audio'; replyId: string; index: number; pcm24k: ArrayBuffer }
  | { kind: 'reply.spoken'; replyId: string; sentences: number }
  | { kind: 'reply.update'; updateId: string; critical: boolean }
  // Playback
  /** What playback is sending to the speaker, resampled to 16 kHz: the echo check's reference. */
  | { kind: 'playback.frame'; replyId: string; pcm: Int16Array }
  | { kind: 'playback.at'; replyId: string; index: number; elapsedMs: number; ended: boolean; playing: boolean }
  /**
   * A filler, active listening or encouragement phrase is being heard (`playing`), on each tick, and once when it ends;
   * never part of a reply.
   */
  | { kind: 'phrase.at'; text: string; playing: boolean }
  // The person, on screen
  | { kind: 'person.tap'; target: 'hand-raise' | 'stop' }
  // The runtime's own clock tick, so components need no timers of their own.
  | { kind: 'clock.tick' }

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
  if (kind.startsWith('semantics.') || kind.startsWith('orchestration.') || kind.startsWith('person.')
    || kind === 'clock.tick') return 'decision'
  return 'inbound'
}
