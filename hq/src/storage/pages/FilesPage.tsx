import { Navigate, useParams } from 'react-router'
import { useQuery, getProject } from 'wasp/client/operations'

/**
 * An owner's Files address keeps working for links: it opens the place with the Files tool, the project's, or the
 * person's own space (every screen reviewed spec §3).
 */
export function FilesPage() {
  const { ownerType, ownerId } = useParams<{ ownerType: string; ownerId: string }>()
  const isProject = ownerType === 'project'
  const { data: project, error } = useQuery(getProject, isProject && ownerId ? { projectId: ownerId } : undefined, { enabled: isProject })
  if (!isProject) return <Navigate to="/chat?tool=files" replace />
  if (error) return <p role="alert" className="px-6 py-6 text-body text-danger">{error.message}</p>
  const key = project?.key
  if (!key) return <p className="px-6 py-6 text-body text-text-muted">Loading…</p>
  return <Navigate to={`/projects/${key}?tool=files`} replace />
}
