import { useState, useEffect } from 'react'
import { deriveProjectKey } from '@agenthix/core'
import { ModalDialog, FormField, Button, SiteSelector, type SiteOption } from '../primitives'
import type { ProjectActions } from './types'

export interface ProductOption {
  id: string
  name: string
}

export interface ProgramOption {
  id: string
  name: string
}

export interface CreateProjectModalProps {
  open: boolean
  onClose: () => void
  sites: SiteOption[]
  defaultSelectedSiteId?: string
  defaultProductId?: string
  defaultProgramId?: string
  products?: ProductOption[]
  programs?: ProgramOption[]
  existingKeys?: string[]
  actions: Pick<ProjectActions, 'createProject'>
  onCreated?: (id: string) => void
}


export function CreateProjectModal({
  open, onClose, sites, defaultSelectedSiteId,
  defaultProductId, defaultProgramId,
  products = [], programs = [], existingKeys = [],
  actions, onCreated,
}: CreateProjectModalProps) {
  const [siteId, setSiteId] = useState(defaultSelectedSiteId ?? sites[0]?.siteId ?? '')
  const [name, setName] = useState('')
  const [projectKey, setProjectKey] = useState('')
  const [description, setDescription] = useState('')
  const [productId, setProductId] = useState(defaultProductId ?? '')
  const [programId, setProgramId] = useState(defaultProgramId ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // The site list / default may resolve after this modal mounts (its queries
  // are async). Adopt the default once it lands, but never clobber a user's
  // pick — important for single-site, where SiteSelector is static and never
  // fires onChange, so siteId would otherwise stay empty.
  const resolvedDefaultSite = defaultSelectedSiteId ?? sites[0]?.siteId ?? ''
  useEffect(() => {
    if (resolvedDefaultSite) setSiteId(prev => prev || resolvedDefaultSite)
  }, [resolvedDefaultSite])

  const handleNameChange = (val: string) => {
    setName(val)
    setProjectKey(deriveProjectKey(val, existingKeys))
  }

  const handleClose = () => {
    setSiteId(defaultSelectedSiteId ?? sites[0]?.siteId ?? '')
    setName('')
    setProjectKey('')
    setDescription('')
    setProductId(defaultProductId ?? '')
    setProgramId(defaultProgramId ?? '')
    setError('')
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!siteId) {
      setError('Pick a site to create the project on')
      return
    }
    const trimmedKey = projectKey.trim().toUpperCase()
    if (trimmedKey && !/^[A-Z]{2,6}$/.test(trimmedKey)) {
      setError('Project key must be 2–6 letters')
      return
    }
    setSaving(true)
    try {
      const result = await actions.createProject({
        siteId,
        name: name.trim(),
        description: description.trim() || undefined,
        productId: productId || undefined,
        programId: programId || undefined,
        ...(trimmedKey ? { key: trimmedKey } : {}),
      })
      handleClose()
      onCreated?.(result.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setSaving(false)
    }
  }

  const hasOptions = products.length > 0 || programs.length > 0

  return (
    <ModalDialog open={open} onClose={handleClose} title="New Project">
      <form onSubmit={handleSubmit} className="space-y-4">
        <SiteSelector
          sites={sites}
          value={siteId}
          onChange={setSiteId}
          required={sites.length > 1}
          helperText={sites.length > 1 ? 'Project will be created on the selected site' : undefined}
        />
        <FormField label="Project Name" htmlFor="cp-name">
          <input
            id="cp-name"
            value={name}
            onChange={e => handleNameChange(e.target.value)}
            required
            autoFocus
            placeholder="e.g. Website Redesign"
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </FormField>
        <FormField label="Key" htmlFor="cp-key">
          <input
            id="cp-key"
            value={projectKey}
            onChange={e => setProjectKey(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6))}
            maxLength={6}
            placeholder="DASH"
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-secondary font-mono focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="mt-1.5 text-micro text-text-muted">
            2–6 uppercase letters. Used in task IDs (e.g. {projectKey || 'DASH'}-1). Locked once the first task is created.
          </div>
        </FormField>
        <FormField label="Description" htmlFor="cp-desc">
          <textarea
            id="cp-desc"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={2}
            className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-1 focus:ring-accent resize-none"
          />
        </FormField>
        {hasOptions && (
          <div className="grid grid-cols-2 gap-3">
            {products.length > 0 && (
              <FormField label="Product" htmlFor="cp-product">
                <select
                  id="cp-product"
                  value={productId}
                  onChange={e => setProductId(e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">None</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </FormField>
            )}
            {programs.length > 0 && (
              <FormField label="Program" htmlFor="cp-program">
                <select
                  id="cp-program"
                  value={programId}
                  onChange={e => setProgramId(e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">None</option>
                  {programs.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </FormField>
            )}
          </div>
        )}
        {error && (
          <div className="px-3 py-2 rounded-xl bg-danger/10 border border-danger/20 text-danger text-body">{error}</div>
        )}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </form>
    </ModalDialog>
  )
}
