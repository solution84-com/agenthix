/**
 * One conversation's voice while someone holds it (conversational experience spec, Voice), in this process: the
 * reply spoken sentence by sentence to the holder's sockets, one sentence after another across turns, so a new
 * turn's speech never starts over the one playing, and never more than a couple of sentences ahead of what the
 * holder has heard (outbound.ts); an interruption that stops it all and remembers what was heard; an agent's raised
 * hand (hand.ts); and the silence rule. Audio is never stored.
 */
import {
  CONVERSATION_VOICE_SOCKET as V,
  VOICE_SILENCE_END_MS,
  VOICE_SILENCE_WARNING_MS,
  type VoiceAudioEvent,
  type VoiceErrorEvent,
  type VoiceSentenceEvent,
  type VoiceSilenceWarningEvent,
  type VoiceTurnSpokenEvent,
} from '../../shared/conversations/voice'
import type { WordTiming } from '../../voice/ttsAdapter'
import { isEncouragement } from '../../shared/conversations/shownParts'
import { heardText, speechUnits, type SpeechUnit } from './speechUnits'
import { RaisedHand, type HandTimer } from './hand'
import { audioMs, PlaybackTimeline, SENTENCES_AHEAD } from './outbound'

export const SPEECH_FAILED = "Couldn't speak this reply"

export interface VoiceSessionDeps {
  /** One sentence as audio, with its words' timings, as they stream from the speech service. */
  synthesize(text: string, signal: AbortSignal): AsyncIterable<{ audio: Buffer; wordTiming?: WordTiming }>
  /** An encouragement response's sentence as the speech service is asked to say it: in the stored phrases' relaxed tone. */
  asEncouragement?(text: string): string
  /** To the holder's sockets only. */
  toHolder(event: string, payload: unknown): void
  /** Text to speech failed during a turn: the reply finishes as text, and the record says why, once. */
  speechFailed(turnId: string): void
  now(): number
  /** Waits before the next sentence is made, ending early when `signal` aborts. A real timer when absent. */
  wait?(ms: number, signal: AbortSignal): Promise<void>
  /** How many sentences speech may run ahead of what the holder has heard. */
  sentencesAhead?: number
  /** A raised hand went unanswered: its update may take its turn now, as text. */
  handExpired?(): void
  handTimer?: HandTimer
}

/** A turn's speech, as the turn sees it: its text as it streams, and its end. */
export interface TurnSpeech {
  text(full: string): void
  /**
   * The turn ended: the text to record — when the person spoke over it, only what they heard, marked interrupted;
   * `withdrawn` when their words joined the message it answered.
   */
  end(state: 'COMPLETED' | 'FAILED' | 'CANCELLED', full: string): { text: string; interrupted: boolean; withdrawn?: boolean }
}

interface TurnState {
  units: SpeechUnit[]
  sent: number
  finished: boolean
  dropped: boolean
  announced: boolean
  heardThrough?: number
  withdrawn?: boolean
  /** The reply only asks the person to go on (Orchestration §5). */
  encouragement?: boolean
}

interface Queued { turnId: string; index: number }

function timer(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const t = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
    function done() {
      clearTimeout(t)
      signal.removeEventListener('abort', done)
      resolve()
    }
  })
}

function arrayBufferOf(audio: Buffer): ArrayBuffer {
  return audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer
}

export class VoiceSession {
  /** An agent's update waiting for the holder's invitation. */
  readonly hand: RaisedHand
  /**
   * The holder's last spoken words ended on the pause cap while they seemed mid-thought (Orchestration §5): the turn
   * that answers them is told they may not have finished.
   */
  trailedOff = false
  /** The encouragement response the holder's last words went on after, when they did: the turn that answers is told. */
  wentOnAfter: string | null = null
  private readonly turns = new Map<string, TurnState>()
  private queue: Queued[] = []
  private pumping: Promise<void> | null = null
  private controller = new AbortController()
  private inFlight: string | null = null
  private lastActivity: number
  private readonly playback = new PlaybackTimeline()
  private warned = false
  private busy = 0
  private closed = false

  constructor(
    readonly conversationId: string,
    readonly holderId: string,
    readonly socketIds: Set<string>,
    private readonly deps: VoiceSessionDeps,
  ) {
    this.lastActivity = deps.now()
    this.hand = new RaisedHand(conversationId, (event, payload) => deps.toHolder(event, payload), {
      expired: () => deps.handExpired?.(), timer: deps.handTimer,
    })
  }

  speechFor(turnId: string): TurnSpeech {
    const state: TurnState = { units: [], sent: 0, finished: false, dropped: this.closed, announced: false }
    this.turns.set(turnId, state)
    this.busy++
    return {
      text: full => {
        state.encouragement = isEncouragement(full)
        if (!state.dropped) this.take(turnId, state, speechUnits(full, false))
      },
      end: (endState, full) => {
        if (!state.finished) this.busy--
        if (endState === 'COMPLETED' && !state.dropped) this.take(turnId, state, speechUnits(full, true))
        else this.drop(turnId, state)
        state.finished = true
        this.activity()
        this.announceIfDone(turnId, state)
        // An interruption that reached the turn as it was ending still keeps only what was heard.
        if (state.heardThrough === undefined) return { text: full, interrupted: endState === 'CANCELLED' }
        return { text: heardText(full, state.heardThrough), interrupted: true, ...(state.withdrawn && { withdrawn: true }) }
      },
    }
  }

  /**
   * The person spoke over the reply: stop every sentence, and keep only what they heard of this turn. `withdrawn`:
   * their words joined the message it answered instead.
   */
  interrupt(turnId: string, heardThrough: number, withdrawn = false): void {
    this.controller.abort()
    this.controller = new AbortController()
    this.queue = []
    for (const state of this.turns.values()) {
      state.dropped = true
      state.announced = true
    }
    const state = this.turns.get(turnId)
    if (state) {
      state.heardThrough = Math.max(-1, Math.trunc(heardThrough))
      if (withdrawn) state.withdrawn = true
    }
    this.playback.clear()
    this.activity()
  }

  /** What the person heard of a turn they interrupted: the index of the last sentence heard to its end. */
  heardThrough(turnId: string): number | undefined {
    return this.turns.get(turnId)?.heardThrough
  }

  /** What a turn's sentences were, as spoken so far: for a turn that ended before the interruption reached it. */
  unitsOf(turnId: string): readonly SpeechUnit[] | undefined {
    return this.turns.get(turnId)?.units
  }

  activity(): void {
    this.lastActivity = this.deps.now()
    this.warned = false
  }

  /**
   * The silence rule: two minutes with neither side speaking ends voice, warned fifteen seconds before. A reply
   * being written for the holder is not silence.
   */
  silenceCheck(): 'warn' | 'end' | null {
    const now = this.deps.now()
    if (this.busy > 0) this.lastActivity = now
    const quiet = now - Math.max(this.lastActivity, this.playback.speakingUntil())
    if (quiet >= VOICE_SILENCE_END_MS) return 'end'
    if (quiet >= VOICE_SILENCE_END_MS - VOICE_SILENCE_WARNING_MS && !this.warned) {
      this.warned = true
      const event: VoiceSilenceWarningEvent = { conversationId: this.conversationId, endsInMs: VOICE_SILENCE_END_MS - quiet }
      this.deps.toHolder(V.silenceWarning, event)
      return 'warn'
    }
    return null
  }

  /** Voice ended: nothing more is spoken; a turn still running finishes as text. */
  close(): void {
    this.closed = true
    this.hand.close()
    this.controller.abort()
    this.queue = []
    for (const state of this.turns.values()) {
      state.dropped = true
      state.announced = true
    }
  }

  private take(turnId: string, state: TurnState, units: SpeechUnit[]): void {
    for (let i = state.units.length; i < units.length; i++) {
      state.units.push(units[i]!)
      this.queue.push({ turnId, index: i })
    }
    this.pump()
  }

  private drop(turnId: string, state: TurnState): void {
    state.dropped = true
    this.queue = this.queue.filter(q => q.turnId !== turnId)
  }

  private announceIfDone(turnId: string, state: TurnState): void {
    if (state.announced || !state.finished || this.inFlight === turnId || this.queue.some(q => q.turnId === turnId)) return
    state.announced = true
    const event: VoiceTurnSpokenEvent = { conversationId: this.conversationId, turnId, sentences: state.sent }
    this.deps.toHolder(V.turnSpoken, event)
  }

  private pump(): void {
    if (this.pumping || this.closed) return
    this.pumping = this.speakQueued().finally(() => { this.pumping = null })
  }

  private async speakQueued(): Promise<void> {
    for (let next = this.queue.shift(); next; next = this.queue.shift()) {
      const state = this.turns.get(next.turnId)
      if (!state || state.dropped) continue
      this.inFlight = next.turnId
      try {
        const held = this.aheadOfPlayback(this.controller.signal)
        if (held) await held
        if (!state.dropped) await this.speak(next, state, state.units[next.index]!, this.controller.signal)
      } catch {
        this.drop(next.turnId, state)
        const event: VoiceErrorEvent = { conversationId: this.conversationId, message: SPEECH_FAILED }
        this.deps.toHolder(V.error, event)
        this.deps.speechFailed(next.turnId)
      } finally {
        this.inFlight = null
      }
      this.announceIfDone(next.turnId, state)
    }
  }

  /**
   * Holds the next sentence back while the holder has `sentencesAhead` not yet heard. Waits once, for when the
   * oldest of them ends: playback can only be estimated, so the estimate is trusted rather than polled.
   */
  private aheadOfPlayback(signal: AbortSignal): Promise<void> | null {
    const ms = this.playback.waitMs(this.deps.now(), this.deps.sentencesAhead ?? SENTENCES_AHEAD)
    // Under a millisecond is not worth a timer, nor a pause in the loop.
    if (ms < 1 || signal.aborted) return null
    return (this.deps.wait ?? timer)(ms, signal)
  }

  /** One sentence: synthesized whole, so its words' timings go before its audio. */
  private async speak(item: Queued, state: TurnState, unit: SpeechUnit, signal: AbortSignal): Promise<void> {
    const audio: Buffer[] = []
    const timing: WordTiming = { words: [], wordStartSecs: [], wordEndSecs: [] }
    const said = state.encouragement && this.deps.asEncouragement ? this.deps.asEncouragement(unit.text) : unit.text
    for await (const chunk of this.deps.synthesize(said, signal)) {
      if (signal.aborted) return
      audio.push(chunk.audio)
      const t = chunk.wordTiming
      // The speech service mixes words with tokens of space and punctuation: only words are revealed by.
      t?.words.forEach((word, i) => {
        // A direction ("[relaxed, …]") is timed as a word, though it is not said.
        if (!/\w/.test(word) || word.startsWith('[')) return
        timing.words.push(word)
        timing.wordStartSecs.push(t.wordStartSecs[i]!)
        timing.wordEndSecs.push(t.wordEndSecs[i]!)
      })
    }
    if (signal.aborted || state.dropped) return
    const sentence: VoiceSentenceEvent = {
      conversationId: this.conversationId, turnId: item.turnId, index: item.index, text: unit.text,
      textStart: unit.start, textEnd: unit.end, ...timing, ...(state.encouragement && { encouragement: true }),
    }
    this.deps.toHolder(V.sentence, sentence)
    for (const piece of audio) {
      const event: VoiceAudioEvent = { conversationId: this.conversationId, turnId: item.turnId, index: item.index, audio: arrayBufferOf(piece) }
      this.deps.toHolder(V.audio, event)
    }
    state.sent++
    const bytes = audio.reduce((n, piece) => n + piece.byteLength, 0)
    this.playback.sent(this.deps.now(), bytes > 0 ? audioMs(bytes) : (timing.wordEndSecs.at(-1) ?? 0) * 1000)
  }
}
