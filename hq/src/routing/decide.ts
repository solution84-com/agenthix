/**
 * The resolver's rule, with no database (models from one place, part 4): from what `snapshot.ts` reads, the model via
 * provider a call is made on, or one problem naming what is missing and who adds it. core's `providers/resolver.ts`
 * states the order; in short:
 *
 * - **May run:** a provider that works, of the call's type, reaching the model, which every list that applies lets
 *   run. A person's own Claude subscription serves only work in their own place (it never pays for hq's own calls,
 *   which use an API).
 * - **A choice fixed to the call** — the person's pick, or the model a conversation talks on — is used as it is or
 *   not at all: it is never switched silently, and its problem says why (part 1, *When a provider fails*).
 * - **Defaults** — the agent's own, then the organisation's — fall through: the same model via another provider
 *   first, then the next layer, then any model that may run. `fellBack` says what was not used, once.
 */
import {
  AI_PROVIDER_VENDOR_INFO, modelPricesMicros, providerStateWorks, sttPricePerHourMicros,
  ttsPricePerMillionCharsMicros,
  type AiProviderCredentialKind, type AiProviderState, type AiProviderType, type AiProviderVendor, type CostBasis,
  type ModelViaProvider, type ResolveAnswer, type ResolvedFrom, type ResolveProblem, type ResolveProblemCode,
  type ResolveRequest, type Resolution, type UsagePurpose,
} from '@agenthix/core'
import { allowedByLists, type AppliedList } from './listMatch'
import { makerAndName, modelsReachedBy, reaches, runtimeFor, sameModelKey } from './modelKeys'
import { problemFor } from './problems'

export type RouteProvider = {
  id: string
  name: string
  vendor: AiProviderVendor
  credentialKind: AiProviderCredentialKind
  state: AiProviderState
  /** Set for a person's own Claude subscription. */
  ownerUserId: string | null
}

export type VoiceChoice = (ModelViaProvider & { voice?: string }) | null

export type Layers = {
  conversation: ModelViaProvider | null
  worker: ModelViaProvider | null
  stt: VoiceChoice
  tts: VoiceChoice
}

export type Snapshot = {
  /** The organisation's providers, oldest first, and the asking person's own subscription. */
  providers: RouteProvider[]
  org: Layers
  agent: Layers | null
  agentName: string | null
  /** Every list that applies to the call. */
  lists: AppliedList[]
  /** The model the conversation talks on, once its first turn fixed it. */
  conversationModel: ModelViaProvider | null
  billingProfileId: string
}

const WORK: readonly UsagePurpose[] = ['worker', 'helper']
const VOICE: Partial<Record<UsagePurpose, AiProviderType>> = { stt: 'stt', tts: 'tts' }

/** Fallback speech models when voice moves to another provider than the one a choice named. */
const VOICE_MODEL: Partial<Record<AiProviderVendor, string>> = {
  assemblyai: 'universal-streaming-english', inworld: 'inworld-tts-1.5-max',
}

export type Unusable = Extract<ResolveProblemCode, 'model_not_reached' | 'provider_not_working' | 'model_not_allowed' | 'subscription_outside_own_place'>

function typeOf(purpose: UsagePurpose): AiProviderType {
  return VOICE[purpose] ?? 'llm'
}

/** Why a model via a provider may not be used for this call; null when it may. */
export function whyUnusable(choice: ModelViaProvider, req: ResolveRequest, snap: Snapshot): { code: Unusable; provider?: RouteProvider } | null {
  const provider = snap.providers.find(p => p.id === choice.providerId)
  if (!provider || !AI_PROVIDER_VENDOR_INFO[provider.vendor].types.includes(typeOf(req.purpose))) return { code: 'model_not_reached' }
  if (provider.ownerUserId !== null) {
    const own = req.place.kind === 'own' && req.place.userId === provider.ownerUserId
    if (!own || !WORK.includes(req.purpose)) return { code: 'subscription_outside_own_place', provider }
  }
  if (!providerStateWorks(provider.state)) return { code: 'provider_not_working', provider }
  if (typeOf(req.purpose) !== 'llm') return null
  if (!reaches(provider.vendor, choice.model)) return { code: 'model_not_reached', provider }
  if (!allowedByLists(snap.lists, makerAndName(provider.vendor, choice.model))) return { code: 'model_not_allowed', provider }
  return null
}

function basisOf(purpose: UsagePurpose, provider: RouteProvider, model: string): CostBasis {
  if (provider.credentialKind === 'subscription') return 'INCLUDED'
  if (provider.vendor === 'cloud') return 'AWAITING_ACTUAL'
  const priced = purpose === 'stt' ? sttPricePerHourMicros(provider.vendor, model)
    : purpose === 'tts' ? ttsPricePerMillionCharsMicros(provider.vendor, model)
      : modelPricesMicros(provider.vendor, model)
  return priced === null ? 'UNPRICED' : 'ESTIMATED'
}

function resolution(
  req: ResolveRequest, snap: Snapshot, choice: ModelViaProvider & { voice?: string }, from: ResolvedFrom,
  fellBack: Resolution['fellBack'],
): Resolution {
  const provider = snap.providers.find(p => p.id === choice.providerId)!
  return {
    purpose: req.purpose,
    model: { providerId: provider.id, model: choice.model },
    providerName: provider.name,
    vendor: provider.vendor,
    runtime: WORK.includes(req.purpose) ? runtimeFor(provider.vendor, provider.credentialKind, choice.model) : null,
    ...(choice.voice ? { voice: choice.voice } : {}),
    from,
    ...(fellBack ? { fellBack } : {}),
    basis: basisOf(req.purpose, provider, choice.model),
    billingProfileId: snap.billingProfileId,
  }
}

/** The same model via another provider that may serve this call; Anthropic's own key first, so Claude Code runs it. */
export function sameModelElsewhere(choice: ModelViaProvider, req: ResolveRequest, snap: Snapshot): ModelViaProvider | null {
  const from = snap.providers.find(p => p.id === choice.providerId)
  if (!from) return null
  const key = sameModelKey(from.vendor, choice.model)
  for (const p of snap.providers) {
    if (p.id === from.id) continue
    const same = modelsReachedBy(p.vendor).find(m => sameModelKey(p.vendor, m.model) === key)
    if (same && !whyUnusable({ providerId: p.id, model: same.model }, req, snap)) return { providerId: p.id, model: same.model }
  }
  return null
}

/** Every model via a provider this call may run on, in provider order and the catalogue's order. */
export function usableModels(req: ResolveRequest, snap: Snapshot, typed: ReadonlyMap<string, readonly string[]> = new Map()): ModelViaProvider[] {
  const out: ModelViaProvider[] = []
  for (const p of snap.providers) {
    for (const m of modelsReachedBy(p.vendor, typed.get(p.id) ?? [])) {
      const choice = { providerId: p.id, model: m.model }
      if (!whyUnusable(choice, req, snap)) out.push(choice)
    }
  }
  return out
}

function anyVoice(req: ResolveRequest, snap: Snapshot): (ModelViaProvider & { voice?: string }) | null {
  const type = typeOf(req.purpose)
  const p = snap.providers.find(x => AI_PROVIDER_VENDOR_INFO[x.vendor].types.includes(type) && !whyUnusable({ providerId: x.id, model: '' }, req, snap))
  return p ? { providerId: p.id, model: VOICE_MODEL[p.vendor] ?? '' } : null
}

type Layer = { choice: (ModelViaProvider & { voice?: string }) | null; from: ResolvedFrom }

function layersFor(req: ResolveRequest, snap: Snapshot): { fixed: Layer | null; defaults: Layer[] } {
  if (req.pick) return { fixed: { choice: req.pick, from: 'pick' }, defaults: [] }
  const slot: keyof Layers = req.purpose === 'stt' ? 'stt' : req.purpose === 'tts' ? 'tts'
    : WORK.includes(req.purpose) ? 'worker' : 'conversation'
  const talking = req.purpose === 'conversation' || req.purpose === 'title' || req.purpose === 'summary'
  if (talking && snap.conversationModel) return { fixed: { choice: snap.conversationModel, from: 'conversation' }, defaults: [] }
  const agent = req.purpose === 'voice_sample' ? null : snap.agent
  return {
    fixed: null,
    defaults: [{ choice: agent?.[slot] ?? null, from: 'agent' }, { choice: snap.org[slot], from: 'organisation' }],
  }
}

function fail(code: ResolveProblemCode, req: ResolveRequest, snap: Snapshot, provider?: RouteProvider): ResolveAnswer {
  const problem: ResolveProblem = problemFor(code, { purpose: req.purpose, provider, agentName: snap.agentName })
  return { ok: false, problem }
}

export function decide(req: ResolveRequest, snap: Snapshot): ResolveAnswer {
  const type = typeOf(req.purpose)
  const ofType = snap.providers.filter(p => p.ownerUserId === null && AI_PROVIDER_VENDOR_INFO[p.vendor].types.includes(type))
  const { fixed, defaults } = layersFor(req, snap)

  if (fixed?.choice) {
    const why = whyUnusable(fixed.choice, req, snap)
    if (why) return fail(why.code, req, snap, why.provider)
    return { ok: true, resolution: resolution(req, snap, fixed.choice, fixed.from, undefined) }
  }

  let missed: Resolution['fellBack']
  for (const layer of defaults) {
    if (!layer.choice) continue
    const why = whyUnusable(layer.choice, req, snap)
    if (!why) return { ok: true, resolution: resolution(req, snap, layer.choice, layer.from, missed) }
    missed ??= { from: { providerId: layer.choice.providerId, model: layer.choice.model }, reason: why.code }
    const same = type === 'llm' ? sameModelElsewhere(layer.choice, req, snap) : null
    if (same) return { ok: true, resolution: resolution(req, snap, same, layer.from, missed) }
  }

  const fallback = type === 'llm' ? usableModels(req, snap)[0] ?? null : anyVoice(req, snap)
  if (fallback) return { ok: true, resolution: resolution(req, snap, fallback, 'organisation', missed) }
  if (type !== 'llm' || !ofType.some(p => providerStateWorks(p.state))) return fail('no_provider', req, snap)
  return fail(defaults.some(l => l.choice) ? 'no_allowed_model' : 'no_default', req, snap)
}