import { Navigate, useParams } from 'react-router'
import { workspaceViewPath } from '../../workspaceView/viewAddress'

/** A workspace's own address keeps working for links: it opens the workspace full screen (live preview spec, part 1). */
export function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  if (!workspaceId) return null
  return <Navigate to={workspaceViewPath(workspaceId)} replace />
}
