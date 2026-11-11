import type { ReactNode } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { Nudge } from '@agenthix/ui/attention'
import { ADMIN_CRUMB } from '../../admin/adminCrumbs'
import { Link } from 'react-router'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { useOrgAdminRead } from '../../admin/useOrgAdminState'

export type OrgAdminArea = 'settings' | 'infrastructure'

export const ORG_ADMIN_AREAS: Record<OrgAdminArea, { label: string; href: string; refusal: string }> = {
  settings: {
    label: 'Settings',
    href: '/admin/settings',
    refusal: "Only an organisation admin can see the organisation's settings.",
  },
  infrastructure: {
    label: 'Infrastructure',
    href: '/admin/infrastructure',
    refusal: 'Only an organisation admin can see Infrastructure.',
  },
}

type Props = {
  area: OrgAdminArea
  /** The page within the area; none for the area's own page. */
  title?: string
  /** Extra steps between the area and this page, such as Execution Sites before Connect a site. */
  trail?: { label: string; href: string }[]
  wide?: boolean
  children: ReactNode
}

/**
 * Organisation › Settings and Organisation › Infrastructure are for organisation
 * admins (spec §3): anyone else is told so at the address and shown nothing of it.
 */
export function OrgAdminPage({ area, title, trail = [], wide = false, children }: Props) {
  const { state, unreadable } = useOrgAdminRead()
  const { label, href, refusal } = ORG_ADMIN_AREAS[area]
  const breadcrumbs = [
    ADMIN_CRUMB,
    title ? { label, href } : { label },
    ...trail,
    ...(title ? [{ label: title }] : []),
  ]
  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      {state === 'admin' ? (
        <div className={`px-4 lg:px-10 py-9 ${wide ? 'max-w-[860px]' : 'max-w-[760px]'}`}>{children}</div>
      ) : (
        <div className="px-6 py-16 text-center">
          {unreadable ? unreadable : state === 'loading' ? (
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-text-secondary" />
          ) : (
            <div>
              <Nudge place="content" title="Admins only">{refusal}</Nudge>
              <Link to="/org" className={`rounded font-medium text-link hover:underline ${FOCUS_RING}`}>Go to Organisation</Link>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  )
}

/** A page's heading inside Organisation › Settings or › Infrastructure. */
export function OrgAdminHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-h1 font-medium text-text-primary">{title}</h1>
      {children && <p className="text-small text-text-secondary mt-0.5">{children}</p>}
    </div>
  )
}
