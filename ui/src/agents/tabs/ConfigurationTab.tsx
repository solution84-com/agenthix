import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import type { AgentDetail } from '../types'

export interface ConfigurationTabActions {
  updateAgent: (input: {
    id: string
    name?: string
  }) => Promise<unknown>
}

export interface ConfigurationTabProps {
  agent: AgentDetail
  actions: ConfigurationTabActions
}

export function ConfigurationTab({ agent, actions }: ConfigurationTabProps) {
  const [name, setName] = useState(agent.name)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Only a different agent resets the field: a refetch of the same agent must not discard what is typed.
  useEffect(() => {
    setName(agent.name)
  }, [agent.id])

  const handleSave = useCallback(async () => {
    if (!name.trim()) { setError('An agent needs a name. Nothing was changed.'); return }
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await actions.updateAgent({ id: agent.id, name: name.trim() })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [agent.id, name, actions])

  const inputClass = 'w-full bg-surface-1 border border-border-subtle rounded-xl px-3 py-2 text-body text-text-primary focus:outline-none focus:border-accent placeholder:text-text-muted/70'

  return (
    <div className="max-w-2xl space-y-6">

      <p className="text-small text-text-muted">
        A saved change takes effect at the agent&apos;s next run.
      </p>

      {/* Name */}
      <div>
        <label className="block text-micro font-medium uppercase tracking-wide text-text-muted mb-1.5">Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </div>

      {/* Handle (read-only) */}
      <div>
        <label className="block text-micro font-medium uppercase tracking-wide text-text-muted mb-1.5">Handle</label>
        <div className="w-full bg-surface-1 border border-border-subtle rounded-xl px-3 py-2 text-body text-text-muted font-mono">
          @{agent.handle}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-on-accent px-6 py-2.5 rounded-lg text-body font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {saved && <span className="text-body text-success font-medium">Saved!</span>}
        {error && <span className="text-body text-danger">{error}</span>}
      </div>

    </div>
  )
}
