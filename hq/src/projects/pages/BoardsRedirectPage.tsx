import { Navigate } from 'react-router'

/** The organisation's former Boards list: its boards are the Boards view of the Projects screen (every screen reviewed spec §3). */
export function BoardsRedirectPage() {
  return <Navigate to="/projects?view=boards" replace />
}
