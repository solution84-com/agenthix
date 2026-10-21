import { Navigate, useParams } from 'react-router'

/** A project's Settings address, kept for links: it opens the project with the Settings tool. */
export function ProjectSettingsAddress() {
  const { key } = useParams<{ key: string }>()
  if (!key) return <Navigate to="/projects" replace />
  return <Navigate to={`/projects/${key}?tool=settings`} replace />
}
