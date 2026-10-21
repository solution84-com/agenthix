import { CREDENTIAL_PROVIDERS, type CredentialProvider } from '../protocol/credential.js'
import { OPENCODE_MODELS, CLAUDE_SDK_MODELS, COST_BAND_MAX_RANKS } from './openCodeModels.generated.js'

export const CLAUDE_SDK_RUNTIME = 'claude-sdk'
export const OPENCODE_RUNTIME = 'opencode'
export const AGENT_RUNTIMES = [CLAUDE_SDK_RUNTIME, OPENCODE_RUNTIME] as const
export type AgentRuntimeName = (typeof AGENT_RUNTIMES)[number]

export type ModelPreset = {
  label: string
  value: string
  /** Relative price, higher = more expensive. Models with the same price share a rank. */
  costRank: number
}

/** A model of OpenCode's catalogue: its value names the provider first (`openrouter/…`, `openai/…`). */
export type OpenCodeModel = ModelPreset & { provider: CatalogueProvider }

/** The providers whose models come from the catalogue; an OpenAI-compatible endpoint has none. */
export type CatalogueProvider = 'openrouter' | 'openai' | 'google' | 'anthropic'

/** How the model pickers name a provider. */
export const MODEL_PROVIDER_LABELS: Record<CatalogueProvider | 'openai_compatible', string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  google: 'Google',
  anthropic: 'Anthropic',
  openai_compatible: 'OpenAI-compatible endpoint',
}

export { OPENCODE_MODELS, OPENCODE_CATALOGUE_VERSION, COST_BAND_MAX_RANKS } from './openCodeModels.generated.js'

/**
 * Models for the claude-sdk runtime: Anthropic's models from the same pinned
 * catalogue as OpenCode's list, as bare ids (what the Claude CLI takes), with
 * the catalogue's cost ranks. Generated; see scripts/generate-model-list.mjs.
 */
export { CLAUDE_SDK_MODELS } from './openCodeModels.generated.js'

/** How the pickers and pages name a runtime; the ids are internal. */
export const RUNTIME_LABELS: Record<AgentRuntimeName, string> = {
  [CLAUDE_SDK_RUNTIME]: 'Claude',
  [OPENCODE_RUNTIME]: 'OpenCode',
}

/** A runtime's name for a person; an id this build does not know is shown as it is. */
export function runtimeLabel(runtime: string): string {
  return isAgentRuntime(runtime) ? RUNTIME_LABELS[runtime] : runtime
}

export type CostBand = 'free' | 'low' | 'mid' | 'high'

/** The symbols a picker shows for a band. */
export const COST_BAND_MARKERS: Record<CostBand, string> = { free: 'free', low: '$', mid: '$$', high: '$$$' }

/**
 * A rank says only "dearer than", so the bands are cut by price and stored as
 * ranks by the generator: low up to $8 per million tokens (input plus output),
 * mid up to $25, high above. That puts Anthropic's tiers in three bands (Haiku
 * low, Sonnet mid, Opus and above high) and keeps a band meaning the same
 * price whatever the catalogue holds.
 */
export function costBand(costRank: number): CostBand {
  if (costRank <= 0) return 'free'
  if (costRank <= COST_BAND_MAX_RANKS.low) return 'low'
  return costRank <= COST_BAND_MAX_RANKS.mid ? 'mid' : 'high'
}

export const DEFAULT_MODELS: Record<AgentRuntimeName, string> = {
  [CLAUDE_SDK_RUNTIME]: 'claude-sonnet-5',
  [OPENCODE_RUNTIME]: 'anthropic/claude-sonnet-5',
}

/**
 * A model on an OpenAI-compatible endpoint is typed, not picked: the endpoint's
 * own model name after this prefix. It has no catalogue price; it runs on the
 * person's own hardware or server, so it ranks with the free models.
 */
export const OPENAI_COMPATIBLE_PREFIX = 'openai_compatible/'
const TYPED_MODEL_RANK = 0

export function isAgentRuntime(runtime: string): runtime is AgentRuntimeName {
  return (AGENT_RUNTIMES as readonly string[]).includes(runtime)
}

export function typedModelValue(name: string): string {
  return `${OPENAI_COMPATIBLE_PREFIX}${name.trim()}`
}

export function isTypedModel(value: string): boolean {
  const name = value.slice(OPENAI_COMPATIBLE_PREFIX.length)
  return value.startsWith(OPENAI_COMPATIBLE_PREFIX) && name.length > 0 && name === name.trim() && !/\s/.test(name)
}

/** The default model of a runtime; an unknown runtime gets the Claude one. Fallbacks read this, not a literal. */
export function defaultModelFor(runtime: string | null | undefined): string {
  return runtime && isAgentRuntime(runtime) ? DEFAULT_MODELS[runtime] : DEFAULT_MODELS[CLAUDE_SDK_RUNTIME]
}

/** The model an agent keeps when its runtime changes: the same one if the new runtime offers it, else that runtime's default. */
export function modelForRuntimeChange(runtime: string, current: string): string {
  if (!isAgentRuntime(runtime) || isKnownModel(runtime, current)) return current
  return DEFAULT_MODELS[runtime]
}

/** The models a picker offers for a runtime. */
export function modelsForRuntime(runtime: string): readonly ModelPreset[] {
  if (runtime === CLAUDE_SDK_RUNTIME) return CLAUDE_SDK_MODELS
  if (runtime === OPENCODE_RUNTIME) return OPENCODE_MODELS
  return []
}

/** True for a model the runtime can be given: one of its list, or on OpenCode a typed model. */
export function isKnownModel(runtime: string, value: string): boolean {
  if (runtime === OPENCODE_RUNTIME && isTypedModel(value)) return true
  return modelsForRuntime(runtime).some(m => m.value === value)
}

/** The model's cost rank, or null when the runtime does not know the model. */
export function modelCostRank(runtime: string, value: string): number | null {
  if (runtime === OPENCODE_RUNTIME && isTypedModel(value)) return TYPED_MODEL_RANK
  return modelsForRuntime(runtime).find(m => m.value === value)?.costRank ?? null
}

/** True when `candidate` is a known model that costs no more than `current`. An unranked `current` admits nothing. */
export function isEqualOrCheaperModel(runtime: string, candidate: string, current: string): boolean {
  const candidateRank = modelCostRank(runtime, candidate)
  const currentRank = modelCostRank(runtime, current)
  return candidateRank !== null && currentRank !== null && candidateRank <= currentRank
}

/**
 * The provider whose credential a turn on this model needs: Anthropic for the
 * Claude runtime, the prefix of the model's value on OpenCode. Null when the
 * value names no provider Agenthix offers.
 */
export function providerOfModel(runtime: string, value: string): CredentialProvider | null {
  if (runtime === CLAUDE_SDK_RUNTIME) return 'anthropic'
  if (runtime !== OPENCODE_RUNTIME) return null
  const provider = value.slice(0, Math.max(value.indexOf('/'), 0))
  return CREDENTIAL_PROVIDERS.find(p => p === provider) ?? null
}
