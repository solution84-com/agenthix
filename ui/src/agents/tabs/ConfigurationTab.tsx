import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { AGENT_RUNTIMES, OPENCODE_RUNTIME, isAgentRuntime, modelForRuntimeChange, runtimeLabel } from '@agenthix/core'
import type { AgentDetail } from '../types'
import { ModelSelect } from '../ModelSelect'

export interface ConfigurationTabActions {
  updateAgent: (input: {
    id: string
    name?: string
    defaultModel?: string
    runtime?: string
  }) => Promise<unknown>
}

export interface ConfigurationTabProps {
  agent: AgentDetail
  actions: ConfigurationTabActions
}

export function ConfigurationTab({ agent, actions }: ConfigurationTabProps) {
  const [name, setName] = useState(agent.name)
  const [defaultModel, setDefaultModel] = useState(agent.defaultModel)
  const [runtime, setRuntime] = useState(agent.runtime)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setName(agent.name)
    setDefaultModel(agent.defaultModel)
    setRuntime(agent.runtime)
  }, [agent])

  const changeRuntime = (next: string) => {
    setRuntime(next)
    setDefaultModel(modelForRuntimeChange(next, defaultModel))
  }

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await actions.updateAgent({ id: agent.id, name, defaultModel, runtime })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [agent.id, name, defaultModel, runtime, actions])

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

      {/* Runtime */}
      <div>
        <label className="block text-micro font-medium uppercase tracking-wide text-text-muted mb-1.5">Runtime</label>
        <select value={runtime} onChange={(e) => changeRuntime(e.target.value)} className={inputClass}>
          {AGENT_RUNTIMES.map(r => <option key={r} value={r}>{runtimeLabel(r)}</option>)}
          {!isAgentRuntime(runtime) && <option value={runtime}>{runtimeLabel(runtime)}</option>}
        </select>
        {runtime === OPENCODE_RUNTIME && (
          <p className="text-small text-text-muted mt-1.5">
            Runs models from OpenRouter, OpenAI, Google and Anthropic, or from an OpenAI-compatible endpoint. Each needs its key under Organisation › Settings › Model access.
          </p>
        )}
      </div>

      {/* Default Model */}
      <div>
        <label className="block text-micro font-medium uppercase tracking-wide text-text-muted mb-1.5">Default Model</label>
        <ModelSelect runtime={runtime} value={defaultModel} onChange={setDefaultModel} className={inputClass} />
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
