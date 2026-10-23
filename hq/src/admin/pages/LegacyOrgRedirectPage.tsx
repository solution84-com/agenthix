import { Navigate, useLocation } from 'react-router'
import { adminPathFor } from '../adminPaths'

/** A former /org address (settings, infrastructure, people, agents): it moved under /admin, and its query and anchor go with it. */
export function LegacyOrgRedirectPage() {
  const { pathname, search, hash } = useLocation()
  return <Navigate to={`${adminPathFor(pathname) ?? '/org'}${search}${hash}`} replace />
}
