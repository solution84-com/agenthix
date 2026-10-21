import { Navigate, useParams } from 'react-router'
import { useQuery, getWorkspace } from 'wasp/client/operations'

/**
 * A workspace's own address keeps working for links: it opens the place that holds it — its project, or the
 * person's own space — with the Workspaces tool and that workspace open (every screen reviewed spec §3).
 */
export function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { data: ws, error } = useQuery(getWorkspace, workspaceId ? { workspaceId } : undefined)
  if (error) return <p role="alert" className="px-6 py-6 text-body text-danger">{error.message}</p>
  if (!ws) return <p className="px-6 py-6 text-body text-text-muted">Loading…</p>
  const place = ws.ownerType === 'project' && ws.ownerKey ? `/projects/${ws.ownerKey}` : '/chat'
  return <Navigate to={`${place}?tool=workspaces&workspace=${ws.id}`} replace />
}
