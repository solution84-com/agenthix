import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useAction, getOrgIdentity, getUserSettings, uploadOrgImage, removeOrgImage } from 'wasp/client/operations'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { IdentityHero } from '../components/IdentityHero'
import { OrgIdentityDialog } from '../components/OrgIdentityDialog'
import { WorkplaceSection } from '../components/WorkplaceSection'
import { BRANDING } from '@agenthix/core'

const ACTION = 'rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-body font-medium text-text-secondary hover:bg-surface-hover'

const since = (at: Date | string) => new Date(at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

/**
 * The Organisation page: its identity, vision and mission, and the workplace, the same for every member. An admin also
 * has Manage, which opens the admin area; nothing that manages is on this page.
 */
export function OrgPage() {
  const { data: identity } = useQuery(getOrgIdentity)
  const { data: mySettings } = useQuery(getUserSettings)
  const upload = useAction(uploadOrgImage)
  const remove = useAction(removeOrgImage)
  const [editing, setEditing] = useState(false)
  const isAdmin = mySettings?.role === 'ADMIN'

  return (
    <AppLayout breadcrumbs={[{ label: 'Organisation' }]}>
      <IdentityHero
        name={identity?.name ?? 'Organisation'}
        subline={[identity?.handle ? `@${identity.handle}` : null, identity?.since ? `on ${BRANDING.displayName} since ${since(identity.since)}` : null].filter(Boolean).join(' · ')}
        avatarUrl={identity?.avatarUrl ?? null}
        coverUrl={identity?.coverUrl ?? null}
        onUploadImage={isAdmin ? async (type, dataUrl) => { await upload({ type, dataUrl }) } : undefined}
        onRemoveImage={isAdmin ? async type => { await remove({ type }) } : undefined}
        actions={isAdmin && identity ? (
          <>
            <button type="button" onClick={() => setEditing(true)} className={ACTION}>Edit</button>
            <Link to="/admin" className={ACTION}>Manage</Link>
          </>
        ) : undefined}
      >
        {identity?.vision?.trim() && <p className="max-w-3xl text-body font-medium text-text-primary">{identity.vision}</p>}
        {identity?.mission?.trim() && <p className="mt-1 max-w-3xl text-small text-text-secondary">Mission: {identity.mission}</p>}
        {identity && !identity.vision.trim() && !identity.mission.trim() && isAdmin && (
          <p className="text-small text-text-muted">No vision or mission yet — <button type="button" onClick={() => setEditing(true)} className="text-accent hover:underline">add them</button></p>
        )}
      </IdentityHero>

      <div className="space-y-2 px-4 pb-12 pt-6 lg:px-10">
        <WorkplaceSection isAdmin={isAdmin} />
      </div>

      {identity && <OrgIdentityDialog open={editing} identity={identity} onClose={() => setEditing(false)} />}
    </AppLayout>
  )
}
