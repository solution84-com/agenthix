import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useQuery, getUserSettings } from 'wasp/client/operations'
import { AppLayout } from '../../../shared/layouts/AppLayout'

export type OrgAdminState = 'loading' | 'admin' | 'refused'

/** Unlike `useIsAdmin`, nothing is shown to anyone until the role is known to be ADMIN. */
export function useOrgAdminState(): OrgAdminState {
  const { data, isLoading } = useQuery(getUserSettings)
  if (isLoading || data === undefined) return 'loading'
  return data?.role === 'ADMIN' ? 'admin' : 'refused'
}

export const MANAGE_REFUSAL = 'Only an organisation admin manages agents. You can use them from Agents.'

/** Organisation › Agents is for organisation admins (spec §3): anyone else is told so and shown nothing of it. */
export function ManageGate({ state, children }: { state: OrgAdminState; children: ReactNode }) {
  if (state === 'admin') return <>{children}</>
  return (
    <AppLayout breadcrumbs={[{ label: 'Organisation', href: '/org' }, { label: 'Agents' }]}>
      <div className="px-6 py-16 text-center">
        {state === 'loading' ? (
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-accent" />
        ) : (
          <div role="alert">
            <h2 className="mb-2 text-h2 font-semibold text-text-primary">Admins only</h2>
            <p className="mb-6 text-text-muted">{MANAGE_REFUSAL}</p>
            <Link to="/agents" className="font-medium text-accent hover:text-accent-hover">Go to Agents</Link>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
