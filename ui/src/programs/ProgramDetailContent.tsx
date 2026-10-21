import { useState, useEffect } from 'react'
import { SiteSelector, type SiteOption } from '../primitives'
import type { ProgramDetail, AllProject, ProgramActions } from './types'

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
  const [editSaving, setEditSaving] = useState(false)

  // Delete modal state
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Create project modal state
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [siteId, setSiteId] = useState(sites[0]?.siteId ?? '')
  const [projName, setProjName] = useState('')
  const [projDesc, setProjDesc] = useState('')
  const [projError, setProjError] = useState('')
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
    if (!siteId) {
      setProjError('Pick a site to create the project on')
      return
    }
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
            <h1 className="text-h1 font-semibold text-text-primary">{program.name}</h1>
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
          <button
            onClick={() => {
              setEditName(program.name)
              setEditSlug(program.slug ?? '')
              setEditDesc(program.description ?? '')
              setEditStatus(program.status ?? 'planning')
              setEditError('')
              setShowEdit(true)
            }}
            className="text-small px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:text-text-secondary hover:border-border"
          >
            Edit
          </button>
          <button
            onClick={() => setShowDelete(true)}
            className="text-small px-3 py-1.5 rounded-lg border border-danger/20 text-danger/60 hover:text-danger hover:border-danger/30"
          >
            Delete
          </button>
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
            <button onClick={() => setShowAssign(true)} className="text-small text-text-muted hover:text-text-secondary px-2 py-1 rounded border border-border">Assign</button>
            <button onClick={() => setShowCreateProject(true)} className="text-small text-text-muted hover:text-text-secondary px-2 py-1 rounded border border-border">+ New</button>
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
          <form onSubmit={handleEdit} onClick={e => e.stopPropagation()} className="bg-surface-1 border border-border rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-h2 font-semibold text-text-primary">Edit Program</h2>
            <label className="block space-y-1">
              <span className="text-small text-text-secondary">Name</span>
              <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none" required />
            </label>
            <label className="block space-y-1">
              <span className="text-small text-text-secondary">Slug</span>
              <input value={editSlug} onChange={e => setEditSlug(e.target.value)} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none" />
            </label>
            <label className="block space-y-1">
              <span className="text-small text-text-secondary">Description</span>
              <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none resize-none" />
            </label>
            <label className="block space-y-1">
              <span className="text-small text-text-secondary">Status</span>
              <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary">
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            {editError && <p className="text-small text-danger">{editError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setShowEdit(false); setEditError('') }} className="px-3 py-1.5 text-body text-text-secondary">Cancel</button>
              <button type="submit" disabled={editSaving} className="px-4 py-1.5 text-body bg-accent hover:bg-accent-hover text-on-accent rounded-lg disabled:opacity-50">
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete modal */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim" onClick={() => { setShowDelete(false); setDeleteError('') }}>
          <div onClick={e => e.stopPropagation()} className="bg-surface-1 border border-border rounded-xl p-6 max-w-sm space-y-4">
            <h2 className="text-h2 font-semibold text-text-primary">Delete "{program.name}"?</h2>
            <p className="text-body text-text-secondary">Projects will be unassigned. This cannot be undone.</p>
            {deleteError && <p className="text-small text-danger">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowDelete(false); setDeleteError('') }} className="px-3 py-1.5 text-body text-text-secondary">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="px-4 py-1.5 text-body bg-danger text-on-accent rounded-lg disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create project modal */}
      {showCreateProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim" onClick={() => { setShowCreateProject(false); setSiteId(resolvedDefaultSite); setProjName(''); setProjDesc(''); setProjError('') }}>
          <form onSubmit={handleCreateProject} onClick={e => e.stopPropagation()} className="bg-surface-1 border border-border rounded-xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-h2 font-semibold text-text-primary">New Project</h2>
            <SiteSelector
              sites={sites}
              value={siteId}
              onChange={setSiteId}
              required={sites.length > 1}
              helperText={sites.length > 1 ? 'Project will be created on the selected site' : undefined}
            />
            <label className="block space-y-1">
              <span className="text-small text-text-secondary">Name</span>
              <input value={projName} onChange={e => setProjName(e.target.value)} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none" required />
            </label>
            <label className="block space-y-1">
              <span className="text-small text-text-secondary">Description</span>
              <textarea value={projDesc} onChange={e => setProjDesc(e.target.value)} rows={2} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none resize-none" />
            </label>
            {projError && <p className="text-small text-danger">{projError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setShowCreateProject(false); setSiteId(resolvedDefaultSite); setProjName(''); setProjDesc(''); setProjError('') }} className="px-3 py-1.5 text-body text-text-secondary">Cancel</button>
              <button type="submit" disabled={projSaving} className="px-4 py-1.5 text-body bg-accent text-on-accent rounded-lg disabled:opacity-50">{projSaving ? 'Creating…' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Assign project modal */}
      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim" onClick={() => { setShowAssign(false); setAssignSearch(''); setAssignError('') }}>
          <div onClick={e => e.stopPropagation()} className="bg-surface-1 border border-border rounded-xl p-6 w-full max-w-sm space-y-3">
            <h2 className="text-h2 font-semibold text-text-primary">Assign Existing Project</h2>
            <input value={assignSearch} onChange={e => setAssignSearch(e.target.value)} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none" placeholder="Search…" />
            <div className="max-h-48 overflow-y-auto space-y-1">
              {assignable.length === 0 ? (
                <p className="text-small text-text-muted text-center py-4">No unassigned projects.</p>
              ) : (
                assignable.map(p => (
                  <button key={p.id} onClick={() => handleAssign(p.id)} disabled={assigning === p.id} className="w-full text-left px-3 py-2 text-body text-text-secondary hover:bg-surface-hover rounded-lg disabled:opacity-50">
                    {p.name} <span className="text-text-muted text-small">{p.key}</span>
                  </button>
                ))
              )}
            </div>
            {assignError && <p className="text-small text-danger">{assignError}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
