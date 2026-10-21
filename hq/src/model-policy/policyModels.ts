/**
 * A model policy's rules, with no database (model access and policy spec, *Model selection*): which models a
 * policy may name, which provider each needs, and whether one is within an allow-list and a ceiling. A policy
 * names models as the runtimes do — a bare id is Anthropic's, any other provider's is `<provider>/<model>` — so
 * each id is read on the runtime that writes it that way, and a ceiling compares cost ranks, the same "equal or
 * cheaper" ordering a model override uses (agentOverrideService.ts). Shared with the policy's forms.
 */
import {
  CLAUDE_SDK_RUNTIME, OPENCODE_RUNTIME, isKnownModel, modelCostRank, modelsForRuntime, providerOfModel,
  type CredentialProvider,
} from '@agenthix/core'
import type { EffectiveModelPolicy } from '../conversations/contract'

export type ModelPolicyScope = 'user' | 'project' | 'org'

/** One boundary's stored policy; a null field is the layer below's. */
/** A type, not an interface: Wasp's operation payloads need an object type it can index. */
export type ModelPolicyValues = {
  talking: string | null
  lightWork: string | null
  heavyWork: string | null
  allowed: string[] | null
  ceiling: string | null
}

export const POLICY_TIERS = ['talking', 'lightWork', 'heavyWork'] as const
export type PolicyTier = (typeof POLICY_TIERS)[number]
export const MAX_ALLOWED_MODELS = 100

export class ModelPolicyValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'ModelPolicyValidationError' }
}

const runtimeOf = (model: string) => (model.includes('/') ? OPENCODE_RUNTIME : CLAUDE_SDK_RUNTIME)

/** The provider whose key a model needs, or null for an id that names none. */
export function providerOfPolicyModel(model: string): CredentialProvider | null {
  return providerOfModel(runtimeOf(model), model)
}

export function isPolicyModel(model: string): boolean {
  return isKnownModel(runtimeOf(model), model) && providerOfPolicyModel(model) !== null
}

/** A model's cost rank, or null when no runtime knows it. */
export function policyModelRank(model: string): number | null {
  return modelCostRank(runtimeOf(model), model)
}

/** Within the allow-list, and no dearer than the ceiling. A ceiling admits nothing whose cost is unknown. */
export function isWithinPolicy(model: string, rules: { allowed: readonly string[] | null; ceiling: string | null }): boolean {
  if (rules.allowed && !rules.allowed.includes(model)) return false
  if (!rules.ceiling) return true
  const rank = policyModelRank(model)
  const ceiling = policyModelRank(rules.ceiling)
  return rank !== null && ceiling !== null && rank <= ceiling
}

function readModel(raw: unknown, what: string): string | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'string' || raw.trim() === '') throw new ModelPolicyValidationError(`The ${what} is not a model`)
  const model = raw.trim()
  if (!isPolicyModel(model)) throw new ModelPolicyValidationError(`'${model}' is not a model that can be chosen`)
  return model
}

export type PolicyBound = { allowed: readonly string[] | null; ceiling: string | null }

/** The bound several layers set together: every allow-list at once, and the cheapest ceiling. */
export function combinedBound(layers: readonly (PolicyBound | null)[]): { allowed: string[] | null; ceiling: string | null } {
  let allowed: string[] | null = null
  let ceiling: string | null = null
  for (const layer of layers) {
    const layerAllowed = layer?.allowed
    if (layerAllowed) allowed = allowed ? allowed.filter(m => layerAllowed.includes(m)) : [...layerAllowed]
    // A ceiling with no known price admits nothing (isWithinPolicy), so it counts as the strictest.
    if (layer?.ceiling && (ceiling === null || (policyModelRank(layer.ceiling) ?? -1) < (policyModelRank(ceiling) ?? -1))) {
      ceiling = layer.ceiling
    }
  }
  return { allowed, ceiling }
}

/**
 * A policy as sent, checked before it is stored: every model one that can be chosen, the three models within the
 * policy's own allow-list and ceiling. An empty allow-list is none: a policy that allows nothing could pick nothing.
 * A person's or a project's policy is also checked against the organisation's (`orgBound`), which it may only
 * narrow: no ceiling above the organisation's, no model outside its allow-list.
 */
export function validateModelPolicy(raw: unknown, orgBound: PolicyBound | null = null): ModelPolicyValues {
  const v = (raw ?? {}) as Record<string, unknown>
  let allowed: string[] | null = null
  if (v.allowed !== null && v.allowed !== undefined) {
    if (!Array.isArray(v.allowed)) throw new ModelPolicyValidationError('The allowed models must be a list')
    const models = [...new Set(v.allowed.map(m => readModel(m, 'allowed model')).filter((m): m is string => m !== null))]
    if (models.length > MAX_ALLOWED_MODELS) throw new ModelPolicyValidationError(`At most ${MAX_ALLOWED_MODELS} allowed models`)
    allowed = models.length > 0 ? models : null
  }
  const ceiling = readModel(v.ceiling, 'ceiling')
  if (ceiling && policyModelRank(ceiling) === null) throw new ModelPolicyValidationError(`'${ceiling}' has no known price to use as a ceiling`)
  const values: ModelPolicyValues = {
    talking: readModel(v.talking, 'talking model'),
    lightWork: readModel(v.lightWork, 'light-work model'),
    heavyWork: readModel(v.heavyWork, 'heavy-work model'),
    allowed,
    ceiling,
  }
  for (const tier of POLICY_TIERS) {
    const model = values[tier]
    if (model && !isWithinPolicy(model, values)) {
      throw new ModelPolicyValidationError(`'${model}' is not within this policy's allowed models and ceiling`)
    }
  }
  if (orgBound) refuseBeyond(values, orgBound)
  return values
}

function refuseBeyond(values: ModelPolicyValues, org: PolicyBound): void {
  if (values.ceiling && org.ceiling && !isWithinPolicy(values.ceiling, { allowed: null, ceiling: org.ceiling })) {
    throw new ModelPolicyValidationError(`The ceiling '${values.ceiling}' is above the organisation's ceiling '${org.ceiling}'`)
  }
  const orgAllowed = org.allowed
  const outside = orgAllowed ? values.allowed?.find(m => !orgAllowed.includes(m)) : undefined
  if (outside) throw new ModelPolicyValidationError(`'${outside}' is not among the organisation's allowed models`)
  for (const tier of POLICY_TIERS) {
    const model = values[tier]
    if (model && !isWithinPolicy(model, org)) {
      throw new ModelPolicyValidationError(`'${model}' is not within the organisation's allowed models and ceiling`)
    }
  }
}

export function isEmptyPolicy(values: ModelPolicyValues): boolean {
  return POLICY_TIERS.every(t => values[t] === null) && values.allowed === null && values.ceiling === null
}

/** A stored row, read back. A malformed stored allow-list reads as none rather than failing a conversation. */
export function policyFromRow(row: { talking: string | null; lightWork: string | null; heavyWork: string | null; allowed: unknown; ceiling: string | null }): ModelPolicyValues {
  const allowed = Array.isArray(row.allowed) && row.allowed.every(m => typeof m === 'string') && row.allowed.length > 0
    ? (row.allowed as string[])
    : null
  return { talking: row.talking, lightWork: row.lightWork, heavyWork: row.heavyWork, allowed, ceiling: row.ceiling }
}

/**
 * The effective policy from its layers, nearest first. The three models come from the nearest layer that names
 * one; the allow-list and the ceiling are every layer's together, so a nearer layer only narrows the
 * organisation's. `resolveModelPolicy` reads the layers.
 */
export function effectivePolicy(
  layers: readonly (ModelPolicyValues | null)[],
  agent: { defaultModel: string },
): EffectiveModelPolicy {
  const rules = combinedBound(layers)
  const pick = (tier: (typeof POLICY_TIERS)[number]): string => {
    const candidates = [...layers.map(l => l?.[tier] ?? null), agent.defaultModel, ...(rules.allowed ?? [])]
    return candidates.find((m): m is string => !!m && isWithinPolicy(m, rules)) ?? agent.defaultModel
  }
  return { talking: pick('talking'), lightWork: pick('lightWork'), heavyWork: pick('heavyWork'), ...rules }
}

/** How a person reads a model: its catalogue label, or the id where the catalogue has none. */
export function policyModelLabel(model: string): string {
  return modelsForRuntime(runtimeOf(model)).find(m => m.value === model)?.label ?? model
}
