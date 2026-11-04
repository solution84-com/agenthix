import type { ReactNode } from 'react'
import {
  OPENCODE_RUNTIME, MODEL_PROVIDER_LABELS, OPENAI_COMPATIBLE_PREFIX,
  modelsForRuntime, isTypedModel, typedModelValue, type OpenCodeModel,
} from '@agenthix/core'
import { filterModels, groupByProvider, modelOptionLabel } from './modelGroups'

/**
 * The `<option>`s of a model picker for a runtime: Anthropic's models flat for
 * the Claude runtime, the catalogue grouped by provider for OpenCode, each with
 * its price band. `filter` narrows them. The current value is always offered, so
 * a model the list no longer holds, or the filter hides, shows as itself rather
 * than as a different choice.
 */
export function ModelOptions({ runtime, value, filter = '' }: { runtime: string; value: string; filter?: string }): ReactNode {
  const all = modelsForRuntime(runtime)
  const models = filterModels(all, filter)
  const offered = models.some(m => m.value === value) || isTypedModel(value)
  const known = all.find(m => m.value === value)
  const current = !offered && value ? <option value={value}>{known ? modelOptionLabel(known) : value}</option> : null
  if (runtime !== OPENCODE_RUNTIME) {
    return (
      <>
        {current}
        {models.map(m => <option key={m.value} value={m.value}>{modelOptionLabel(m)}</option>)}
      </>
    )
  }
  return (
    <>
      {current}
      {groupByProvider(models.filter((m): m is OpenCodeModel => 'provider' in m)).map(([provider, group]) => (
        <optgroup key={provider} label={MODEL_PROVIDER_LABELS[provider as keyof typeof MODEL_PROVIDER_LABELS]}>
          {group.map(m => <option key={m.value} value={m.value}>{modelOptionLabel(m)}</option>)}
        </optgroup>
      ))}
      {isTypedModel(value) && <option value={value}>{value.slice(OPENAI_COMPATIBLE_PREFIX.length)}</option>}
    </>
  )
}
