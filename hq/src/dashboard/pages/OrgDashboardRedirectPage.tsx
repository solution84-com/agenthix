import { Navigate } from 'react-router'

/** The organisation's former Dashboard: its numbers are Today, on the admin area's Overview. */
export function OrgDashboardRedirectPage() {
  return <Navigate to="/admin" replace />
}
