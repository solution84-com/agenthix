/**
 * The listening read and its sounds in the voice playground (adaptive voice listening, spec §The backchannel): the
 * page's `backchannel` questions answered by hq's own listening read (`../humService/service`) on the model the page
 * picked (none: hq's own choice, purpose `backchannel`), with no ledger; and its `backchannelSpeak` requests answered
 * from the hum library as hq answers them, kept per voice on hq's disk (`../humService/store`), with the tones' steering
 * the page changed, for that page only.
 */
import { CONVERSATION_VOICE_PAGE_SOCKET as VP } from '@agenthix/core'
import { HQ_LISTENER_CHOICE, type PlaygroundLightConfig } from '../../../shared/voicePlaygroundLight'
import type { ModelAdapter, ResolvedAccess } from '../../contract'
import type { SteeringChanges } from '../../voiceClient/backchannel/kinds'
import { HUM_RECENT, HUM_CALL_LIMIT_MS } from '../humService/instructions'
import { createHumService, soundRequestOf, type HumSession, type HumSound } from '../humService/service'
import type { StoredSound } from '../humService/store'
import { field } from './light/payload'

export interface HumsHost {
  readonly conversationId: string
  hq(event: string, payload: unknown): void
  now(): number
  log(line: string): void
  config(): PlaygroundLightConfig
  /** Whether the sound is made for the playground's voice, with the steering the page changed. */
  made(sound: HumSound, steering: SteeringChanges): Promise<boolean>
  /** A sound's audio in the agent's voice, with the steering the page changed, kept or made now; null when it cannot be made. */
  sound(sound: HumSound, steering: SteeringChanges): Promise<StoredSound | null>
  /** Tone as the page last said: off, every read is calm; the voice hint in hq's words. */
  tone?(): { on: boolean; hint: string | null }
}

export interface HumsDeps {
  model: Pick<ModelAdapter, 'complete'>
  /** The listening read's access: the model named, or hq's own choice (null); throws with a line the page shows. */
  access(model: string | null): Promise<ResolvedAccess>
}

export class PlaygroundHums {
  private session: HumSession | null = null
  private accesses = new Map<string, Promise<ResolvedAccess>>()
  private readonly service

  constructor(private readonly host: HumsHost, private readonly deps: HumsDeps | undefined) {
    this.service = createHumService({
      // Not tied to Adaptive voice: the page's backchannel switch alone says whether it asks (the light model on or off).
      enabled: async () => host.config().on && !!deps,
      access: () => this.accessOf(host.config().humModel ?? null),
      model: { complete: request => this.deps!.model.complete(request) },
      send: (_s, event) => host.hq(VP.backchannelKind, event),
      made: (_s, sound) => host.made(sound, host.config().humSteering ?? {}),
      speak: (_s, sound) => host.sound(sound, host.config().humSteering ?? {}),
      sendSound: (_s, event) => host.hq(VP.backchannelSound, event),
      ...(host.tone && { tone: () => host.tone!() }),
      now: () => host.now(),
      timeoutMs: HUM_CALL_LIMIT_MS,
    })
  }

  voiceStarted(): void { this.session = { conversationId: this.host.conversationId, holderId: 'playground-person' } }
  voiceEnded(): void { this.session = null }

  ask(payload: unknown): void {
    const seq = field(payload, 'seq')
    const text = field(payload, 'text')
    if (!this.session || typeof seq !== 'number' || !Number.isSafeInteger(seq) || typeof text !== 'string' || !text.trim() || text.length > 10_000) return
    const said = field(payload, 'recent')
    const recent = Array.isArray(said) ? said.filter((w): w is string => typeof w === 'string' && !!w.trim() && w.length <= 40).slice(-HUM_RECENT) : []
    void this.service.ask(this.session, {
      seq, text, ...(field(payload, 'atPause') === true && { atPause: true as const }), ...(recent.length > 0 && { recent }),
    }).catch(err => this.host.log(`voice playground: a listening read failed: ${String(err)}`))
  }

  /** The page asks for a kind's sounds in a tone, from the hum library. */
  speak(payload: unknown): void {
    const request = soundRequestOf(field(payload, 'kind'), field(payload, 'tone'), field(payload, 'warm'))
    if (!this.session || !request) return
    void this.service.speak(this.session, request).catch(err => this.host.log(`voice playground: a sound was not made: ${String(err)}`))
  }

  private accessOf(model: string | null): Promise<ResolvedAccess | null> {
    if (!this.deps) return Promise.resolve(null)
    const key = model ?? HQ_LISTENER_CHOICE
    let access = this.accesses.get(key)
    if (!access) {
      access = this.deps.access(model)
      this.accesses.set(key, access)
      access.catch(err => { this.accesses.delete(key); this.host.log(`voice playground: no listening read model: ${err instanceof Error ? err.message : String(err)}`) })
    }
    return access.catch(() => null)
  }
}
