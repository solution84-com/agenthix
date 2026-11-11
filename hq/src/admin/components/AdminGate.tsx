import type { ReactNode } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { Nudge } from '@agenthix/ui/attention'
import { Link, Navigate } from 'react-router'
import { useAuth } from 'wasp/client/auth'
import { useOrgAdminRead } from '../useOrgAdminState'

export const ADMIN_REFUSAL = 'Only organisation admins can manage the organisation. Ask an admin if you need something changed.'

/**
 * The route guard at the top of the admin area (spec: the organisation's admin area): nothing under /admin is drawn
 * — so nothing under it loads its data — until the person is known to be an admin. The server still refuses every
 * operation behind it; this is the first guard, not the only one.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const { state, unreadable } = useOrgAdminRead()
  // The admin frame is drawn around the page, so the page's own sign-in redirect never runs: the gate makes it.
  if (!auth.isLoading && auth.data === null) return <Navigate to="/login" replace />
  if (state === 'admin') return <>{children}</>
  return (
    <main className="flex-1 min-w-0 overflow-y-auto px-6 py-16 text-center">
      {unreadable ? unreadable : state === 'loading' ? (
        <div role="status" aria-label="Loading" className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-text-secondary" />
      ) : (
        <div>
          <Nudge place="content" title="Admins only">{ADMIN_REFUSAL}</Nudge>
          <Link to="/org" className={`rounded font-medium text-link hover:underline ${FOCUS_RING}`}>Go to the organisation's page</Link>
        </div>
      )}
    </main>
  )
}
