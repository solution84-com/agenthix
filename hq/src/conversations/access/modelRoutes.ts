/**
 * The models a conversation can talk on, as the model picker shows them (model access and policy spec, *The
 * person keeps one knob*), with no database: which catalogue models each provider's key reaches, which ids name
 * the same model on another route (Claude direct and through OpenRouter), who makes a model, and its price hint.
 *
 * A conversation talks through the AI SDK, which takes a bare Claude id on an Anthropic key and the rest of a
 * `<provider>/<model>` id on the others (model/providers.ts). So an Anthropic key reaches the bare Claude ids,
 * never OpenCode's `anthropic/…` form, and an OpenAI-compatible endpoint reaches only the models a policy names
 * on it: its models are typed, not catalogued.
 */
import {
  CLAUDE_SDK_MODELS, OPENAI_COMPATIBLE_PREFIX, OPENCODE_MODELS, costBand, isTypedModel,
  type CredentialProvider, type ModelPreset,
} from '@agenthix/core'
import type { EffectiveModelPolicy } from '../contract'
import { isPolicyModel, isWithinPolicy, policyModelRank, providerOfPolicyModel } from '../../model-policy/policyModels'
import { PROVIDER_LABELS } from '../../shared/modelProviders'

export type RoutedModel = { value: string; label: string; provider: CredentialProvider; costRank: number | null }

const OPENCODE_ANTHROPIC = 'anthropic/'

/** A model a conversation can be given as it is: known, naming a provider, and not OpenCode's Anthropic form. */
export function isConversationModel(value: string): boolean {
  return isPolicyModel(value) && !value.startsWith(OPENCODE_ANTHROPIC)
}

/** The catalogue models a provider's key reaches for a conversation. */
export function catalogueFor(provider: CredentialProvider): readonly ModelPreset[] {
  if (provider === 'anthropic') return CLAUDE_SDK_MODELS
  if (provider === 'openai_compatible') return []
  return OPENCODE_MODELS.filter(m => m.provider === provider)
}

/**
 * What a model is, whatever route reaches it: the id without its route (`openrouter/`, and a bare Claude id read
 * as Anthropic's), with OpenRouter's dotted versions read as Anthropic's hyphenated ones (`4.5` and `4-5`).
 */
export function sameModelKey(value: string): string {
  let id = value
  if (id.startsWith('openrouter/')) id = id.slice('openrouter/'.length)
  else if (!id.includes('/')) id = OPENCODE_ANTHROPIC + id
  return id.toLowerCase().replace(/\./g, '-')
}

let byKey: Map<string, RoutedModel[]> | null = null

function conversationCatalogue(): Map<string, RoutedModel[]> {
  if (byKey) return byKey
  byKey = new Map()
  for (const provider of ['anthropic', 'openrouter', 'openai', 'google'] as const) {
    for (const m of catalogueFor(provider)) {
      const routed = { value: m.value, label: m.label, provider, costRank: m.costRank }
      const key = sameModelKey(m.value)
      byKey.set(key, [...(byKey.get(key) ?? []), routed])
    }
  }
  return byKey
}

/** A model a conversation can be given, as the picker shows it; null for one it cannot. */
export function routedModel(value: string): RoutedModel | null {
  if (!isConversationModel(value)) return null
  const provider = providerOfPolicyModel(value)
  if (!provider) return null
  if (isTypedModel(value)) return { value, label: value.slice(OPENAI_COMPATIBLE_PREFIX.length), provider, costRank: policyModelRank(value) }
  return conversationCatalogue().get(sameModelKey(value))?.find(m => m.value === value) ?? null
}

/** Every id a conversation can be given for this model, the one named first when it can be given as it is. */
export function routesOf(value: string): RoutedModel[] {
  const own = routedModel(value)
  const others = (conversationCatalogue().get(sameModelKey(value)) ?? []).filter(m => m.value !== value)
  return own ? [own, ...others] : others
}

/**
 * Within the policy: no dearer than its ceiling, and in its allow-list by what the model is, so a policy that
 * allows Claude Sonnet 5 allows it through OpenRouter too — the same model, on another route.
 */
export function isWithinPolicyOnAnyRoute(value: string, policy: Pick<EffectiveModelPolicy, 'allowed' | 'ceiling'>): boolean {
  if (!isWithinPolicy(value, { allowed: null, ceiling: policy.ceiling })) return false
  if (!policy.allowed) return true
  const key = sameModelKey(value)
  return policy.allowed.some(m => m === value || sameModelKey(m) === key)
}

/** The policy's talking model first, then every other model it allows, each once. */
export function talkingCandidates(policy: EffectiveModelPolicy): string[] {
  const others = policy.allowed ?? [policy.lightWork, policy.heavyWork]
  return [...new Set([policy.talking, ...others])].filter(m => isWithinPolicy(m, policy))
}

/**
 * The routes a conversation's talking model is chosen from, in the order it is chosen: each candidate's own id,
 * then the same model through another access (Claude through OpenRouter), before the next candidate.
 */
export function talkingRoutes(policy: EffectiveModelPolicy): RoutedModel[] {
  const seen = new Set<string>()
  const routes: RoutedModel[] = []
  for (const model of talkingCandidates(policy)) {
    for (const route of routesOf(model)) {
      if (seen.has(route.value) || !isWithinPolicyOnAnyRoute(route.value, policy)) continue
      seen.add(route.value)
      routes.push(route)
    }
  }
  return routes
}

/** The models an OpenAI-compatible endpoint reaches: those the policy names, being typed rather than catalogued. */
export function typedModelsNamedBy(policy: EffectiveModelPolicy): string[] {
  const named = [policy.talking, policy.lightWork, policy.heavyWork, ...(policy.allowed ?? [])]
  return [...new Set(named.filter(m => isTypedModel(m)))]
}

const MAKER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', deepseek: 'DeepSeek', qwen: 'Qwen', mistralai: 'Mistral',
  'z-ai': 'Z.ai', 'x-ai': 'xAI', meta: 'Meta', 'meta-llama': 'Meta', moonshotai: 'Moonshot AI', nvidia: 'NVIDIA',
  minimax: 'MiniMax', 'bytedance-seed': 'ByteDance', xiaomi: 'Xiaomi', amazon: 'Amazon', cohere: 'Cohere',
  tencent: 'Tencent', inclusionai: 'inclusionAI', 'ibm-granite': 'IBM', openrouter: 'OpenRouter', 'aion-labs': 'Aion Labs',
}

/** Who makes a model, for grouping: from its id, `openrouter/deepseek/…` being DeepSeek's and a bare Claude id Anthropic's. */
export function makerOf(value: string): string {
  if (isTypedModel(value)) return PROVIDER_LABELS.openai_compatible
  const maker = sameModelKey(value).split('/')[0].replace(/^~/, '')
  return MAKER_LABELS[maker] ?? maker.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/** The rough price hint, 1 to 3 ($ to $$$), from core's cost bands; a free or unpriced model is the cheapest. */
export function priceOf(costRank: number | null): 1 | 2 | 3 {
  const band = costRank === null ? 'free' : costBand(costRank)
  return band === 'high' ? 3 : band === 'mid' ? 2 : 1
}

export function viaLabel(provider: CredentialProvider): string {
  return provider === 'openai_compatible' ? 'via your OpenAI-compatible endpoint' : `via ${PROVIDER_LABELS[provider]}`
}
