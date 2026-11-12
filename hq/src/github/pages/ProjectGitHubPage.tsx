import { Navigate, useParams } from 'react-router'

/** A project's GitHub address opens its GitHub section (a section of the project, as the Vault is). */
export function ProjectGitHubPage() {
  const { key } = useParams<{ key: string }>()
  return <Navigate to={`/projects/${key}?tool=github`} replace />
}
