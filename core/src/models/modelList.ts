import { newestOfFamily } from './newestOfFamily.js'
import { OPENCODE_MODELS, CLAUDE_SDK_MODELS, COST_BAND_MAX_RANKS, IMAGE_INPUT_MODELS, MODEL_PRICE_TABLE } from './openCodeModels.generated.js'

export const CLAUDE_SDK_RUNTIME = 'claude-sdk'
export const OPENCODE_RUNTIME = 'opencode'
export const AGENT_RUNTIMES = [CLAUDE_SDK_RUNTIME, OPENCODE_RUNTIME] as const
export type AgentRuntimeName = (typeof AGENT_RUNTIMES)[number]

export type ModelPreset = {
  label: string
  value: string
  /** Relative price, higher = more expensive. Models with the same price share a rank. */
  costRank: number
  /** The catalogue's release date, YYYY-MM-DD; absent where it has none. */
  releasedAt?: string
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

/**
 * The model a run that names none uses: the newest Claude Sonnet of the pinned catalogue (ADR-0184), resolved once at
 * load. OpenCode names it with its provider first.
 */
function newestSonnet(models: readonly ModelPreset[], prefix: string): string {
  const chosen = newestOfFamily('anthropic', 'claude-sonnet', models.map(m => ({ model: m.value.slice(prefix.length), label: m.label, costRank: m.costRank, releasedAt: m.releasedAt })))
  // A catalogue with no Sonnet falls back to the helper's price-rule pick, so loading core never throws for it (ADR-0184).
  if (!chosen.model) throw new Error('The pinned model catalogue lists no model to default to')
  return chosen.model
}

export const DEFAULT_MODELS: Record<AgentRuntimeName, string> = {
  [CLAUDE_SDK_RUNTIME]: newestSonnet(CLAUDE_SDK_MODELS, ''),
  [OPENCODE_RUNTIME]: `anthropic/${newestSonnet(OPENCODE_MODELS.filter(m => m.provider === 'anthropic'), 'anthropic/')}`,
}

/**
 * A model on an OpenAI-compatible endpoint is typed, not picked: the endpoint's
 * own model name after this prefix. It has no catalogue price; it runs on the
 * person's own hardware or server, so it ranks with the free models.
 */
export const OPENAI_COMPATIBLE_PREFIX = 'openai_compatible/'

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

/**
 * Whether a model takes images, by the model as its vendor names it (`claude-sonnet-5` at `anthropic`,
 * `~deepseek/deepseek-flash-latest` at `openrouter`): true or false for a model the pinned catalogue lists, from its
 * input modalities; null for any other, such as an OpenAI-compatible endpoint's or Agenthix Cloud's, which nobody
 * knows until the provider answers.
 */
export function modelTakesImages(vendor: string, model: string): boolean | null {
  const key = `${vendor}/${model}`
  if (IMAGE_INPUT_MODELS.has(key)) return true
  return key in MODEL_PRICE_TABLE ? false : null
}
