import { Navigate, useParams } from 'react-router'

/** A project's former Files tab address: it opens the project with the Files tool (every screen reviewed spec §3). */
export function ProjectFilesPage() {
  const { key } = useParams<{ key: string }>()
  return <Navigate to={`/projects/${key}?tool=files`} replace />
}
