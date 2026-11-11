import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import type { AgentDetail } from '../types'
import { FIELD } from '../../primitives/controlStyles'
import { BUTTON_PRIMARY } from '../../primitives/buttonStyles'
import { useAttentionWhen } from '../../attention/useAttentionWhen'

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
  const [nameError, setNameError] = useState<string | undefined>()
  const errorDialog = useAttentionWhen(error, { kind: 'alert' })

  // Only a different agent resets the field: a refetch of the same agent must not discard what is typed.
  useEffect(() => {
    setName(agent.name)
  }, [agent.id])

  const handleSave = useCallback(async () => {
    if (!name.trim()) { setNameError('An agent needs a name. Nothing was changed.'); return }
    setSaving(true)
    setNameError(undefined)
    setError(null)
    try {
      await actions.updateAgent({ id: agent.id, name: name.trim() })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [agent.id, name, actions])

  const inputClass = `${FIELD} w-full rounded-xl px-3 py-2 text-body placeholder:text-text-muted/70`

  return (
    <div className="max-w-2xl space-y-6">

      <p className="text-small text-text-muted">
        A saved change takes effect at the agent&apos;s next run.
      </p>

      {/* Name */}
      <div>
        <label htmlFor="agent-name" className="block text-micro font-medium uppercase tracking-wide text-text-muted mb-1.5">Name</label>
        <input id="agent-name" type="text" value={name} onChange={(e) => { setName(e.target.value); setNameError(undefined) }} className={inputClass} aria-invalid={nameError ? true : undefined} />
        {nameError && <p role="alert" className="mt-1 text-small text-danger">{nameError}</p>}
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
          className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-body font-medium cursor-pointer ${BUTTON_PRIMARY}`}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {errorDialog}
      </div>

    </div>
  )
}
