import type { ReactNode } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { Nudge } from '@agenthix/ui/attention'
import { ADMIN_CRUMB } from '../../../admin/adminCrumbs'
import { Link } from 'react-router'
import { AppLayout } from '../../../shared/layouts/AppLayout'
import { useOrgAdminRead } from '../../../admin/useOrgAdminState'

export const PEOPLE_REFUSAL = 'Only an organisation admin manages the organisation\'s people.'

/** Organisation › People is for organisation admins (spec §3): anyone else is told so and shown nothing of it. */
export function OrgPeopleGate({ children }: { children: ReactNode }) {
  const { state, unreadable } = useOrgAdminRead()
  if (state === 'admin') return <>{children}</>
  return (
    <AppLayout breadcrumbs={[ADMIN_CRUMB, { label: 'People' }]}>
      <div className="px-6 py-16 text-center">
        {unreadable ? unreadable : state === 'loading' ? (
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-text-secondary" />
        ) : (
          <div>
            <Nudge place="content" title="Admins only">{PEOPLE_REFUSAL}</Nudge>
            <Link to="/" className={`rounded font-medium text-link hover:underline ${FOCUS_RING}`}>Go home</Link>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
