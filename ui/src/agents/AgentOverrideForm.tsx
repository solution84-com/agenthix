import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { NarrowingData } from './projectAgentTypes'

export type AgentOverrideValue = NarrowingData

/** A model the form offers. A non-null `disabledReason` greys it out and says why, so a choice the server would refuse is never offered as if it were open. */
export type AgentOverrideModelOption = { value: string; label: string; disabledReason?: string | null; group?: string }

export interface AgentOverrideFormProps {
  title: string
  description: string
  value: AgentOverrideValue
  onSave: (next: AgentOverrideValue) => Promise<unknown>
}

export function AgentOverrideForm({ title, description, value, onSave }: AgentOverrideFormProps) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      // What the permissions view holds is saved as it is.
      await onSave(value)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }


  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-h3 font-semibold text-text-primary">{title}</h3>
        <p className="text-small text-text-muted mt-1">{description}</p>
      </div>
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
