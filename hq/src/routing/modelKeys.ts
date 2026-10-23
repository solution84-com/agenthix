/**
 * What a model is, whoever serves it (models from one place, part 4). A choice is a model via a provider, its model
 * named as that provider's vendor names it: `claude-sonnet-5` at Anthropic, `deepseek/deepseek-v3.2` at OpenRouter,
 * `gpt-5` at OpenAI (core's price list reads them the same way). From that:
 *
 * - `makerAndName`: the maker and the model's name (`anthropic/claude-sonnet-5`), what lists match;
 * - `sameModelKey`: the same model on any provider, with OpenRouter's dotted versions read as hyphenated ones;
 * - `modelsReachedBy`: the models a provider reaches, from hq's pinned catalogue for the organisation's own keys;
 * - `runtimeFor` and `runtimeModelId`: the runtime a piece of work runs on, and the model as that runtime names it.
 */
import {
  CLAUDE_SDK_MODELS, CLAUDE_SDK_RUNTIME, OPENCODE_MODELS, OPENCODE_RUNTIME,
  type AgentRuntimeName, type AiProviderCredentialKind, type AiProviderVendor,
} from '@agenthix/core'

/** Who makes a model whose vendor's name carries no maker. */
const OWN_MAKER: Partial<Record<AiProviderVendor, string>> = { anthropic: 'anthropic', openai: 'openai', google: 'google' }

export function makerAndName(vendor: AiProviderVendor, model: string): string {
  const own = OWN_MAKER[vendor]
  if (own) return `${own}/${model}`
  if (model.includes('/')) return model.replace(/^~/, '')
  return `${vendor}/${model}`
}

export function sameModelKey(vendor: AiProviderVendor, model: string): string {
  return makerAndName(vendor, model).toLowerCase().replace(/\./g, '-')
}

export function isClaudeModel(vendor: AiProviderVendor, model: string): boolean {
  return makerAndName(vendor, model).toLowerCase().startsWith('anthropic/claude')
}

export type ReachedModel = { model: string; label: string; costRank: number | null }

let catalogue: Map<string, ReachedModel[]> | null = null

function vendorCatalogue(): Map<string, ReachedModel[]> {
  if (catalogue) return catalogue
  catalogue = new Map()
  catalogue.set('anthropic', CLAUDE_SDK_MODELS.map(m => ({ model: m.value, label: m.label, costRank: m.costRank })))
  for (const m of OPENCODE_MODELS) {
    if (m.provider === 'anthropic') continue
    const list = catalogue.get(m.provider) ?? []
    list.push({ model: m.value.slice(m.provider.length + 1), label: m.label, costRank: m.costRank })
    catalogue.set(m.provider, list)
  }
  return catalogue
}

/**
 * The models a provider reaches. An OpenAI-compatible endpoint's are typed rather than catalogued, so it reaches the
 * models a choice names on it (`typed`). Agenthix Cloud's come from its own catalogue, which hq reads once its calls to
 * Cloud are built; until then it reaches none. A voice provider reaches no model.
 */
export function modelsReachedBy(vendor: AiProviderVendor, typed: readonly string[] = []): readonly ReachedModel[] {
  if (vendor === 'openai_compatible') return typed.map(model => ({ model, label: model, costRank: null }))
  return vendorCatalogue().get(vendor) ?? []
}

export function reaches(vendor: AiProviderVendor, model: string): boolean {
  if (!model) return false
  if (vendor === 'openai_compatible') return true
  return modelsReachedBy(vendor).some(m => m.model === model)
}

export function modelLabel(vendor: AiProviderVendor, model: string): string {
  return modelsReachedBy(vendor).find(m => m.model === model)?.label ?? model
}

/**
 * A Claude model on an Anthropic key, a person's own Claude subscription or Agenthix Cloud runs on Claude Code
 * (Cloud's gateway speaks Anthropic's API); anything else on OpenCode.
 */
export function runtimeFor(vendor: AiProviderVendor, credentialKind: AiProviderCredentialKind, model: string): AgentRuntimeName {
  if (vendor === 'anthropic' || credentialKind === 'subscription') return CLAUDE_SDK_RUNTIME
  if (vendor === 'cloud' && isClaudeModel(vendor, model)) return CLAUDE_SDK_RUNTIME
  return OPENCODE_RUNTIME
}

/** The model as the runtime takes it: Claude Code a bare Claude id, OpenCode `<vendor>/<model>`. */
export function runtimeModelId(runtime: AgentRuntimeName, vendor: AiProviderVendor, model: string): string {
  if (runtime === CLAUDE_SDK_RUNTIME) return model.replace(/^anthropic\//, '')
  return `${vendor}/${model}`
}
