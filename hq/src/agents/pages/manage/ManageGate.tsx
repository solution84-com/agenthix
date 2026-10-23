import type { ReactNode } from 'react'
import { ADMIN_CRUMB } from '../../../admin/adminCrumbs'
import { Link } from 'react-router'
import { useOrgAdminState, type OrgAdminState } from '../../../admin/useOrgAdminState'
import { AppLayout } from '../../../shared/layouts/AppLayout'

export { useOrgAdminState, type OrgAdminState }

export const MANAGE_REFUSAL = 'Only an organisation admin manages agents. You can use them from Agents.'

/** Organisation › Agents is for organisation admins (spec §3): anyone else is told so and shown nothing of it. */
export function ManageGate({ state, children }: { state: OrgAdminState; children: ReactNode }) {
  if (state === 'admin') return <>{children}</>
  return (
    <AppLayout breadcrumbs={[ADMIN_CRUMB, { label: 'Agents' }]}>
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
