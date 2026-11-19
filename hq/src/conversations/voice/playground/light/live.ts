/**
 * Live with the light model (plan task 5.1): the playground's voice runs hq's own listening call (`createListening`,
 * through `recordedListening`) with playground deps — its in-memory conversation for the last exchanges, the recap in
 * memory, a hand over admitted as the playground's own spoken message (answered by the lead chosen on the page), a
 * turn closed alone recorded in its conversation, the lines made by the organisation's text to speech and sent in
 * parts as hq sends them (listening/lines.ts), and no ledger. A reply that turns out not to be heard — withdrawn by a
 * continue, or cut by the person speaking over it — gets no recap (`replyUnheard`), as in hq.
 * The page's settings apply from the next call: the call is remade on them, and the session's listening state, kept
 * by the session, carries on.
 */
import type { VoiceHumTone, VoiceListenStyle } from '@agenthix/core'
import type { PlaygroundEntry } from '../../../../shared/voicePlayground'
import {
  HQ_LISTENER_CHOICE, LIGHT_SOCKET as L, type LightRecapRow, type LineDirection, type PlaygroundLightConfig,
} from '../../../../shared/voicePlaygroundLight'
import type { ModelAdapter, ResolvedAccess } from '../../../contract'
import { CONVERSATION_VOICE_SOCKET as V } from '../../../../shared/conversations/voice'
import { buildRecapCall, listenerSettingsWith, readRecap, type ListenerSettings } from '../../listener'
import type { ListeningContext, ListeningDeps, ListeningSession } from '../../listening/listen'
import { withHeardLines } from '../../listening/heard'
import { lineParts } from '../../listening/lineParts'
import { listeningIfAny, listeningOf } from '../../listening/state'
import type { StoredPool } from '../../phrases'
import type { TurnSpeech } from '../../session'
import { readable } from '../context'
import { PLAYGROUND_AGENT, PLAYGROUND_PERSON } from './names'
import { LIGHT_OFF, field, lightConfigFrom, listenPayloadFrom } from './payload'
import { recordedListening } from './recorder'

/** What the playground reaches for the light model; absent in a test that runs none. */
export interface LightDeps {
  model: Pick<ModelAdapter, 'complete'>
  /** The light model's access: the model named, or hq's own choice for listening (null); throws with a line the page shows. */
  access(model: string | null): Promise<ResolvedAccess>
  /** A heavy model's access, for the recap. */
  heavyAccess(model: string): Promise<ResolvedAccess>
}

/** What the playground's conversation gives the light model. */
export interface LightHost {
  readonly conversationId: string
  out(event: string, payload: unknown): void
  /** One of hq's voice events, to the page under the playground's prefix. */
  hq(event: string, payload: unknown): void
  now(): number
  newId(): string
  log(line: string): void
  entries(): readonly PlaygroundEntry[]
  /** The person's words, as a spoken message the lead answers. */
  admit(text: string, config: PlaygroundLightConfig): void
  /** A turn the light model closed alone: the person's message and what they heard, as a completed turn; its id. */
  closeTurn(message: string, agentText: string): string
  /** A line's audio as it streams in, in the agent's voice, the direction asked and its tone; null when voice has no speech. */
  line(text: string, direction: LineDirection, tone?: VoiceHumTone): AsyncIterable<Buffer> | null
  /** How the person sounds, in hq's words, with Tone on; null otherwise. */
  voiceHint?(): string | null
  stored(avoid: readonly string[], pool: StoredPool): Promise<{ text: string; audio: Buffer } | null>
}

/** How long the recap call may take: well within the time the reply takes to be heard, as hq's. */
const RECAP_WAIT_MS = 20_000

export class PlaygroundLight {
  config: PlaygroundLightConfig = LIGHT_OFF
  settings: ListenerSettings = listenerSettingsWith({})
  recap: string | null = null
  private session: ListeningSession | null = null
  private listening: ReturnType<typeof recordedListening>
  private accesses = new Map<string, Promise<ResolvedAccess>>()

  constructor(private readonly host: LightHost, private readonly deps: LightDeps | undefined) {
    this.listening = this.made()
  }

  /** The page's switch on: a reply the person hears is told only how to speak. */
  get on(): boolean { return this.config.on }

  configure(payload: unknown): void {
    const next = lightConfigFrom(payload)
    if (next.model !== this.config.model) this.accesses.clear()
    this.config = next
    this.settings = listenerSettingsWith(next.settings)
    this.listening = this.made()
  }

  voiceStarted(): void {
    this.session = { conversationId: this.host.conversationId, holderId: 'playground-person' }
  }

  voiceEnded(): void {
    if (this.session) listeningIfAny(this.session)?.close()
    this.session = null
  }

  /** Forgets the conversation's recap, as a new conversation has none. */
  reset(): void { this.recap = null }

  listen(payload: unknown): void {
    const p = listenPayloadFrom(payload)
    const session = this.session
    if (!p || !session) return
    void this.listening.listen(session, p).catch(err => this.host.log(`voice playground: a listening call failed: ${String(err)}`))
  }

  /** The reply set a listening style (`set_listening_style`): sent as hq sends it. */
  style(style: VoiceListenStyle): boolean {
    if (!this.session) return false
    this.listening.style(this.session, style)
    return true
  }

  played(payload: unknown): void {
    const lineId = field(payload, 'lineId')
    // A line the page dropped was never heard: it is not recorded as played.
    if (field(payload, 'skipped') === true) return
    if (this.session && typeof lineId === 'string' && lineId.length <= 200) this.listening.played(this.session, lineId)
  }

  /**
   * A heavy reply under the light model: its agent message starts with the lines heard, and once it is written, the
   * recap is written after it. Unchanged while the light model has not answered in this voice session.
   */
  turnSpeech(speech: TurnSpeech | null, turnId: string, message: string): TurnSpeech | null {
    const state = this.session ? listeningIfAny(this.session) : undefined
    if (!speech || !state?.active) return speech
    return withHeardLines(speech, turnId, state, (agentText, unheard) => { void this.writeRecap(message, agentText, unheard) })
  }

  /** The lines a turn's agent message starts with, as heard. */
  prefixOf(turnId: string): string | undefined {
    return this.session ? listeningIfAny(this.session)?.prefixOf(turnId) : undefined
  }

  /** A reply written whole turned out not to be heard: withdrawn by a continue, or cut by the person (hq: `cancelReply`). */
  replyUnheard(turnId: string, withdrawn: boolean): void {
    if (this.session) listeningIfAny(this.session)?.replyUnheard(turnId, withdrawn)
  }

  /** The recap after a reply; `unheard` aborts the call, or puts the last recap back once written, as hq's (recapCall.ts). */
  async writeRecap(message: string, agentMessage: string, unheard?: AbortSignal): Promise<void> {
    const at = this.host.now()
    const row = (r: Omit<LightRecapRow, 'id' | 'at' | 'ms'>) => this.host.out(L.recap, { id: this.host.newId(), at: this.host.now(), ms: this.host.now() - at, ...r } satisfies LightRecapRow)
    const notHeard = () => row({ text: null, error: 'Not written: its reply was not heard, the last recap is kept.' })
    const lead = this.config.lead
    if (lead.kind !== 'model' || !this.deps) return row({ text: null, error: 'No recap: the fake model writes none.' })
    if (unheard?.aborted) return notHeard()
    const previous = this.recap
    let recap: string | null
    try {
      const call = buildRecapCall({ agent: PLAYGROUND_AGENT, person: PLAYGROUND_PERSON, previousRecap: previous, message, agentMessage }, this.settings)
      const timeout = AbortSignal.timeout(RECAP_WAIT_MS)
      const { text } = await this.deps.model.complete({
        access: await this.deps.heavyAccess(lead.model), system: [{ text: call.system }], messages: [{ role: 'user', content: call.user }],
        cacheKey: `voice-playground-recap:${this.host.conversationId}`, maxOutputTokens: 400, spoken: true,
        signal: unheard ? AbortSignal.any([unheard, timeout]) : timeout,
      })
      recap = readRecap(text, this.settings)
    } catch (err) {
      if (unheard?.aborted) return notHeard()
      return row({ text: null, error: `Not written, the last recap is kept: ${err instanceof Error ? err.message : String(err)}` })
    }
    if (unheard?.aborted) return notHeard()
    if (!recap) return row({ text: null, error: 'Empty: the last recap is kept.' })
    this.recap = recap
    row({ text: recap })
    // Cut after it was written: the last one goes back, unless a later recap has replaced it.
    unheard?.addEventListener('abort', () => {
      if (this.recap !== recap) return
      this.recap = previous
      row({ text: null, error: 'Its reply was not heard: the last recap is put back.' })
    }, { once: true })
  }

  private accessOf(model: string | null): Promise<ResolvedAccess | null> {
    if (!this.deps) return Promise.resolve(null)
    const key = model ?? HQ_LISTENER_CHOICE
    let access = this.accesses.get(key)
    if (!access) {
      access = this.deps.access(model)
      this.accesses.set(key, access)
      // A failure is said once, then asked again on the next call.
      access.catch(err => { this.accesses.delete(key); this.host.log(`voice playground: no light model: ${err instanceof Error ? err.message : String(err)}`) })
    }
    return access.catch(() => null)
  }

  private context(): ListeningContext {
    const n = this.settings.recentExchanges
    const exchanges = n > 0 ? readable(this.host.entries()).filter(e => !e.sound).slice(-n).map(e => ({ who: e.role, text: e.text })) : []
    const voiceHint = this.host.voiceHint?.() ?? null
    return { agent: PLAYGROUND_AGENT, person: PLAYGROUND_PERSON, recap: this.recap, exchanges, ...(voiceHint && { voiceHint }) }
  }

  /** A line sent in parts as its speech streams in, as hq's `speakLine`: numbered, the last marked `end`. */
  private speakInParts(text: string, tone: VoiceHumTone | undefined, dropped: (lineId: string, err: unknown) => void): string {
    const host = this.host
    const lineId = host.newId()
    const audio = host.line(text, this.config.lineDirection, tone)
    host.log(`voice playground: line tone ${tone ?? 'calm'}${voiceHintNote(this.host)}: ${text}`)
    if (!audio) { dropped(lineId, new Error('voice has no speech')); return lineId }
    const parts = lineParts()
    let index = 0
    const send = (part: Buffer, end: boolean) =>
      host.hq(V.line, { conversationId: host.conversationId, lineId, text, audio: part, index: index++, ...(end && { end: true as const }) })
    void (async () => {
      for await (const piece of audio) {
        const part = parts.take(piece)
        if (part) send(part, false)
      }
      const last = parts.end()
      if (!parts.sent && last.byteLength === 0) throw new Error('The speech service made no audio')
      send(last, true)
    })().catch(err => {
      // What was sent plays, and ends there; a line with nothing sent is not heard.
      if (!parts.sent) return dropped(lineId, err)
      send(Buffer.alloc(0), true)
      host.log(`voice playground: a line could not be finished: ${err instanceof Error ? err.message : String(err)}`)
    })
    return lineId
  }

  private made() {
    const host = this.host
    const dropped = (session: ListeningSession, lineId: string, err: unknown) => {
      listeningOf(session).drop(lineId)
      host.log(`voice playground: a line could not be made: ${err instanceof Error ? err.message : String(err)}`)
    }
    const deps: ListeningDeps = {
      settings: this.settings,
      enabled: async () => this.config.on && this.config.adaptiveVoice,
      access: () => this.accessOf(this.config.model),
      model: { complete: request => this.deps!.model.complete(request) },
      context: async () => this.context(),
      admit: async (_session, text) => host.admit(text, this.config),
      closeTurn: async (_session, turn) => host.closeTurn(turn.message, turn.agentText),
      speak: (session, text, tone) => this.speakInParts(text, tone, (lineId, err) => dropped(session, lineId, err)),
      async speakStored(_session, avoid, pool = 'hold') {
        const clip = await host.stored(avoid, pool).catch(() => null)
        if (!clip) return null
        const lineId = host.newId()
        host.hq(V.line, { conversationId: host.conversationId, lineId, text: clip.text, audio: clip.audio, stored: true })
        return { lineId, text: clip.text }
      },
      send: (_session, event) => host.hq(V.listened, event),
      now: () => host.now(),
      later(ms, fn) {
        const timer = setTimeout(fn, ms)
        timer.unref?.()
        return () => clearTimeout(timer)
      },
      log: line => host.log(`voice playground: ${line}`),
    }
    return recordedListening(deps, {
      call: row => host.out(L.call, row),
      turn: row => host.out(L.turn, row),
      line: row => host.out(L.line, row),
    }, () => host.newId())
  }
}

const voiceHintNote = (host: { voiceHint?(): string | null }): string => {
  const hint = host.voiceHint?.() ?? null
  return hint ? ` (voice hint: ${hint})` : ''
}
