import { useId, useState } from 'react'
import { SiteSelector, type SiteOption } from '../primitives'
import { Modal } from '../primitives/Modal'
import { sanitizeHandle } from './sanitizeHandle'
import type { CreateAgentActions } from './types'

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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameId = useId()
  const handleId = useId()
  const roleId = useId()

  const showSiteSelector = !defaultSiteId && (sites?.length ?? 0) > 0

  const reset = () => {
    setSiteId(defaultSiteId ?? sites?.[0]?.siteId ?? '')
    setName('')
    setHandle('')
    setHandleTouched(false)
    setRole('')
    setError(null)
  }

  const handleClose = () => { reset(); onClose() }

  const handleNameChange = (v: string) => {
    setName(v)
    if (!handleTouched) setHandle(sanitizeHandle(v.replace(/\s+/g, '_')))
  }

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
      })
      handleClose()
      onCreated?.(result.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="New Agent" maxWidth="max-w-[480px]">
      <div>
        <p className="text-small text-text-muted -mt-1 mb-4">Define a name and handle. Its models are set afterwards, under Models</p>

        <div className="space-y-4">

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
              <label htmlFor={nameId} className="text-micro font-medium text-text-muted uppercase tracking-wide">Name</label>
              <input
                id={nameId}
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                autoFocus
                placeholder="My Assistant"
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-small text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={handleId} className="text-micro font-medium text-text-muted uppercase tracking-wide flex items-center gap-1.5">
                Handle
                <span className="text-micro bg-accent/10 px-1.5 py-0.5 rounded text-accent font-medium tracking-tight normal-case">@mentions</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted font-medium text-small select-none">@</span>
                <input
                  id={handleId}
                  value={handle}
                  onChange={e => { setHandle(sanitizeHandle(e.target.value)); setHandleTouched(true) }}
                  placeholder="researcher"
                  className="w-full bg-surface-2 border border-border rounded-lg pl-7 pr-3 py-2 text-small text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 font-mono"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={roleId} className="text-micro font-medium text-text-muted uppercase tracking-wide">Role <span className="normal-case font-normal">(optional)</span></label>
            <input
              id={roleId}
              value={role}
              onChange={e => setRole(e.target.value)}
              placeholder="e.g. Software Engineer"
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-small text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50"
            />
          </div>

          {error && <p role="alert" className="text-small text-danger">{error}</p>}
        </div>

        <div className="flex items-center justify-between pt-5 mt-5 border-t border-border-subtle">
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
    </Modal>
  )
}
