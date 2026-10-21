import { Navigate } from 'react-router'

/** The global Workspaces address keeps working for old links: it opens the Workspaces view of the Projects screen. */
export function WorkspacesPage() {
  return <Navigate to="/projects?view=workspaces" replace />
}
