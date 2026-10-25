import { Navigate } from 'react-router'

/** Registering the App moved to Manage organisation › Settings › GitHub; the old address still opens it. */
export function GitHubAppPage() {
  return <Navigate to="/admin/settings/github" replace />
}
