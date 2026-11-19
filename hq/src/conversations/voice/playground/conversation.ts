/**
 * One page's conversation in the voice playground (plan task 4b.2): kept in memory, tied to no agent and no record,
 * spoken through hq's own `VoiceSession` (session.ts: the sentence cutting, pacing ahead of playback, interruption
 * and the silence rule), and answered by the playground's lead through the lead's voice logic (turn.ts here).
 *
 * It answers hq's own voice events, under the playground's prefix, as hq's voice service does: start, end,
 * interrupt, activity and continue, and with the light model on, listen and linePlayed (light/live.ts). What hq does that this does not: the reading and speaking rules, raised hands,
 * the person's Wait or Interrupt setting (a message sent while a reply runs waits, hq's default), and the record.
 */
import { hintWords, LINE_STEERING, spokenTone, steeringOf, TONE_OFF, voiceToneOf } from '../toneSteering'
import { CONVERSATION_SOCKET, MESSAGE_MAX_CHARS, type ConversationTurnEvent } from '../../../shared/conversations/protocol'
import { CONVERSATION_VOICE_PAGE_SOCKET as VP } from '@agenthix/core'
import {
  CONVERSATION_VOICE_SOCKET as V, type VoiceEndedEvent, type VoiceErrorEvent, type VoiceStateEvent,
} from '../../../shared/conversations/voice'
import {
  PLAYGROUND_CONVERSATION_ID, PLAYGROUND_PERSON_ID, PLAYGROUND_SOUNDS, VOICE_PLAYGROUND_SOCKET as P, playgroundEvent,
  type PlaygroundEntry, type PlaygroundSound, type PlaygroundLog, type PlaygroundSendAck, type PlaygroundSendArgs,
} from '../../../shared/voicePlayground'
import { VoiceSession, type VoiceSessionDeps } from '../session'
import type { PhraseClip, StoredPool } from '../phrases'
import type { SteeringChanges } from '../../voiceClient/backchannel/kinds'
import type { HumSound } from '../humService/service'
import type { StoredSound } from '../humService/store'
import { PlaygroundHums, type HumsDeps } from './hums'
import type { LeadRun } from './leads'
import { runPlaygroundTurn, type Running } from './turn'
import { PlaygroundLight, type LightDeps } from './light/live'
import type { LineDirection, PlaygroundLightConfig } from '../../../shared/voicePlaygroundLight'
import { replyOf } from '../listening/state'

export type Out = (event: string, payload: unknown) => void

/** How the playground speaks: hq's speech path on the organisation's text to speech, or why it cannot. */
export type PlaygroundSpeech =
  | {
    synthesize: VoiceSessionDeps['synthesize']; asEncouragement?: VoiceSessionDeps['asEncouragement']; steered?: VoiceSessionDeps['steered']
    /** The stored phrases as voice starts. */
    phrases?(onClip: (clip: PhraseClip) => void, stillWanted: () => boolean): Promise<void>
    /** Whether a listening sound is made for this voice, with the tones' steering the page changed (`../humService/store`). */
    soundMade?(sound: HumSound, steering: SteeringChanges): Promise<boolean>
    /** A listening sound, with the tones' steering the page changed, kept or made now; null when it cannot be made. */
    sound?(sound: HumSound, steering: SteeringChanges): Promise<StoredSound | null>
    /** A light model's line as its speech streams in, in the direction asked (listening/lines.ts speaks plainly). */
    line?(text: string, direction: LineDirection, steering?: string | null): AsyncIterable<Buffer>
    /** A stored phrase of `pool` (a hold phrase, or the "not yet" limit's closing line) none of `avoid` repeats. */
    stored?(avoid: readonly string[], pool: StoredPool): Promise<{ text: string; audio: Buffer } | null>
  }
  | { reason: string }

type Speaking = Exclude<PlaygroundSpeech, { reason: string }>

export interface PlaygroundDeps {
  /** To this page's socket only, the event named as it goes. */
  out: Out
  /** The lead for the page's choice; throws with a line the page shows. */
  lead(args: PlaygroundSendArgs): LeadRun
  speech(): Promise<PlaygroundSpeech>
  /** A line on hq's own log. */
  log(line: string): void
  now?(): number
  newId?(): string
  wait?: VoiceSessionDeps['wait']
  /** Runs `fn` every `ms` until the returned function is called: the silence rule's check. */
  every?(ms: number, fn: () => void): () => void
  /** The light model's model calls; with none, the light model answers that it is off. */
  light?: LightDeps
  /** The hum service's model calls; with none, it answers that it is off. */
  hums?: HumsDeps
}

export const PLAYGROUND_ENDED = {
  byPerson: 'Voice ended.',
  silence: 'Voice ended after two minutes of quiet.',
  speechToText: 'Voice ended because speech to text stopped working. You can keep typing.',
}

const realEvery = (ms: number, fn: () => void) => {
  const t = setInterval(fn, ms)
  t.unref?.()
  return () => clearInterval(t)
}

function field(payload: unknown, name: string): unknown {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>)[name] : undefined
}

export class PlaygroundConversation {
  readonly conversationId = PLAYGROUND_CONVERSATION_ID
  entries: PlaygroundEntry[] = []
  voice: VoiceSession | null = null
  running: Running | null = null
  private starting = false
  private stopSilence: (() => void) | null = null
  private pending: PlaygroundEntry[] = []
  private lead: { run: LeadRun; adaptiveVoice: boolean } | null = null
  private speech: Speaking | null = null
  readonly now: () => number
  readonly newId: () => string
  readonly light: PlaygroundLight
  readonly hums: PlaygroundHums

  constructor(readonly deps: PlaygroundDeps) {
    this.now = deps.now ?? Date.now
    let n = 0
    this.newId = deps.newId ?? (() => `${Date.now().toString(36)}-${(n++).toString(36)}`)
    this.light = new PlaygroundLight({
      conversationId: this.conversationId,
      out: (event, payload) => this.deps.out(event, payload),
      hq: (event, payload) => this.hq(event, payload),
      now: () => this.now(),
      newId: () => this.newId(),
      log: line => this.deps.log(line),
      entries: () => this.entries,
      admit: (text, config) => this.admitSpoken(text, config),
      closeTurn: (message, agentText) => this.closeLightTurn(message, agentText),
      // In the tone the light model gave the line, with some of it; calm with Tone off.
      line: (text, direction, tone) => this.speech?.line?.(text, direction, steeringOf(LINE_STEERING, spokenTone(this.voice?.tone ?? TONE_OFF, tone ?? null))) ?? null,
      voiceHint: () => hintWords(this.voice?.tone ?? TONE_OFF),
      stored: (avoid, pool) => this.speech?.stored?.(avoid, pool) ?? Promise.resolve(null),
    }, deps.light)
    this.hums = new PlaygroundHums({
      conversationId: this.conversationId,
      hq: (event, payload) => this.hq(event, payload),
      now: () => this.now(),
      log: line => this.deps.log(line),
      config: () => this.light.config,
      made: (sound, steering) => this.speech?.soundMade?.(sound, steering) ?? Promise.resolve(false),
      sound: (sound, steering) => this.speech?.sound?.(sound, steering) ?? Promise.resolve(null),
      tone: () => {
        const tone = this.voice?.tone ?? TONE_OFF
        return { on: tone.on, hint: hintWords(tone) }
      },
    }, deps.hums)
  }

  hq(event: string, payload: unknown): void { this.deps.out(playgroundEvent(event), payload) }
  emitEntry(e: PlaygroundEntry): void { this.deps.out(P.entry, { ...e }) }
  pageLog(e: PlaygroundLog): void { this.deps.out(P.log, e) }

  /** One of hq's voice events from the page; anything malformed or for another conversation is ignored. */
  voiceEvent(event: string, payload: unknown): void {
    if (field(payload, 'conversationId') !== this.conversationId) return
    switch (event) {
      case V.start: void this.startVoice(); return
      case V.end: this.endVoice(field(payload, 'failed') === 'speech-to-text' ? PLAYGROUND_ENDED.speechToText : PLAYGROUND_ENDED.byPerson); return
      case V.activity: this.voice?.activity(); return
      case V.listen: this.light.listen(payload); return
      case VP.backchannel: this.hums.ask(payload); return
      case VP.backchannelSpeak: this.hums.speak(payload); return
      case VP.voiceTone: if (this.voice) this.voice.tone = voiceToneOf(payload); return
      case V.linePlayed: this.light.played(payload); return
      case V.interrupt: {
        const turnId = field(payload, 'turnId')
        const heard = field(payload, 'heardThrough')
        const words = field(payload, 'heardWords')
        const heardWords = typeof words === 'number' && Number.isFinite(words) && words > 0 ? words : 0
        if (typeof turnId === 'string' && typeof heard === 'number' && Number.isFinite(heard)) this.interrupt(turnId, heard, heardWords)
        return
      }
      case V.continue: {
        const turnId = field(payload, 'turnId')
        const text = field(payload, 'text')
        if (typeof turnId === 'string' && typeof text === 'string' && text.length <= MESSAGE_MAX_CHARS) {
          this.continueWith(turnId, text, field(payload, 'trailedOff') === true)
        }
      }
    }
  }

  /**
   * A stored clip began to play on the page: what the person heard the agent say (a hum, a word, an invitation, a
   * filler phrase) is kept as the agent's words, in order, so the lead reads what was said as the person heard it.
   * It starts no turn.
   */
  recordSound(payload: unknown): void {
    if (field(payload, 'conversationId') !== this.conversationId || !this.voice) return
    const text = field(payload, 'text')
    const sound = field(payload, 'sound')
    if (typeof text !== 'string' || !text.trim() || text.length > 200) return
    if (!PLAYGROUND_SOUNDS.includes(sound as PlaygroundSound)) return
    const entry: PlaygroundEntry = { id: this.newId(), role: 'agent', text: text.trim(), at: this.now(), spoken: true, sound: sound as PlaygroundSound, state: 'COMPLETED' }
    this.entries.push(entry)
    this.emitEntry(entry)
  }

  /** A message, as hq's message box sends it, answered by the lead the page chose. */
  send(args: PlaygroundSendArgs): PlaygroundSendAck {
    if (!args || args.conversationId !== this.conversationId) return { ok: false, error: 'Conversation not found' }
    const text = typeof args.text === 'string' ? args.text.trim() : ''
    if (!text || text.length > MESSAGE_MAX_CHARS) return { ok: false, error: 'A message needs some words, and not too many.' }
    try {
      this.lead = { run: this.deps.lead(args), adaptiveVoice: args.adaptiveVoice !== false }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'No lead' }
    }
    return { ok: true, entryId: this.admit(text, args.spoken === true, args.trailedOff === true).id }
  }

  /** The light model handed the person's words over: a spoken message, answered by the lead the page chose. */
  admitSpoken(text: string, config: Pick<PlaygroundLightConfig, 'lead' | 'adaptiveVoice'>): void {
    try {
      this.lead = { run: this.deps.lead({ conversationId: this.conversationId, clientMessageId: this.newId(), text, lead: config.lead, adaptiveVoice: config.adaptiveVoice }), adaptiveVoice: config.adaptiveVoice }
    } catch (err) {
      this.pageLog({ level: 'error', text: `No lead to answer: ${err instanceof Error ? err.message : String(err)}` })
      return
    }
    this.admit(text, true, false)
  }

  /** A turn the light model closed alone: the person's message and what they heard, a completed turn the lead never answers. */
  closeLightTurn(message: string, agentText: string): string {
    const turnId = this.newId()
    const at = this.now()
    const person: PlaygroundEntry = { id: this.newId(), role: 'person', text: message, at, spoken: true, turnId }
    const agent: PlaygroundEntry = { id: this.newId(), role: 'agent', text: agentText, at, spoken: true, turnId, state: 'COMPLETED', firstTextAt: at }
    this.entries.push(person, agent)
    this.hq(CONVERSATION_SOCKET.turn, { conversationId: this.conversationId, turnId, state: 'RUNNING' } satisfies ConversationTurnEvent)
    this.emitEntry(person)
    this.emitEntry(agent)
    this.hq(CONVERSATION_SOCKET.turn, { conversationId: this.conversationId, turnId, state: 'COMPLETED' } satisfies ConversationTurnEvent)
    return turnId
  }

  private admit(text: string, spoken: boolean, trailedOff: boolean): PlaygroundEntry {
    const entry: PlaygroundEntry = { id: this.newId(), role: 'person', text, at: this.now(), ...(spoken && { spoken }), ...(trailedOff && { trailedOff }) }
    if (this.voice) this.voice.trailedOff = trailedOff
    this.entries.push(entry)
    this.emitEntry(entry)
    this.pending.push(entry)
    this.next()
    return entry
  }

  /** Forgets the conversation; voice ends first. */
  reset(): void {
    if (this.voice) this.endVoice(PLAYGROUND_ENDED.byPerson)
    this.running?.controller.abort()
    this.running = null
    this.pending = []
    this.entries = []
    this.light.reset()
    this.deps.out(P.cleared, {})
  }

  /** The page went: voice ends and a running reply stops. */
  close(): void {
    this.voice?.close()
    this.voice = null
    this.speech = null
    this.light.voiceEnded()
    this.hums.voiceEnded()
    this.stopSilence?.()
    this.stopSilence = null
    this.running?.controller.abort()
    this.pending = []
  }

  private async startVoice(): Promise<void> {
    if (!this.voice && !this.starting) {
      this.starting = true
      const speech = await this.deps.speech().catch((err: unknown) => ({ reason: err instanceof Error ? err.message : 'Text to speech could not be reached.' }))
      this.starting = false
      if ('reason' in speech) {
        this.hq(V.error, { conversationId: this.conversationId, message: speech.reason } satisfies VoiceErrorEvent)
        return
      }
      const session = new VoiceSession(this.conversationId, PLAYGROUND_PERSON_ID, new Set(['page']), {
        synthesize: speech.synthesize,
        ...(speech.asEncouragement && { asEncouragement: speech.asEncouragement }),
        ...(speech.steered && { steered: speech.steered }),
        toHolder: (event, payload) => this.hq(event, payload),
        speechFailed: () => this.pageLog({ level: 'error', text: "Couldn't speak this reply: text to speech failed." }),
        now: this.now,
        ...(this.deps.wait && { wait: this.deps.wait }),
      })
      this.voice = session
      this.speech = speech
      this.light.voiceStarted()
      this.hums.voiceStarted()
      this.stopSilence = (this.deps.every ?? realEvery)(1_000, () => {
        if (this.voice?.silenceCheck() === 'end') this.endVoice(PLAYGROUND_ENDED.silence)
      })
      // The stored phrases, as hq hands them on as voice starts: one event each, until voice ends.
      void speech.phrases?.(
        ({ text, tier, audio, use }) => this.hq(V.phrase, { conversationId: this.conversationId, text, tier, audio, use }),
        () => this.voice === session,
      ).catch(() => undefined)
    }
    if (!this.voice) return
    this.hq(V.state, { conversationId: this.conversationId, holderId: PLAYGROUND_PERSON_ID, startedAt: new Date(this.now()).toISOString() } satisfies VoiceStateEvent)
  }

  private endVoice(reason: string): void {
    if (!this.voice) return
    this.voice.close()
    this.voice = null
    this.speech = null
    this.light.voiceEnded()
    this.hums.voiceEnded()
    this.stopSilence?.()
    this.stopSilence = null
    this.hq(V.state, { conversationId: this.conversationId, holderId: null, startedAt: null } satisfies VoiceStateEvent)
    this.hq(V.ended, { conversationId: this.conversationId, reason } satisfies VoiceEndedEvent)
  }

  /** The person spoke over the reply: it stops, and only what they heard of it is kept. */
  private interrupt(turnId: string, heardThrough: number, heardWords: number): void {
    if (!this.voice) return
    this.voice.interrupt(turnId, heardThrough, false, heardWords)
    if (this.running?.turnId === turnId) { this.running.controller.abort(); return }
    const agent = this.agentOf(turnId)
    if (!agent) return
    // As hq (service.ts `cancelReply`): the lines heard first stay, only the reply after them is cut, and no recap.
    const prefix = this.light.prefixOf(turnId)
    const reply = replyOf(agent.text, prefix)
    const cut = this.voice.cutOf(turnId, reply)
    if (cut === undefined || cut === reply) return
    this.light.replyUnheard(turnId, false)
    agent.text = reply === agent.text || !prefix ? cut : cut.trim() ? `${prefix}\n\n${cut}` : prefix
    agent.interrupted = true
    this.emitEntry(agent)
  }

  /**
   * The person spoke again before any of the reply was heard, or after the lead held the turn: the reply is cancelled,
   * their words join the message it answers, and the whole is answered again. With no message to join, a new one.
   */
  private continueWith(turnId: string, text: string, trailedOff: boolean): void {
    const words = text.trim()
    if (!words || !this.voice) return
    this.voice.activity()
    this.voice.trailedOff = trailedOff
    const answered = this.entries.filter(e => e.role === 'person' && e.turnId === turnId)
    const last = answered.at(-1)
    const laterMessage = last && this.entries.slice(this.entries.indexOf(last) + 1).some(e => e.role === 'person')
    if (!last || laterMessage) { this.admit(words, true, trailedOff); return }
    if (this.voice.wasHeld(turnId)) this.voice.wentOnAfterHold = true
    else this.voice.interrupt(turnId, -1, true)
    last.text = `${last.text} ${words}`
    if (trailedOff) last.trailedOff = true
    else delete last.trailedOff
    this.emitEntry(last)
    if (this.running?.turnId === turnId) {
      this.running.rerun = true
      this.running.controller.abort()
      return
    }
    const agent = this.agentOf(turnId)
    // A reply written whole and never heard: its heard lines go back to start the reply that answers again; no recap.
    if (agent) { this.light.replyUnheard(turnId, true); agent.withdrawn = true; agent.text = ''; this.emitEntry(agent) }
    this.pending.unshift(...answered)
    this.next()
  }

  private agentOf(turnId: string): PlaygroundEntry | undefined {
    return this.entries.find(e => e.role === 'agent' && e.turnId === turnId)
  }

  /** Answers what is waiting, one turn at a time; a turn that ends runs the next. */
  next(): void {
    if (this.running || this.pending.length === 0 || !this.lead) return
    const answers = this.pending
    this.pending = []
    void runPlaygroundTurn(this, this.lead.run, answers, this.lead.adaptiveVoice).then(rerun => {
      if (rerun) this.pending.unshift(...answers)
      this.next()
    })
  }
}
