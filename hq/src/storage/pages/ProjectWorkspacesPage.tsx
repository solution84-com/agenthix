import { Navigate, useParams } from 'react-router'

/** A project's former Workspaces tab address: it opens the project with the Workspaces tool (every screen reviewed spec §3). */
export function ProjectWorkspacesPage() {
  const { key } = useParams<{ key: string }>()
  return <Navigate to={`/projects/${key}?tool=workspaces`} replace />
}
