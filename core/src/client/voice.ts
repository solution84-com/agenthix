/**
 * Voice as a mode of the conversation: the socket events between the voice holder's client and hq, the voice state
 * a conversation's view carries, and the operations a voice client calls.
 *
 * Speech to text runs in the client against the organisation's speech service; what it hears is sent as an
 * ordinary message with `spoken: true`. Text to speech runs in hq from the lead's stream, sentence by sentence, and
 * reaches only the holder's sockets: audio is never stored and never broadcast to the room.
 *
 * What a voice client must do beyond sending and reading these events, since the events alone do not say it:
 *
 * - **Decide when the person has finished speaking.** hq does not: the client streams the person's speech to the
 *   speech service (`getSpeechToken`), decides when what they said is a whole message, and sends it with
 *   `sendConversationMessage`, `spoken: true` (and `trailedOff: true` when it ended on a long pause while they
 *   seemed mid-thought). hq's web client decides on a pause, then on whether the words read as finished.
 *   Words the person adds after a message was sent but before any of its reply was heard go as `continue`, naming
 *   the reply's turn (the first `turn`, `delta` or `sentence` seen after sending); with no reply seen yet, they go
 *   as a message of their own.
 * - **Keep voice alive while the person speaks.** Two minutes with neither side speaking ends voice
 *   (`VOICE_SILENCE_END_MS`), warned `VOICE_SILENCE_WARNING_MS` before by `silenceWarning`. hq hears the person only
 *   through messages, so while partial speech arrives the client sends `activity`; hq's web client sends it at
 *   most every five seconds.
 * - **Report how much of a reply was heard.** The client plays each `sentence`'s `audio` in `index` order. When the
 *   person speaks over the reply, or ends voice while it plays, it stops playing and sends `interrupt` with
 *   `heardThrough`: the last sentence whose audio played to its end, every earlier one included; -1 for none; and
 *   `heardWords`: how many words of the next sentence played before it stopped. hq keeps only that much of the reply,
 *   to the last word heard (to the last whole sentence heard when `heardWords` is absent).
 * - **Say when speech to text failed.** `end` with `failed: 'speech-to-text'`, so the line that ends voice says so.
 */


/** Two minutes of silence on both sides ends voice, warned this long before. */
export const VOICE_SILENCE_END_MS = 120_000
export const VOICE_SILENCE_WARNING_MS = 15_000

export type ConversationVoiceView = {
  /** Whether this person may start voice here now, and why not when they may not. */
  available: boolean
  unavailableReason: string | null
  /** Who holds voice in the conversation now; null when nobody does. */
  holderId: string | null
  startedAt: string | null
}

export const CONVERSATION_VOICE_SOCKET = {
  // Client → server
  /** Take voice in a conversation the person may speak in: refused with `error` when someone else holds it. */
  start: 'conversationVoice:start',
  end: 'conversationVoice:end',
  /** The person spoke over the reply: stop it, and keep only what they heard. */
  interrupt: 'conversationVoice:interrupt',
  /** The person is speaking (partial speech): keeps the silence rule from ending voice. */
  activity: 'conversationVoice:activity',
  /** The person invited an agent's raised hand: by a tap, their words, or an opening. hq then gives it its turn. */
  invite: 'conversationVoice:invite',
  /**
   * The person spoke again after their message was sent but before any of the reply was heard: hq cancels that reply,
   * adds `text` to the same message, and answers the whole of it.
   */
  continue: 'conversationVoice:continue',
  // Server → client
  /** To the room: who holds voice now (null when it ended), so every reader's screen agrees. */
  state: 'conversationVoice:state',
  /** To the holder: one sentence of the reply as it will be spoken, with its words' timings. */
  sentence: 'conversationVoice:sentence',
  /** To the holder: audio for a sentence, 24 kHz PCM16, in order. */
  audio: 'conversationVoice:audio',
  /** To the holder: every sentence of this turn has been sent. */
  turnSpoken: 'conversationVoice:turnSpoken',
  /**
   * To the holder: the agent judged that the person has not finished their thought, so nothing will be said for
   * this turn and no reply will come. The person's next words join the same message (`continue`).
   */
  turnHeld: 'conversationVoice:turnHeld',
  /**
   * To the holder, as voice starts: one filler, active listening or encouragement phrase in the agent's voice,
   * 24 kHz PCM16, an event per phrase (more than ten binary attachments in one message make socket.io drop the
   * connection).
   */
  phrase: 'conversationVoice:phrase',
  /** To the holder: voice ends in `endsInMs` unless someone speaks. */
  silenceWarning: 'conversationVoice:silenceWarning',
  /** To the holder: voice ended, and why, in a line a person reads. */
  ended: 'conversationVoice:ended',
  error: 'conversationVoice:error',
  /** To the holder: an agent has an ordinary update and raises its hand instead of taking a turn. */
  update: 'conversationVoice:update',
} as const

export type VoiceStartPayload = { conversationId: string }
/** `failed`: the browser's speech to text stopped working, so voice ends with a line saying so. */
export type VoiceEndPayload = { conversationId: string; failed?: 'speech-to-text' }
/**
 * `heardThrough`: the index of the last sentence whose audio the person heard to its end; -1 for none.
 * `heardWords`: how many words of the sentence after it were heard before the audio stopped.
 */
export type VoiceInterruptPayload = { conversationId: string; turnId: string; heardThrough: number; heardWords?: number }
export type VoiceActivityPayload = { conversationId: string }
export type VoiceInvitePayload = { conversationId: string; updateId: string }
/**
 * `turnId`: the reply to cancel, whose message the words join. `trailedOff`: the words ended on a long pause while
 * the person seemed mid-thought, as on a spoken message.
 */
export type VoiceContinuePayload = { conversationId: string; turnId: string; text: string; trailedOff?: boolean }

export type VoiceStateEvent = { conversationId: string; holderId: string | null; startedAt: string | null }
export type VoiceSentenceEvent = {
  conversationId: string
  turnId: string
  /** 0, 1, 2 … within the turn. */
  index: number
  /** The words as spoken: a shown part's spoken line in place of its body, markup stripped. */
  text: string
  /** Where in the turn's text this sentence's words appear, so the bubble reveals the written reply in step. */
  textStart: number
  textEnd: number
  words: string[]
  wordStartSecs: number[]
  wordEndSecs: number[]
  /** The reply only asks the person to go on: what they say next joins their message (Orchestration §5). */
  encouragement?: boolean
}
export type VoiceAudioEvent = { conversationId: string; turnId: string; index: number; audio: ArrayBuffer }
export type VoiceTurnSpokenEvent = { conversationId: string; turnId: string; sentences: number }
/** The agent judged the person has not finished: nothing will be said for this turn, and no reply will come. */
export type VoiceTurnHeldEvent = { conversationId: string; turnId: string }
/**
 * `use`: a filler phrase (the default), an active listening phrase, or an encouragement phrase. `tier`: for a filler
 * phrase, which step of the wait it is for, the shortest first.
 */
export type VoicePhraseEvent = {
  conversationId: string; text: string; tier: number; audio: ArrayBuffer | Uint8Array; use?: 'filler' | 'active-listening' | 'encouragement'
}
export type VoiceSilenceWarningEvent = { conversationId: string; endsInMs: number }
export type VoiceEndedEvent = { conversationId: string; reason: string }
export type VoiceErrorEvent = { conversationId: string; message: string }
/** `critical`: governed by policy, it speaks after the current sentence without waiting for an opening. */
export type VoiceUpdateEvent = { conversationId: string; updateId: string; critical: boolean }

// ── The operations a voice client calls ──
// Named for no vendor: which provider serves a service is a value, so a change of provider changes no name or key
// a client reads.

/** `getVoiceServices`: which speech services the organisation has set up, for any member. Nothing secret. */
export type VoiceServices = {
  speechToText: { provider: string } | null
  textToSpeech: { provider: string } | null
}

export type SpeechTokenConfigValue =
  | string | number | boolean | null | SpeechTokenConfigValue[] | { [key: string]: SpeechTokenConfigValue }

/**
 * `getSpeechToken`: a short-lived token for streaming the person's speech to `provider`'s speech to text, from the
 * client, and the organisation's settings for that service. The key it was made with never leaves hq.
 */
export type SpeechToken = {
  provider: string
  token: string
  expiresAt: string
  config: { [key: string]: SpeechTokenConfigValue }
}
