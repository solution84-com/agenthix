/**
 * The organisation's three defaults, chosen from what setup added (setup spec, step 6) so a new organisation never
 * runs on the resolver's last-resort fallback: the one default model (a conversation's, which the work it hands off
 * runs on too), speech and listening. Only a default
 * that is not set yet is written; one the person changed on the last look stays.
 */
import { prisma } from 'wasp/server'
import {
  defaultModelOf, providerStateWorks, providerTypesOf,
  type AiProviderState, type AiProviderType, type AiProviderVendor, type ModelViaProvider, type VoiceViaProvider,
} from '@agenthix/core'
import { vendorChecks } from '../providers/checks'
import { providerStore } from '../providers/store'
import { typesOfVendor } from '../providers/typeGate'
import { refreshAllInworldModels } from '../routing/inworldModelsRefresh'
import { modelsReachedBy } from '../routing/modelKeys'
import { DEFAULT_VOICE, listeningModelOf, VOICE_TTS_MODEL } from '../voice/voiceModels'

/** `types` are the ones the organisation's flags let it serve (providers/typeGate.ts); the vendor's own when absent. */
export type ProviderFact = { id: string; vendor: AiProviderVendor; state: AiProviderState; types?: readonly AiProviderType[] }

const typesOf = (p: ProviderFact): readonly AiProviderType[] => p.types ?? providerTypesOf(p.vendor)

export type Defaults = {
  conversation: ModelViaProvider | null
  stt: VoiceViaProvider | null
  tts: VoiceViaProvider | null
}

/**
 * The provider's recommended model: the newest of its named family (ADR-0184), by the price band when it has none. A
 * provider with no catalogued models recommends none.
 */
export const recommendedModel = (vendor: AiProviderVendor): string | null => defaultModelOf(vendor, modelsReachedBy(vendor)).model

/** The providers with the types the organisation's flags let each serve, so Inworld counts as a model provider only while its flag is on. */
export const withFlaggedTypes = <P extends ProviderFact>(providers: readonly P[]): Promise<P[]> =>
  Promise.all(providers.map(async p => ({ ...p, types: await typesOfVendor(p.vendor) })))

/** The oldest provider that works and serves the type: providers are listed oldest first. */
const firstFor = (providers: readonly ProviderFact[], type: AiProviderType) =>
  providers.find(p => providerStateWorks(p.state) && typesOf(p).includes(type))

/**
 * What is set stays; what is not is filled from the providers. A model default needs a provider that reaches a
 * recommended model, or, on an OpenAI-compatible endpoint with none, the first model it lists; speech uses the first
 * working provider of its type, and listening Inworld when it works (one key for both), else the first.
 */
export function proposeDefaults(providers: readonly ProviderFact[], current: Defaults, listed: ReadonlyMap<string, string> = new Map()): Defaults {
  const model = (): ModelViaProvider | null => {
    if (current.conversation) return current.conversation
    for (const p of providers) {
      if (!providerStateWorks(p.state) || !typesOf(p).includes('llm')) continue
      const chosen = recommendedModel(p.vendor)
      if (chosen) return { providerId: p.id, model: chosen }
      const first = listed.get(p.id)
      if (first) return { providerId: p.id, model: first }
    }
    return null
  }
  const tts = firstFor(providers, 'tts')
  const stt = providers.find(p => p.vendor === 'inworld' && providerStateWorks(p.state)) ?? firstFor(providers, 'stt')
  return {
    conversation: model(),
    tts: current.tts ?? (tts ? { providerId: tts.id, model: VOICE_TTS_MODEL, voice: DEFAULT_VOICE } : null),
    stt: current.stt ?? (stt ? { providerId: stt.id, model: listeningModelOf(stt.vendor) } : null),
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
      id: true, defaultConversationProviderId: true, defaultConversationModel: true,
      defaultSttProviderId: true, defaultSttModel: true, defaultTtsProviderId: true, defaultTtsModel: true, defaultTtsVoice: true,
    },
  })
  if (!o) return null
  const pair = (providerId: string | null, model: string | null) => (providerId && model ? { providerId, model } : null)
  return {
    orgId: o.id,
    current: {
      conversation: pair(o.defaultConversationProviderId, o.defaultConversationModel),
      stt: o.defaultSttProviderId ? { providerId: o.defaultSttProviderId, model: o.defaultSttModel ?? '' } : null,
      tts: o.defaultTtsProviderId ? { providerId: o.defaultTtsProviderId, model: o.defaultTtsModel ?? '', ...(o.defaultTtsVoice ? { voice: o.defaultTtsVoice } : {}) } : null,
    },
  }
}

/** Writes the defaults that are not set yet; called as setup finishes, and whenever a provider's key is found to work. */
export async function writeSetupDefaults(providers: readonly ProviderFact[]): Promise<void> {
  const found = await currentDefaults()
  if (!found) return
  // An Inworld provider reaches the models its list holds; one with no list read yet has it read first (adr-0183).
  await refreshAllInworldModels(true)
  const next = proposeDefaults(await withFlaggedTypes(providers), found.current, await firstListedModels(providers))
  const data: Record<string, string | null> = {}
  if (!found.current.conversation && next.conversation) {
    Object.assign(data, { defaultConversationProviderId: next.conversation.providerId, defaultConversationModel: next.conversation.model })
  }
  if (!found.current.stt && next.stt) Object.assign(data, { defaultSttProviderId: next.stt.providerId, defaultSttModel: next.stt.model })
  if (!found.current.tts && next.tts) {
    Object.assign(data, { defaultTtsProviderId: next.tts.providerId, defaultTtsModel: next.tts.model, defaultTtsVoice: next.tts.voice ?? null })
  }
  if (Object.keys(data).length > 0) await prisma.org.update({ where: { id: found.orgId }, data })
}

/** After a provider is added or its key replaced: setup may have left models or voice for later (ADR-0160). */
export async function fillEmptyDefaults(): Promise<void> {
  await writeSetupDefaults(await providerStore().list())
}
