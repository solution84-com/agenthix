import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { SiteSelector, type SiteOption } from '../primitives'
import type { ProductDetail, AllProject, ProductActions } from './types'

interface ProductOverviewTabProps {
  product: ProductDetail
  allProjects: AllProject[]
  actions: Pick<ProductActions, 'createProject' | 'assignProject'>
  // Optional + defaulted, not required: a sibling copy of this component
  // (a parked client outside this repository) also renders it and may not supply this yet.
  sites?: SiteOption[]
}

export function ProductOverviewTab({ product, allProjects, actions, sites = [] }: ProductOverviewTabProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [siteId, setSiteId] = useState(sites[0]?.siteId ?? '')
  const [projName, setProjName] = useState('')
  const [projDesc, setProjDesc] = useState('')
  const [projError, setProjError] = useState('')
  const [assignSearch, setAssignSearch] = useState('')
  const [assigning, setAssigning] = useState<string | null>(null)
  const [assignError, setAssignError] = useState('')

  // The site list may resolve after this tab mounts (its query is async). Adopt
  // the default once it lands, but never clobber a user's pick — important for
  // single-site, where SiteSelector is static and never fires onChange, so
  // siteId would otherwise stay empty.
  const resolvedDefaultSite = sites[0]?.siteId ?? ''
  useEffect(() => {
    if (resolvedDefaultSite) setSiteId(prev => prev || resolvedDefaultSite)
  }, [resolvedDefaultSite])

  const assignable = allProjects.filter(p => !p.productId)
  const filtered = assignable.filter(p => p.name.toLowerCase().includes(assignSearch.toLowerCase()))

  const totalTasks = product.projects.reduce((s, p) => s + p.taskCount, 0)
  const runningTasks = product.projects.reduce(
    (s, p) => s + p.tasks.filter(t => t.runState === 'RUN_ACTIVE').length,
    0
  )
  const doneTasks = product.projects.reduce(
    (s, p) => s + p.tasks.filter(t => t.state === 'DONE').length,
    0
  )

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projName.trim()) return
    setProjError('')
    if (!siteId) {
      setProjError('Pick a site to create the project on')
      return
    }
    try {
      await actions.createProject({ name: projName.trim(), description: projDesc.trim() || undefined, productId: product.id, siteId })
      setShowCreate(false)
      setSiteId(resolvedDefaultSite)
      setProjName('')
      setProjDesc('')
    } catch (err) {
      setProjError(err instanceof Error ? err.message : 'Failed to create project')
    }
  }

  const handleAssign = async (projectId: string) => {
    setAssigning(projectId)
    setAssignError('')
    try {
      await actions.assignProject({ projectId, productId: product.id })
      setShowAssign(false)
      setAssignSearch('')
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'Failed to assign project')
    } finally {
      setAssigning(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {totalTasks > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-small text-text-muted">
            <span>Task health</span>
            <span>{doneTasks}/{totalTasks} done</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden flex">
            <div className="bg-success" style={{ width: `${(doneTasks / totalTasks) * 100}%` }} />
            <div className="bg-accent" style={{ width: `${(runningTasks / totalTasks) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-h2 font-medium text-text-secondary">Projects ({product.projects.length})</h2>
          <div className="flex gap-2">
            <button onClick={() => setShowAssign(true)} className="text-small text-text-muted hover:text-text-secondary px-2 py-1 rounded border border-border hover:border-border">Assign</button>
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 text-small text-text-muted hover:text-text-secondary px-2 py-1 rounded border border-border hover:border-border">
              <Plus className="w-3 h-3" /> New
            </button>
          </div>
        </div>
        {product.projects.length === 0 ? (
          <p className="text-small text-text-muted py-4 text-center">No projects yet.</p>
        ) : (
          <div className="space-y-2">
            {product.projects.map(p => (
              <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-1 border border-border">
                <div>
                  <span className="text-body text-text-primary">{p.name}</span>
                  <span className="ml-2 text-small text-text-muted">{p.key}</span>
                </div>
                <span className="text-small text-text-muted">{p.taskCount} tasks</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim" onClick={() => setShowCreate(false)}>
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
              <input value={projName} onChange={e => setProjName(e.target.value)} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none" placeholder="Project name" required />
            </label>
            <label className="block space-y-1">
              <span className="text-small text-text-secondary">Description (optional)</span>
              <textarea value={projDesc} onChange={e => setProjDesc(e.target.value)} rows={2} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none resize-none" />
            </label>
            {projError && <p className="text-small text-danger">{projError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-body text-text-secondary">Cancel</button>
              <button type="submit" className="px-4 py-1.5 text-body bg-accent hover:bg-accent-hover text-on-accent rounded-lg">Create</button>
            </div>
          </form>
        </div>
      )}

      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim" onClick={() => { setShowAssign(false); setAssignError('') }}>
          <div onClick={e => e.stopPropagation()} className="bg-surface-1 border border-border rounded-xl p-6 w-full max-w-sm space-y-3">
            <h2 className="text-h2 font-semibold text-text-primary">Assign Existing Project</h2>
            <input value={assignSearch} onChange={e => setAssignSearch(e.target.value)} className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary focus:outline-none" placeholder="Search projects…" />
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="text-small text-text-muted text-center py-4">No unassigned projects.</p>
              ) : (
                filtered.map(p => (
                  <button key={p.id} onClick={() => handleAssign(p.id)} disabled={assigning === p.id} className="w-full text-left px-3 py-2 text-body text-text-secondary hover:bg-surface-hover rounded-lg disabled:opacity-50">
                    {p.name} <span className="text-text-muted text-small ml-1">{p.key}</span>
                  </button>
                ))
              )}
            </div>
            {assignError && <p className="text-small text-danger pt-1">{assignError}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
