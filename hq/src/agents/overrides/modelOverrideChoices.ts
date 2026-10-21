/**
 * Which models the override form lets a person pick for an agent. Client-safe
 * (no `wasp/server`): the rule is the same one modelOverrideRefusal enforces on
 * save, stated per option so the form can grey out a choice the server would
 * refuse instead of failing after the fact. The options are the agent's
 * runtime's own list.
 */
import { MODEL_PROVIDER_LABELS } from '@agenthix/core'
import { modelsForRuntime, isEqualOrCheaperModel, OPENCODE_RUNTIME, OPENCODE_MODELS } from '../models'

export type ModelOverrideChoice = { value: string; label: string; disabledReason: string | null; group?: string }

export function modelOverrideChoices(agent: { defaultModel: string; runtime: string }): ModelOverrideChoice[] {
  const providerOf = new Map<string, keyof typeof MODEL_PROVIDER_LABELS>(OPENCODE_MODELS.map(m => [m.value, m.provider]))
  return modelsForRuntime(agent.runtime).map(({ value, label }) => ({
    value,
    label,
    ...(agent.runtime === OPENCODE_RUNTIME && { group: MODEL_PROVIDER_LABELS[providerOf.get(value) ?? 'openrouter'] }),
    disabledReason: isEqualOrCheaperModel(agent.runtime, value, agent.defaultModel) ? null : 'costs more than this agent’s model',
  }))
}
