/**
 * The organisation's four defaults, chosen from what setup added (setup spec, step 6) so a new organisation never runs
 * on the resolver's last-resort fallback: the conversation and worker models, speech and listening. Only a default
 * that is not set yet is written; one the person changed on the last look stays.
 */
import { prisma } from 'wasp/server'
import {
  COST_BAND_MAX_RANKS, providerStateWorks, providerTypesOf,
  type AiProviderState, type AiProviderType, type AiProviderVendor, type ModelViaProvider, type VoiceViaProvider,
} from '@agenthix/core'
import { vendorChecks } from '../providers/checks'
import { providerStore } from '../providers/store'
import { modelsReachedBy, sameModelKey } from '../routing/modelKeys'
import { DEFAULT_LISTENING_MODEL, DEFAULT_VOICE, VOICE_TTS_MODEL } from '../voice/voiceModels'

export type ProviderFact = { id: string; vendor: AiProviderVendor; state: AiProviderState }

export type Defaults = {
  conversation: ModelViaProvider | null
  worker: ModelViaProvider | null
  stt: VoiceViaProvider | null
  tts: VoiceViaProvider | null
}

/** The models to talk and to work on, by the maker and name every provider's catalogue agrees on. */
const PREFERRED = { conversation: 'anthropic/claude-sonnet-5', worker: 'anthropic/claude-opus-5' } as const

/**
 * The provider's recommended models. Claude Sonnet 5 talks and Claude Opus 5 works wherever the provider reaches them.
 * Otherwise from the catalogue by price: the dearest model of the middle band talks, the cheapest of the top band
 * works, each falling back to the nearest band the provider has. A provider with no catalogued models recommends none.
 */
export function recommendedModels(vendor: AiProviderVendor): { conversation: string | null; worker: string | null } {
  const reached = modelsReachedBy(vendor)
  const find = (key: string) => reached.find(m => sameModelKey(vendor, m.model) === key)?.model ?? null
  const preferred = { conversation: find(PREFERRED.conversation), worker: find(PREFERRED.worker) }
  if (preferred.conversation && preferred.worker) return preferred
  const ranked = reached.filter(m => m.costRank !== null) as (typeof reached[number] & { costRank: number })[]
  if (ranked.length === 0) return preferred
  const { low, mid } = COST_BAND_MAX_RANKS
  const inBand = (from: number, to: number) => ranked.filter(m => m.costRank > from && m.costRank <= to)
  const mids = inBand(low, mid)
  const highs = ranked.filter(m => m.costRank > mid)
  const lows = ranked.filter(m => m.costRank <= low)
  const dearest = (xs: typeof ranked) => xs.reduce<typeof ranked[number] | null>((a, m) => (!a || m.costRank > a.costRank ? m : a), null)
  const cheapest = (xs: typeof ranked) => xs.reduce<typeof ranked[number] | null>((a, m) => (!a || m.costRank < a.costRank ? m : a), null)
  const talk = dearest(mids) ?? dearest(lows) ?? cheapest(highs)
  const work = cheapest(highs) ?? dearest(mids) ?? dearest(lows)
  return { conversation: preferred.conversation ?? talk?.model ?? null, worker: preferred.worker ?? work?.model ?? null }
}

/** The oldest provider that works and serves the type: providers are listed oldest first. */
const firstFor = (providers: readonly ProviderFact[], type: AiProviderType) =>
  providers.find(p => providerStateWorks(p.state) && providerTypesOf(p.vendor).includes(type))

/**
 * What is set stays; what is not is filled from the providers. A model default needs a provider that reaches a
 * recommended model, or, on an OpenAI-compatible endpoint with none, the first model it lists; speech and listening use the first working provider of their type.
 */
export function proposeDefaults(providers: readonly ProviderFact[], current: Defaults, listed: ReadonlyMap<string, string> = new Map()): Defaults {
  const model = (slot: 'conversation' | 'worker'): ModelViaProvider | null => {
    if (current[slot]) return current[slot]
    for (const p of providers) {
      if (!providerStateWorks(p.state) || !providerTypesOf(p.vendor).includes('llm')) continue
      const chosen = recommendedModels(p.vendor)[slot]
      if (chosen) return { providerId: p.id, model: chosen }
      const first = listed.get(p.id)
      if (first) return { providerId: p.id, model: first }
    }
    return null
  }
  const tts = firstFor(providers, 'tts')
  const stt = firstFor(providers, 'stt')
  return {
    conversation: model('conversation'),
    worker: model('worker'),
    tts: current.tts ?? (tts ? { providerId: tts.id, model: VOICE_TTS_MODEL, voice: DEFAULT_VOICE } : null),
    stt: current.stt ?? (stt ? { providerId: stt.id, model: DEFAULT_LISTENING_MODEL } : null),
  }
}

/**
 * For each working OpenAI-compatible endpoint, the first model it lists: its own catalogue is the only one there is.
 * An endpoint that lists nothing or cannot be reached is left out, so finishing is never blocked.
 */
export async function firstListedModels(providers: readonly ProviderFact[]): Promise<Map<string, string>> {
  const first = new Map<string, string>()
  for (const p of providers) {
    if (p.vendor !== 'openai_compatible' || !providerStateWorks(p.state)) continue
    const credential = await providerStore().credentialOf(p.id)
    if (!credential) continue
    const [model] = await vendorChecks().listModels({ vendor: 'openai_compatible', key: credential.key, baseUrl: credential.baseUrl })
    if (model) first.set(p.id, model)
  }
  return first
}

export async function currentDefaults(): Promise<{ orgId: string; current: Defaults } | null> {
  const o = await prisma.org.findFirst({
    select: {
      id: true, defaultConversationProviderId: true, defaultConversationModel: true, defaultWorkerProviderId: true, defaultWorkerModel: true,
      defaultSttProviderId: true, defaultSttModel: true, defaultTtsProviderId: true, defaultTtsModel: true, defaultTtsVoice: true,
    },
  })
  if (!o) return null
  const pair = (providerId: string | null, model: string | null) => (providerId && model ? { providerId, model } : null)
  return {
    orgId: o.id,
    current: {
      conversation: pair(o.defaultConversationProviderId, o.defaultConversationModel),
      worker: pair(o.defaultWorkerProviderId, o.defaultWorkerModel),
      stt: o.defaultSttProviderId ? { providerId: o.defaultSttProviderId, model: o.defaultSttModel ?? '' } : null,
      tts: o.defaultTtsProviderId ? { providerId: o.defaultTtsProviderId, model: o.defaultTtsModel ?? '', ...(o.defaultTtsVoice ? { voice: o.defaultTtsVoice } : {}) } : null,
    },
  }
}

/** Writes the defaults that are not set yet; called as setup finishes. */
export async function writeSetupDefaults(providers: readonly ProviderFact[]): Promise<void> {
  const found = await currentDefaults()
  if (!found) return
  const next = proposeDefaults(providers, found.current, await firstListedModels(providers))
  const data: Record<string, string | null> = {}
  for (const slot of ['conversation', 'worker'] as const) {
    if (!found.current[slot] && next[slot]) Object.assign(data, { [`default${cap(slot)}ProviderId`]: next[slot]!.providerId, [`default${cap(slot)}Model`]: next[slot]!.model })
  }
  if (!found.current.stt && next.stt) Object.assign(data, { defaultSttProviderId: next.stt.providerId, defaultSttModel: next.stt.model })
  if (!found.current.tts && next.tts) {
    Object.assign(data, { defaultTtsProviderId: next.tts.providerId, defaultTtsModel: next.tts.model, defaultTtsVoice: next.tts.voice ?? null })
  }
  if (Object.keys(data).length > 0) await prisma.org.update({ where: { id: found.orgId }, data })
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
