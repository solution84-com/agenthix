import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ProgramCard } from './ProgramCard'
import { deriveSlug } from '@agenthix/core'
import type { SiteOption } from '../primitives'
import type { ProgramListItem, ProgramActions } from './types'
import { FIELD } from '../primitives/controlStyles'
import { Button } from '../primitives/Button'
import { BUTTON_SECONDARY } from '../primitives/buttonStyles'
import { useAttentionWhen } from '../attention/useAttentionWhen'

interface ProgramsListContentProps {
  programs: ProgramListItem[]
  getProgramHref: (program: ProgramListItem) => string
  actions?: Pick<ProgramActions, 'createProgram'>
  sites?: SiteOption[]
  defaultSelectedSiteId?: string
  onProgramCreated?: (slug: string) => void
  onProgramClick?: (program: ProgramListItem) => void
}

export function ProgramsListContent({ programs, getProgramHref, actions, onProgramCreated, onProgramClick }: ProgramsListContentProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const errorDialog = useAttentionWhen(error)
  const [saving, setSaving] = useState(false)

  const handleClose = () => {
    setShowCreate(false)
    setName('')
    setSlug('')
    setSlugTouched(false)
    setDescription('')
    setError('')
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !actions?.createProgram) return
    setSaving(true)
    setError('')
    try {
      const result = await actions.createProgram({
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
      })
      handleClose()
      onProgramCreated?.(result.slug)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create program')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 font-medium text-text-primary">Programs</h1>
        {actions?.createProgram && (
          <button
            onClick={() => setShowCreate(true)}
            className={`flex items-center gap-1.5 text-small px-3 py-1.5 rounded-button font-button ${BUTTON_SECONDARY}`}
          >
            <Plus className="w-3.5 h-3.5" /> New Program
          </button>
        )}
      </div>

      {programs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted space-y-2">
          <p className="text-body">No programs yet.</p>
          {actions?.createProgram && (
            <button onClick={() => setShowCreate(true)} className="text-body text-text-secondary hover:text-text-secondary underline">
              Create your first program
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {programs.map(p => (
            <ProgramCard key={p.id} program={p} href={getProgramHref(p)} onClick={onProgramClick ? () => onProgramClick(p) : undefined} />
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim" onClick={handleClose}>
          <form onSubmit={handleCreate} onClick={e => e.stopPropagation()} className="bg-popover shadow-pop border border-border rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-h2 font-medium text-text-primary">New Program</h2>
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-small text-text-secondary">Name</span>
                <input value={name} onChange={e => { const v = e.target.value; setName(v); if (!slugTouched) setSlug(deriveSlug(v)) }} className={`${FIELD} w-full rounded-lg px-3 py-2 text-body`} placeholder="My Program" required />
              </label>
              <label className="block space-y-1">
                <span className="text-small text-text-secondary">Slug (optional)</span>
                <input value={slug} onChange={e => { setSlug(e.target.value); setSlugTouched(true) }} className={`${FIELD} w-full rounded-lg px-3 py-2 text-body`} placeholder="my-program" />
              </label>
              <label className="block space-y-1">
                <span className="text-small text-text-secondary">Description (optional)</span>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={`${FIELD} w-full rounded-lg px-3 py-2 text-body resize-none`} />
              </label>
            </div>
            {errorDialog}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" type="button" onClick={handleClose}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
