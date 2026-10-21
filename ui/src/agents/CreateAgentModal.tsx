import { useState } from 'react'
import { SiteSelector, type SiteOption } from '../primitives'
import { sanitizeHandle } from './sanitizeHandle'
import { AGENT_RUNTIMES, modelForRuntimeChange, runtimeLabel } from '@agenthix/core'
import { ModelSelect } from './ModelSelect'
import { DEFAULT_AGENT_MODEL, DEFAULT_AGENT_RUNTIME, type CreateAgentActions } from './types'

export interface CreateAgentModalProps {
  open: boolean
  onClose: () => void
  /** When provided, shows a SiteSelector. Omit or pass empty array if site is already known. */
  sites?: SiteOption[]
  /** Pre-selected site id — hides the SiteSelector row. */
  defaultSiteId?: string
  actions: CreateAgentActions
  onCreated?: (agentId: string) => void
}

export function CreateAgentModal({
  open, onClose, sites, defaultSiteId, actions, onCreated,
}: CreateAgentModalProps) {
  const [siteId, setSiteId] = useState(defaultSiteId ?? sites?.[0]?.siteId ?? '')
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [handleTouched, setHandleTouched] = useState(false)
  const [role, setRole] = useState('')
  const [runtime, setRuntime] = useState<string>(DEFAULT_AGENT_RUNTIME)
  const [defaultModel, setDefaultModel] = useState(DEFAULT_AGENT_MODEL)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const showSiteSelector = !defaultSiteId && (sites?.length ?? 0) > 0

  const reset = () => {
    setSiteId(defaultSiteId ?? sites?.[0]?.siteId ?? '')
    setName('')
    setHandle('')
    setHandleTouched(false)
    setRole('')
    setRuntime(DEFAULT_AGENT_RUNTIME)
    setDefaultModel(DEFAULT_AGENT_MODEL)
    setError(null)
  }

  const handleClose = () => { reset(); onClose() }

  const handleNameChange = (v: string) => {
    setName(v)
    if (!handleTouched) setHandle(sanitizeHandle(v.replace(/\s+/g, '_')))
  }

  // The model list follows the runtime, so a model of the other one is replaced by this one's default.
  const changeRuntime = (next: string) => {
    setRuntime(next)
    setDefaultModel(modelForRuntimeChange(next, defaultModel))
  }

  const selectClass = 'w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-small text-text-primary outline-none focus:border-accent/50 [color-scheme:dark]'

  const canSave = name.trim().length > 0 && handle.trim().length > 0 && siteId !== ''

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const result = await actions.createAgent({
        siteId,
        name: name.trim(),
        handle: handle.trim(),
        role: role.trim() || undefined,
        runtime,
        defaultModel,
      })
      handleClose()
      onCreated?.(result.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-scrim backdrop-blur-sm flex items-center justify-center">
      <div className="w-[480px] bg-surface-1 border border-border rounded-2xl flex flex-col shadow-2xl overflow-hidden">

        <div className="px-6 py-5 border-b border-border-subtle">
          <div className="text-h3 font-semibold text-text-primary">New Agent</div>
          <div className="text-small text-text-muted mt-0.5">Define a name, handle, and model</div>
        </div>

        <div className="p-6 space-y-4">

          {showSiteSelector && (
            <SiteSelector
              sites={sites!}
              value={siteId}
              onChange={setSiteId}
              required={sites!.length > 1}
              helperText={sites!.length > 1 ? 'Agent will be created on the selected site' : undefined}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-micro font-medium text-text-muted uppercase tracking-wide">Name</label>
              <input
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                autoFocus
                placeholder="My Assistant"
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-small text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-micro font-medium text-text-muted uppercase tracking-wide flex items-center gap-1.5">
                Handle
                <span className="text-micro bg-accent/10 px-1.5 py-0.5 rounded text-accent font-medium tracking-tight normal-case">@mentions</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted font-medium text-small select-none">@</span>
                <input
                  value={handle}
                  onChange={e => { setHandle(sanitizeHandle(e.target.value)); setHandleTouched(true) }}
                  placeholder="researcher"
                  className="w-full bg-surface-2 border border-border rounded-lg pl-7 pr-3 py-2 text-small text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 font-mono"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-micro font-medium text-text-muted uppercase tracking-wide">Role <span className="normal-case font-normal">(optional)</span></label>
            <input
              value={role}
              onChange={e => setRole(e.target.value)}
              placeholder="e.g. Software Engineer"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-small text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-micro font-medium text-text-muted uppercase tracking-wide">Runtime</label>
            <select value={runtime} onChange={e => changeRuntime(e.target.value)} className={selectClass}>
              {AGENT_RUNTIMES.map(r => <option key={r} value={r}>{runtimeLabel(r)}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-micro font-medium text-text-muted uppercase tracking-wide">Default Model</label>
            <ModelSelect runtime={runtime} value={defaultModel} onChange={setDefaultModel} className={selectClass} />
          </div>

          {error && <p className="text-small text-danger">{error}</p>}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-border-subtle">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-small text-text-muted hover:text-text-secondary border border-border rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="px-4 py-2 text-small font-semibold bg-accent hover:bg-accent-hover text-on-accent rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Creating…' : 'Create Agent'}
          </button>
        </div>
      </div>
    </div>
  )
}
