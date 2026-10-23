import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useOrgAdminState } from '../useOrgAdminState'

export const ADMIN_REFUSAL = 'Only organisation admins can manage the organisation. Ask an admin if you need something changed.'

/**
 * The route guard at the top of the admin area (spec: the organisation's admin area): nothing under /admin is drawn
 * — so nothing under it loads its data — until the person is known to be an admin. The server still refuses every
 * operation behind it; this is the first guard, not the only one.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const state = useOrgAdminState()
  if (state === 'admin') return <>{children}</>
  return (
    <main className="flex-1 min-w-0 overflow-y-auto px-6 py-16 text-center">
      {state === 'loading' ? (
        <div role="status" aria-label="Loading" className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-accent" />
      ) : (
        <div role="alert">
          <h2 className="mb-2 text-h2 font-semibold text-text-primary">Admins only</h2>
          <p className="mb-6 text-text-muted">{ADMIN_REFUSAL}</p>
          <Link to="/org" className="font-medium text-accent hover:text-accent-hover">Go to the organisation's page</Link>
        </div>
      )}
    </main>
  )
}
