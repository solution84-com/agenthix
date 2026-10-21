import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { AGENT_MODELS } from './types'
import type { NarrowingData } from './projectAgentTypes'

export type AgentOverrideValue = NarrowingData

/** A model the form offers. A non-null `disabledReason` greys it out and says why, so a choice the server would refuse is never offered as if it were open. */
export type AgentOverrideModelOption = { value: string; label: string; disabledReason?: string | null; group?: string }

export interface AgentOverrideFormProps {
  title: string
  description: string
  value: AgentOverrideValue
  onSave: (next: AgentOverrideValue) => Promise<unknown>
  /** The models to offer. Defaults to every model, with none disabled. */
  modelOptions?: readonly AgentOverrideModelOption[]
}

export function AgentOverrideForm({ title, description, value, onSave, modelOptions = AGENT_MODELS }: AgentOverrideFormProps) {
  const [model, setModel] = useState(value.model ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setModel(value.model ?? '')
  }, [value])

  const save = async () => {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      // What the permissions view holds is saved as it is.
      await onSave({ ...value, model: model || null })
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full bg-surface-1 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none focus:border-accent'
  const label = 'block text-micro font-medium uppercase tracking-wide text-text-muted mb-1.5'

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-h3 font-semibold text-text-primary">{title}</h3>
        <p className="text-small text-text-muted mt-1">{description}</p>
      </div>
      <label className="block">
        <span className={label}>Model</span>
        <select value={model} onChange={e => setModel(e.target.value)} className={field}>
          <option value="">The agent's own model</option>
          {[...new Set(modelOptions.map(m => m.group ?? ''))].map(group => {
            const options = modelOptions.filter(m => (m.group ?? '') === group).map(m => (
              <option key={m.value} value={m.value} disabled={!!m.disabledReason} title={m.disabledReason ?? undefined}>
                {m.disabledReason ? `${m.label} — ${m.disabledReason}` : m.label}
              </option>
            ))
            return group ? <optgroup key={group} label={group}>{options}</optgroup> : options
          })}
        </select>
      </label>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-on-accent px-4 py-2 rounded-lg text-body font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-body text-success">Saved</span>}
        {error && <span className="text-body text-danger">{error}</span>}
      </div>
    </div>
  )
}
