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
  /**
   * Adaptive voice listening: ask the light model about what just happened — a pause after words, the person
   * sounding finished, a silence, or a wait for the reply. hq answers with `listened`. Under the flag `voiceListener`
   * with the person's Adaptive voice on, the spoken message itself goes here (a `soundsFinished` call, or a
   * `keptOpen` re-check), and hq admits it on a hand over or its fallback.
   */
  listen: 'conversationVoice:listen',
  /** A light model's line, from `line`, played to its end: hq stores what was heard with the turn's agent message. */
  linePlayed: 'conversationVoice:linePlayed',
  // Server → client
  /** To the room: who holds voice now (null when it ended), so every reader's screen agrees. */
  state: 'conversationVoice:state',
  /** To the holder: one sentence of the reply as it will be spoken, with its words' timings. */
  sentence: 'conversationVoice:sentence',
  /** To the holder: audio for a sentence, 24 kHz PCM16, in order. */
  audio: 'conversationVoice:audio',
  /** To the holder: every sentence of this turn has been sent. */
  turnSpoken: 'conversationVoice:turnSpoken',
  /** Adaptive voice listening: the lines already heard that start a reply's message, so the reply's words show in step with its voice. */
  heardPrefix: 'conversationVoice:heardPrefix',
  /**
   * To the holder: the agent judged that the person has not finished their thought, so nothing will be said for
   * this turn and no reply will come. The person's next words join the same message (`continue`).
   * @deprecated since 1.1; stops working in 3.0. Use `listened` instead.
   */
  turnHeld: 'conversationVoice:turnHeld',
  /** To the holder: the light model's answer to a `listen`, by its `seq`. */
  listened: 'conversationVoice:listened',
  /**
   * To the holder: a line to play to its end, never cut — the light model's words, or a stored hold phrase when it
   * gave no answer in time — 24 kHz PCM16, made on a path apart from the reply's. The light model's words come in
   * parts as they are made (`index`, the last marked `end`); a stored hold phrase comes whole.
   */
  line: 'conversationVoice:line',
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

/**
 * Voice events only hq's own pages send and read, never the mobile app: hq serves those pages, so they always match it
 * and these carry no protocol version (versioning.md). Under the same names' prefix as the voice events.
 */
export const CONVERSATION_VOICE_PAGE_SOCKET = {
  /**
   * Client → server. Adaptive voice listening's backchannel: while the person speaks, about once a second, which small
   * sound of listening fits their words so far. hq asks the hum service and answers with `backchannelKind`.
   */
  backchannel: 'conversationVoice:backchannel',
  /** Server → client, to the holder: the hum service's answer to a `backchannel`, by its `seq`. */
  backchannelKind: 'conversationVoice:backchannelKind',
  /**
   * Client → server. The sound keeper: the hum library's sounds of a kind in a tone. hq answers with a
   * `backchannelSound` for each of the kind's words made for the agent's voice and not sent yet, and makes one more.
   */
  backchannelSpeak: 'conversationVoice:backchannelSpeak',
  /** Server → client, to the holder: a sound's audio, or that it could not be made. */
  backchannelSound: 'conversationVoice:backchannelSound',
  /**
   * Client → server. Tone (adaptive voice listening, spec §Tone): whether Tone is on for this voice session, and the
   * voice hint, how the person sounds as a known label (`VoiceHint`); sent as either changes and before a question to
   * the light model when it changed since. Until a page sends it, Tone is off: everything spoken calm.
   */
  voiceTone: 'conversationVoice:voiceTone',
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
/** `turnId`: the reply to cancel, whose message the words join. */
export type VoiceContinuePayload = {
  conversationId: string; turnId: string; text: string
  /**
   * The words ended on a long pause while the person seemed mid-thought, as on a spoken message.
   * @deprecated since 1.1; stops working in 3.0. Use `listen` instead.
   */
  trailedOff?: boolean
}

/**
 * What just happened, that the light model is asked about: the person sounding finished (`soundsFinished`), still
 * quiet at the wait hq sent (`quiet`), or the reply being worked out for `workingMs` (`working`); or, from an older
 * client, a pause after words (`VoiceListenQuietAfterWords`).
 */
export type VoiceListenMoment = VoiceListenQuietAfterWords | 'soundsFinished' | 'quiet' | 'working'

/**
 * A pause after words: the person quiet a moment after their words last changed, asked about while they talk. hq
 * still answers it as before.
 * @deprecated since 1.1; stops working in 3.0. Nothing replaces it.
 */
export type VoiceListenQuietAfterWords = 'quietAfterWords'

/**
 * `seq` rises with each call in a voice session; a newer one makes every older one stale. `text`: the person's message
 * so far this turn, empty for `working`. `quietMs`: how long they have been quiet. `keptOpen`: a `quiet` re-check of a
 * turn the light model kept open after it sounded finished, which may end the turn as a `soundsFinished` call may.
 */
export type VoiceListenPayload = {
  conversationId: string
  seq: number
  moment: VoiceListenMoment
  text: string
  quietMs: number
  workingMs?: number
  keptOpen?: boolean
}

/** The light model's choice. Anything else a later hq sends is read as `keep_listening`. */
export type VoiceListenAction = 'keep_listening' | VoiceListenHum | 'acknowledge' | 'invite' | 'close_turn' | 'hand_over'

/**
 * A small sound of listening, chosen by the light model. hq no longer sends it: the client's backchannel plays those
 * sounds by its own rules, from stored phrases.
 * @deprecated since 1.1; stops working in 3.0. Nothing replaces it.
 */
export type VoiceListenHum = 'hum'

/**
 * The answer to `listen` number `seq`. `say`: the words it plays, whose audio follows as `line` `lineId`.
 * `nextCheckSecs`: when to ask again while the person stays quiet or the reply is worked out. `turn`: the turn ended —
 * `closed` by the light model alone (`turnId` is its completed turn), `handedOver` to the agent, or `fallback` when
 * no usable answer came in time (the message goes to the agent, and a stored hold phrase plays). `off`: no light model
 * listens here (no fast model is reached, or the flag is off): send spoken messages as with Adaptive voice off; a
 * message this call carried was handed over all the same. `answer` reaches only the voice playground. `style`: the
 * person asked the agent to listen differently (`VoiceListenStyle`), and the agent's reply set it; such an answer
 * carries `seq` of the latest `listen` hq had and decides nothing else. A client that does not know it ignores it.
 */
export type VoiceListenedEvent = {
  conversationId: string
  seq: number
  action: VoiceListenAction
  say?: string
  nextCheckSecs: number
  lineId?: string
  turn?: 'closed' | 'handedOver' | 'fallback'
  turnId?: string
  off?: boolean
  answer?: string
  style?: VoiceListenStyle
}

/**
 * How the person asked the agent to listen, for the rest of the conversation: `hums_off`, no small sounds of listening
 * while they talk; `hums_fewer`, fewer of them; `patient`, a longer wait before their turn counts as ended, and no line
 * until it has; `normal`, all of these undone. Kept in the page's memory only, never stored.
 */
export const VOICE_LISTEN_STYLES = ['hums_off', 'hums_fewer', 'patient', 'normal'] as const
export type VoiceListenStyle = (typeof VOICE_LISTEN_STYLES)[number]

/**
 * The kinds of small sound of listening the hum service picks from: `none`, or the kind of hum that fits what the person
 * has just said (a `continuer` to go on, `sympathy` when something went wrong, and so on). The kind picks the words.
 */
export const VOICE_HUM_KINDS = [
  'none', 'continuer', 'receipt', 'news', 'realisation', 'thoughtful', 'agreement', 'sympathy', 'delight', 'amusement',
] as const
export type VoiceHumKind = (typeof VOICE_HUM_KINDS)[number]

/** How the agent sounds as it hums: the tone picks the voice direction the words were recorded with. */
export const VOICE_HUM_TONES = ['calm', 'warm', 'curious', 'thoughtful', 'gentle', 'bright'] as const
export type VoiceHumTone = (typeof VOICE_HUM_TONES)[number]

/**
 * `seq` rises with each question in a voice session. `text`: the person's words this turn so far, the last ~60 words
 * at most. `atPause`: asked as a pause in their voice begins (absent on the questions asked while they speak).
 * `recent`: the words of the last three sounds the agent made in this conversation, oldest first.
 */
export type VoiceBackchannelPayload = { conversationId: string; seq: number; text: string; atPause?: true; recent?: string[] }

/**
 * How the person sounds, from the voice profile of the speech to text: the labels hq offers as the voice hint, which hq
 * puts in its own words (never a string from the page). Calm, neutral, anger and the plain styles are not offered.
 */
export const VOICE_HINTS = ['happy', 'laughing', 'tender', 'sad', 'fearful', 'crying', 'whispering', 'surprised'] as const
export type VoiceHint = (typeof VOICE_HINTS)[number]

/** Tone's state for a voice session: `on`, the Tone switch; `hint`, how the person sounds now, absent for none. */
export type VoiceTonePayload = { conversationId: string; on: boolean; hint?: VoiceHint }

/**
 * The listening read's answer to `backchannel` number `seq`: the kind that fits and its tone (none with `none`), and how
 * long the call took (`ms`). The page picks the words from the hum library.
 * `failed`: no kind, because no listening read is reached here (`off`), or its call ran out of time, failed or was
 * unreadable; the page keeps the read before it.
 */
export type VoiceBackchannelKindEvent = {
  conversationId: string; seq: number; kind: VoiceHumKind | null; tone: VoiceHumTone | null; ms: number
  failed?: 'off' | 'timeout' | 'failed'
}

/**
 * The hum library's sounds of `kind` in `tone` (a tone the kind takes); `warm`: as voice starts, every one of them is
 * made now, not one at a time.
 */
export type VoiceBackchannelSpeakPayload = {
  conversationId: string; kind: Exclude<VoiceHumKind, 'none'>; tone: VoiceHumTone; warm?: true
}

/**
 * A sound of the hum library: its words, tone and kind, and its audio (24 kHz PCM16) with `made`, whether it was made
 * new for this request or already made for the agent's voice; or `failed` with no audio when it could not be made (a
 * laugh on a speech model that takes no direction, or the speech service failed).
 */
export type VoiceBackchannelSoundEvent = {
  conversationId: string; words: string; tone: VoiceHumTone; kind: Exclude<VoiceHumKind, 'none'>
  audio?: ArrayBuffer | Uint8Array; made?: 'new' | 'kept'; failed?: true
}

/**
 * A line to play to its end, or a part of one. `stored`: one of the stored hold phrases, played on the fallback.
 * `index`: a part of a line sent as its speech is made, numbered from 0, played after the parts before it; `end`: its
 * last part (whose audio may be empty). A line with no `index` is whole.
 */
export type VoiceLineEvent = {
  conversationId: string; lineId: string; text: string; audio: ArrayBuffer | Uint8Array; stored?: boolean; index?: number; end?: true
}
/** A line played to its end; `skipped`: the browser dropped it (it came due while a reply played), never heard. */
export type VoiceLinePlayedPayload = { conversationId: string; lineId: string; skipped?: true }

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
/**
 * Under the light model a reply's stored message starts with the lines the person already heard, then a blank line
 * (`text\n\nreply`), while each sentence's `textStart` and `textEnd` place its words in the reply alone. Sent once the
 * message is written, only for a turn that has such lines: the screen shows them whole and places the sentences after them.
 */
export type VoiceHeardPrefixEvent = { conversationId: string; turnId: string; text: string }
export type VoiceTurnSpokenEvent = { conversationId: string; turnId: string; sentences: number }
/**
 * The agent judged the person has not finished: nothing will be said for this turn, and no reply will come.
 * @deprecated since 1.1; stops working in 3.0. Use `VoiceListenedEvent` instead.
 */
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
