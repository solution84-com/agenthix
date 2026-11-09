/**
 * What a model is, whoever serves it (models from one place, part 4). A choice is a model via a provider, its model
 * named as that provider's vendor names it: `claude-sonnet-5` at Anthropic, `deepseek/deepseek-v3.2` at OpenRouter,
 * `gpt-5` at OpenAI (core's price list reads them the same way). From that:
 *
 * - `makerAndName`: the maker and the model's name (`anthropic/claude-sonnet-5`), what lists match;
 * - `sameModelKey`: the same model on any provider, with OpenRouter's dotted versions read as hyphenated ones;
 * - `modelsReachedBy`: the models a provider reaches, from hq's pinned catalogue for the organisation's own keys, or,
 *   for Inworld, the list read with its key (`inworldModelStore.ts`);
 * - `runtimeFor` and `runtimeModelId`: the runtime a piece of work runs on, and the model as that runtime names it.
 */
import {
  CLAUDE_SDK_MODELS, CLAUDE_SDK_RUNTIME, OPENCODE_MODELS, OPENCODE_RUNTIME, inworldCostRank, inworldLabel,
  makerAndName as coreMakerAndName, sameModelKey as coreSameModelKey,
  type AgentRuntimeName, type AiProviderCredentialKind, type AiProviderVendor, type InworldModel,
} from '@agenthix/core'
import { allInworldModels, inworldModelById } from './inworldModelStore'

/** core's rule, given the list's maker for a model Inworld hosts itself (`inworld/models/<name>`), which its id does not name. */
const creatorOf = (vendor: AiProviderVendor, model: string) => (vendor === 'inworld' ? inworldModelById(model)?.creator ?? null : null)
export const makerAndName = (vendor: AiProviderVendor, model: string): string => coreMakerAndName(vendor, model, creatorOf(vendor, model))
export const sameModelKey = (vendor: AiProviderVendor, model: string): string => coreSameModelKey(vendor, model, creatorOf(vendor, model))

export function isClaudeModel(vendor: AiProviderVendor, model: string): boolean {
  return makerAndName(vendor, model).toLowerCase().startsWith('anthropic/claude')
}

export type ReachedModel = { model: string; label: string; costRank: number | null; releasedAt?: string }

let catalogue: Map<string, ReachedModel[]> | null = null

function vendorCatalogue(): Map<string, ReachedModel[]> {
  if (catalogue) return catalogue
  catalogue = new Map()
  catalogue.set('anthropic', CLAUDE_SDK_MODELS.map(m => ({ model: m.value, label: m.label, costRank: m.costRank, ...(m.releasedAt && { releasedAt: m.releasedAt }) })))
  for (const m of OPENCODE_MODELS) {
    if (m.provider === 'anthropic') continue
    const list = catalogue.get(m.provider) ?? []
    list.push({ model: m.value.slice(m.provider.length + 1), label: m.label, costRank: m.costRank, ...(m.releasedAt && { releasedAt: m.releasedAt }) })
    catalogue.set(m.provider, list)
  }
  return catalogue
}

let inworldReached: { from: readonly InworldModel[]; models: ReachedModel[] } | null = null

/** The list held, as reached models: the label from the id and the cost rank from the price, since the list gives neither. */
function reachedViaInworld(): readonly ReachedModel[] {
  const from = allInworldModels()
  if (inworldReached?.from !== from) {
    inworldReached = { from, models: from.map(m => ({ model: m.id, label: inworldLabel(m.id), costRank: inworldCostRank(m) })) }
  }
  return inworldReached.models
}

/**
 * The models a provider reaches. An OpenAI-compatible endpoint's are typed rather than catalogued, so it reaches the
 * models a choice names on it (`typed`). Inworld's are the list read with its key: none until one is read, and none
 * while its flag is off (a refresh then empties the lists). Agenthix Cloud's come from its own catalogue, which hq reads once its calls to
 * Cloud are built; until then it reaches none. A voice provider reaches no model.
 */
export function modelsReachedBy(vendor: AiProviderVendor, typed: readonly string[] = []): readonly ReachedModel[] {
  if (vendor === 'openai_compatible') return typed.map(model => ({ model, label: model, costRank: null }))
  if (vendor === 'inworld') return reachedViaInworld()
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
