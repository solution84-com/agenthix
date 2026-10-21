import { useEffect, useState, type ReactNode } from 'react'
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

const TYPED = '__typed__'

/**
 * A model picker for a runtime. On OpenCode it also takes a model typed by
 * name, for an OpenAI-compatible endpoint, which has no catalogue.
 */
export function ModelSelect({ runtime, value, onChange, className }: {
  runtime: string
  value: string
  onChange: (model: string) => void
  className?: string
}) {
  const canType = runtime === OPENCODE_RUNTIME
  const [typing, setTyping] = useState(isTypedModel(value))
  const [filter, setFilter] = useState('')
  const [typedName, setTypedName] = useState(isTypedModel(value) ? value.slice(OPENAI_COMPATIBLE_PREFIX.length) : '')

  useEffect(() => {
    setTyping(isTypedModel(value))
    if (isTypedModel(value)) setTypedName(value.slice(OPENAI_COMPATIBLE_PREFIX.length))
  }, [value])

  return (
    <div className="space-y-2">
      {canType && (
        <input
          type="search"
          value={filter}
          placeholder="Filter models, e.g. sonnet, free, openai"
          onChange={e => setFilter(e.target.value)}
          className={className}
        />
      )}
      <select
        value={canType && typing ? TYPED : value}
        onChange={e => {
          if (e.target.value === TYPED) { setTyping(true); return }
          setTyping(false)
          onChange(e.target.value)
        }}
        className={className}
      >
        <ModelOptions runtime={runtime} value={typing ? '' : value} filter={filter} />
        {canType && <option value={TYPED}>{MODEL_PROVIDER_LABELS.openai_compatible} — type a model name</option>}
      </select>
      {canType && typing && (
        <input
          type="text"
          value={typedName}
          placeholder="Model name on your endpoint, e.g. llama3.1:8b"
          onChange={e => {
            setTypedName(e.target.value)
            if (e.target.value.trim()) onChange(typedModelValue(e.target.value))
          }}
          className={className}
        />
      )}
    </div>
  )
}
