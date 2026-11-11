import { useState, useEffect } from 'react'
import { SiteSelector, type SiteOption } from '../primitives'
import type { ProgramDetail, AllProject, ProgramActions } from './types'
import { Button } from '../primitives/Button'
import { FIELD, FOCUS_RING_INSET, ROW_ITEM } from '../primitives/controlStyles'
import { NativeSelect } from '../primitives/NativeSelect'
import { useAttentionWhen } from '../attention/useAttentionWhen'
import { ConfirmDialog } from '../primitives/ConfirmDialog'

// Create cannot work without a site to put the project on: refused before the press, with the reason.
const NO_SITE_REFUSAL = {
  reason: 'No Execution Site is connected, so there is nowhere to create the project.',
  title: 'There is no site to create it on',
}

interface ProgramDetailContentProps {
  program: ProgramDetail
  allProjects: AllProject[]
  actions: ProgramActions
  onProgramDeleted: () => void
  // Optional + defaulted, not required: a sibling copy of this component
  // (a parked client outside this repository) also renders it and may not supply this yet.
  sites?: SiteOption[]
}

export function ProgramDetailContent({ program, allProjects, actions, onProgramDeleted, sites = [] }: ProgramDetailContentProps) {

  // Edit modal state
  const [showEdit, setShowEdit] = useState(false)
  const [editName, setEditName] = useState(program.name)
  const [editSlug, setEditSlug] = useState(program.slug ?? '')
  const [editDesc, setEditDesc] = useState(program.description ?? '')
  const [editStatus, setEditStatus] = useState(program.status ?? 'planning')
  const [editError, setEditError] = useState('')
  const editErrorDialog = useAttentionWhen(editError, { kind: 'alert' })
  const [editSaving, setEditSaving] = useState(false)

  // Delete modal state
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const deleteErrorDialog = useAttentionWhen(deleteError, { kind: 'alert' })

  // Create project modal state
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [siteId, setSiteId] = useState(sites[0]?.siteId ?? '')
  const [projName, setProjName] = useState('')
  const [projDesc, setProjDesc] = useState('')
  const [projError, setProjError] = useState('')
  const projErrorDialog = useAttentionWhen(projError, { kind: 'alert' })
  const [projSaving, setProjSaving] = useState(false)

  // The site list may resolve after this content mounts (its query is async).
  // Adopt the default once it lands, but never clobber a user's pick —
  // important for single-site, where SiteSelector is static and never fires
  // onChange, so siteId would otherwise stay empty.
  const resolvedDefaultSite = sites[0]?.siteId ?? ''
  useEffect(() => {
    if (resolvedDefaultSite) setSiteId(prev => prev || resolvedDefaultSite)
  }, [resolvedDefaultSite])

  // Assign project modal state
  const [showAssign, setShowAssign] = useState(false)
  const [assignSearch, setAssignSearch] = useState('')
  const [assigning, setAssigning] = useState<string | null>(null)
  const [assignError, setAssignError] = useState('')
  const assignErrorDialog = useAttentionWhen(assignError, { kind: 'alert' })

  // Reset state when program changes
  useEffect(() => {
    setEditName(program.name)
    setEditSlug(program.slug ?? '')
    setEditDesc(program.description ?? '')
    setEditStatus(program.status ?? 'planning')
    setEditError('')
    setShowEdit(false)
    setShowDelete(false)
    setDeleteError('')
    setShowCreateProject(false)
    setSiteId(resolvedDefaultSite)
    setProjName('')
    setProjDesc('')
    setProjError('')
    setShowAssign(false)
    setAssignSearch('')
    setAssignError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program.id])

  const assignable = allProjects
    .filter(p => !p.programId)
    .filter(p => p.name.toLowerCase().includes(assignSearch.toLowerCase()))

  const STATUS_BADGE: Record<string, string> = {
    planning: 'bg-warning/15 text-warning border-warning/25',
    active: 'bg-success/15 text-success border-success/25',
    archived: 'bg-surface-2 text-text-muted border-border',
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEditSaving(true)
    setEditError('')
    try {
      await actions.updateProgram({
        programId: program.id,
        name: editName.trim(),
        slug: editSlug.trim() || undefined,
        description: editDesc.trim() || null,
        status: editStatus,
      })
      setShowEdit(false)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setEditSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    setDeleteError('')
    try {
      await actions.deleteProgram(program.id)
      onProgramDeleted()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete')
      setDeleting(false)
    }
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projName.trim()) return
    setProjError('')
    if (!siteId) return
    setProjSaving(true)
    try {
      await actions.createProject({
        name: projName.trim(),
        description: projDesc.trim() || undefined,
        programId: program.id,
        siteId,
      })
      setShowCreateProject(false)
      setSiteId(resolvedDefaultSite)
      setProjName('')
      setProjDesc('')
    } catch (err) {
      setProjError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setProjSaving(false)
    }
  }

  const handleAssign = async (projectId: string) => {
    setAssigning(projectId)
    setAssignError('')
    try {
      await actions.assignProject({ projectId, programId: program.id })
      setShowAssign(false)
      setAssignSearch('')
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'Failed to assign project')
    } finally {
      setAssigning(null)
    }
  }

  const statusBadge = program.status
    ? (STATUS_BADGE[program.status] ?? STATUS_BADGE.archived)
    : ''

  return (
    <div className="flex flex-col h-full">
      {/* Header (persistent above the tab bar) */}
      <div className="px-6 pt-5 pb-4 flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-h1 font-medium text-text-primary">{program.name}</h1>
            {program.status && (
              <span className={`text-small px-2 py-0.5 rounded-full border ${statusBadge}`}>
                {program.status}
              </span>
            )}
          </div>
          {program.description && (
            <p className="text-body text-text-secondary">{program.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setEditName(program.name)
              setEditSlug(program.slug ?? '')
              setEditDesc(program.description ?? '')
              setEditStatus(program.status ?? 'planning')
              setEditError('')
              setShowEdit(true)
            }}
          >
            Edit
          </Button>
          <Button variant="danger" onClick={() => setShowDelete(true)}>
            Delete
          </Button>
        </div>
      </div>

      {/* A programme groups projects and owns nothing (ADR-0061) — no files, no
          workspaces, no members — so it has no storage tabs and needs no tab bar. */}
      <div className="flex-1 overflow-y-auto">
        {(
        <div className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-h2 font-medium text-text-secondary">Projects ({program.projects.length})</h2>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowAssign(true)}>Assign</Button>
            <Button variant="secondary" size="sm" onClick={() => setShowCreateProject(true)}>+ New</Button>
          </div>
        </div>
        {program.projects.length === 0 ? (
          <p className="text-small text-text-muted py-4 text-center">No projects yet.</p>
        ) : (
          <div className="space-y-2">
            {program.projects.map(p => (
              <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-1 border border-border">
                <span className="text-body text-text-primary">{p.name}</span>
                <span className="text-small text-text-muted">{p.key}</span>
              </div>
            ))}
          </div>
        )}
        </div>
        )}
      </div>

      {/* Edit modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim" onClick={() => { setShowEdit(false); setEditError('') }}>
          <form onSubmit={handleEdit} onClick={e => e.stopPropagation()} className="bg-popover shadow-pop border border-border rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-h2 font-medium text-text-primary">Edit Program</h2>
            <label className="block space-y-1">
              <span className="text-small text-text-secondary">Name</span>
              <input value={editName} onChange={e => setEditName(e.target.value)} className={`${FIELD} w-full rounded-lg px-3 py-2 text-body`} required />
            </label>
            <label className="block space-y-1">
              <span className="text-small text-text-secondary">Slug</span>
              <input value={editSlug} onChange={e => setEditSlug(e.target.value)} className={`${FIELD} w-full rounded-lg px-3 py-2 text-body`} />
            </label>
            <label className="block space-y-1">
              <span className="text-small text-text-secondary">Description</span>
              <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2} className={`${FIELD} w-full rounded-lg px-3 py-2 text-body resize-none`} />
            </label>
            <label className="block space-y-1">
              <span className="text-small text-text-secondary">Status</span>
              <NativeSelect value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </NativeSelect>
            </label>
            {editErrorDialog}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => { setShowEdit(false); setEditError('') }}>Cancel</Button>
              <Button type="submit" disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Delete modal */}
      <ConfirmDialog
        open={showDelete}
        title={`Delete "${program.name}"?`}
        description="Projects will be unassigned. This cannot be undone."
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        destructive
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => { setShowDelete(false); setDeleteError('') }}
      />
      {deleteErrorDialog}

      {/* Create project modal */}
      {showCreateProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim" onClick={() => { setShowCreateProject(false); setSiteId(resolvedDefaultSite); setProjName(''); setProjDesc(''); setProjError('') }}>
          <form onSubmit={handleCreateProject} onClick={e => e.stopPropagation()} className="bg-popover shadow-pop border border-border rounded-xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-h2 font-medium text-text-primary">New Project</h2>
            <SiteSelector
              sites={sites}
              value={siteId}
              onChange={setSiteId}
              required={sites.length > 1}
              helperText={sites.length > 1 ? 'Project will be created on the selected site' : undefined}
            />
            <label className="block space-y-1">
              <span className="text-small text-text-secondary">Name</span>
              <input value={projName} onChange={e => setProjName(e.target.value)} className={`${FIELD} w-full rounded-lg px-3 py-2 text-body`} required />
            </label>
            <label className="block space-y-1">
              <span className="text-small text-text-secondary">Description</span>
              <textarea value={projDesc} onChange={e => setProjDesc(e.target.value)} rows={2} className={`${FIELD} w-full rounded-lg px-3 py-2 text-body resize-none`} />
            </label>
            {projErrorDialog}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => { setShowCreateProject(false); setSiteId(resolvedDefaultSite); setProjName(''); setProjDesc(''); setProjError('') }}>Cancel</Button>
              <Button type="submit" disabled={projSaving} refusal={siteId ? undefined : NO_SITE_REFUSAL}>{projSaving ? 'Creating…' : 'Create'}</Button>
            </div>
          </form>
        </div>
      )}

      {/* Assign project modal */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim" onClick={() => { setShowAssign(false); setAssignSearch(''); setAssignError('') }}>
          <div onClick={e => e.stopPropagation()} className="bg-popover shadow-pop border border-border rounded-xl p-6 w-full max-w-sm space-y-3">
            <h2 className="text-h2 font-medium text-text-primary">Assign Existing Project</h2>
            <input value={assignSearch} onChange={e => setAssignSearch(e.target.value)} className={`${FIELD} w-full rounded-lg px-3 py-2 text-body`} placeholder="Search…" />
            <div className="max-h-48 overflow-y-auto space-y-1">
              {assignable.length === 0 ? (
                <p className="text-small text-text-muted text-center py-4">No unassigned projects.</p>
              ) : (
                assignable.map(p => (
                  <button key={p.id} onClick={() => handleAssign(p.id)} disabled={assigning === p.id} className={`w-full text-left px-3 py-2 text-body rounded-lg ${ROW_ITEM} ${FOCUS_RING_INSET}`}>
                    {p.name} <span className="text-text-muted text-small">{p.key}</span>
                  </button>
                ))
              )}
            </div>
            {assignErrorDialog}
          </div>
        </div>
      )}
    </div>
  )
}
