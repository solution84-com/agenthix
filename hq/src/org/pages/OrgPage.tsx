import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, getOrgIdentity, getUserSettings } from 'wasp/client/operations'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { IdentityHero } from '../components/IdentityHero'
import { OrgIdentityDialog } from '../components/OrgIdentityDialog'
import { WorkplaceSection } from '../components/WorkplaceSection'
import { PicturePicker } from '../../shared/pictures/picker'
import { useSavePictures } from '../../shared/pictures/picker/useSavePictures'
import { BRANDING } from '@agenthix/core'
import { BUTTON_SECONDARY, FOCUS_RING } from '@agenthix/ui/primitives'

const ACTION = `px-3 py-1.5 text-body rounded-lg font-medium ${BUTTON_SECONDARY}`

const since = (at: Date | string) => new Date(at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

/**
 * The Organisation page: its identity, vision and mission, and the workplace, the same for every member. An admin also
 * has Manage, which opens the admin area; nothing that manages is on this page.
 */
export function OrgPage() {
  const { data: identity } = useQuery(getOrgIdentity)
  const { data: mySettings } = useQuery(getUserSettings)
  const [picker, setPicker] = useState<'avatar' | 'cover' | null>(null)
  const savePictures = useSavePictures({ kind: 'org' })
  const [editing, setEditing] = useState(false)
  const isAdmin = mySettings?.role === 'ADMIN'

  return (
    <AppLayout breadcrumbs={[{ label: 'Organisation' }]}>
      <IdentityHero
        name={identity?.name ?? 'Organisation'}
        subline={[identity?.handle ? `@${identity.handle}` : null, identity?.since ? `on ${BRANDING.displayName} since ${since(identity.since)}` : null].filter(Boolean).join(' · ')}
        avatarUrl={identity?.avatarUrl ?? null}
        coverUrl={identity?.coverUrl ?? null}
        onOpenPicker={isAdmin && identity ? setPicker : undefined}
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
          <p className="text-small text-text-muted">No vision or mission yet — <button type="button" onClick={() => setEditing(true)} className={`rounded text-link hover:underline ${FOCUS_RING}`}>add them</button></p>
        )}
      </IdentityHero>

      <div className="space-y-2 px-4 pb-12 pt-6 lg:px-10">
        <WorkplaceSection isAdmin={isAdmin} />
      </div>

      {identity && (
        <PicturePicker
          open={picker !== null} initialTab={picker ?? 'avatar'} onClose={() => setPicker(null)} save={savePictures}
          subject={{ kind: 'org', name: identity.name, role: 'Organisation' }}
          saved={{ avatarUrl: identity.avatarUrl, avatarRecipe: identity.avatarRecipe, coverUrl: identity.coverUrl, coverRecipe: identity.coverRecipe }}
        />
      )}
      {identity && <OrgIdentityDialog open={editing} identity={identity} onClose={() => setEditing(false)} />}
    </AppLayout>
  )
}
