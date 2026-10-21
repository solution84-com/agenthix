import { Navigate, useParams } from 'react-router'

/** A board's own address, kept for links: it opens the project with the Boards tool at that board. */
export function BoardPage() {
  const { key, boardId } = useParams<{ key: string; boardId: string }>()
  if (!key || !boardId) return <Navigate to="/projects" replace />
  return <Navigate to={`/projects/${key}?tool=boards&board=${boardId}`} replace />
}
