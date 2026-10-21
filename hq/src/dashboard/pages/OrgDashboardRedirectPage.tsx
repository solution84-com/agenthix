import { Navigate } from 'react-router'

/** The organisation's former Dashboard: its numbers are Today, at the top of the Organisation page (every screen reviewed spec §3). */
export function OrgDashboardRedirectPage() {
  return <Navigate to="/org" replace />
}
