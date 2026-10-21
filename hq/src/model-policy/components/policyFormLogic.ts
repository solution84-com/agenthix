/**
 * What the models form shows and sends, with no screen: the draft a stored policy becomes, what "the
 * organisation's" reads as under each model row, which models can be picked, and the arguments a save sends.
 */
import { CLAUDE_SDK_RUNTIME, OPENCODE_RUNTIME, modelsForRuntime } from '@agenthix/core'
import { isPolicyModel, policyModelLabel, type ModelPolicyScope, type ModelPolicyValues, type PolicyTier } from '../policyModels'

export type PolicyDraft = {
  talking: string
  lightWork: string
  heavyWork: string
  /** All models may be picked, or only those in `allowed`. */
  restrict: boolean
  allowed: string[]
  ceiling: string
}

export const TIER_LABELS: Record<PolicyTier, string> = {
  talking: 'Model for talking',
  lightWork: 'Model for light work',
  heavyWork: 'Model for heavy work',
}

export const emptyDraft: PolicyDraft = { talking: '', lightWork: '', heavyWork: '', restrict: false, allowed: [], ceiling: '' }

export function draftFromPolicy(policy: ModelPolicyValues | null): PolicyDraft {
  if (!policy) return emptyDraft
  return {
    talking: policy.talking ?? '',
    lightWork: policy.lightWork ?? '',
    heavyWork: policy.heavyWork ?? '',
    restrict: policy.allowed !== null,
    allowed: policy.allowed ?? [],
    ceiling: policy.ceiling ?? '',
  }
}

/** The models a person can choose from: every model the catalogue knows that a policy may name. */
export function choosableModels(): { value: string; label: string }[] {
  const all = [...modelsForRuntime(CLAUDE_SDK_RUNTIME), ...modelsForRuntime(OPENCODE_RUNTIME)]
  const seen = new Set<string>()
  return all
    .filter(m => isPolicyModel(m.value) && !seen.has(m.value) && !!seen.add(m.value))
    .map(m => ({ value: m.value, label: m.label }))
}

/** The empty choice of a model row: the organisation's, showing which, or for the organisation's own, each agent's own. */
export function inheritedLabel(scope: ModelPolicyScope, organisation: ModelPolicyValues | null, tier: PolicyTier): string {
  if (scope === 'org') return "Each agent's own"
  const model = organisation?.[tier]
  return `The organisation's (${model ? policyModelLabel(model) : "each agent's own"})`
}

/** An allow-list that holds nothing is no list; the server reads an empty one as none too. */
export function policyFromDraft(draft: PolicyDraft): ModelPolicyValues {
  const allowed = draft.restrict && draft.allowed.length > 0 ? draft.allowed : null
  return {
    talking: draft.talking || null,
    lightWork: draft.lightWork || null,
    heavyWork: draft.heavyWork || null,
    allowed,
    ceiling: draft.ceiling || null,
  }
}

export type SetPolicyArgs = ModelPolicyValues & { scope: ModelPolicyScope; projectId?: string }

/** What a save sends: every field, a null one clearing it. */
export function saveArgs(scope: ModelPolicyScope, projectId: string | undefined, draft: PolicyDraft): SetPolicyArgs {
  return { scope, ...(scope === 'project' ? { projectId } : {}), ...policyFromDraft(draft) }
}

/** A draft with nothing chosen from a list that restricts: the form says so before sending. */
export function draftProblem(draft: PolicyDraft): string | null {
  if (draft.restrict && draft.allowed.length === 0) return 'Choose at least one model, or allow all of them.'
  return null
}
