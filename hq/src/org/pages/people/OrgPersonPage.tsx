import { useState } from 'react'
import { ADMIN_CRUMB } from '../../../admin/adminCrumbs'
import { Link, useParams } from 'react-router'
import { MoreHorizontal } from 'lucide-react'
import { useQuery, useAction, getOrgPerson, reactivatePerson, updateUserRole } from 'wasp/client/operations'
import { Button, FOCUS_RING_INSET, ROW_ITEM, BUTTON_SECONDARY, Tooltip } from '@agenthix/ui/primitives'
import { AppLayout } from '../../../shared/layouts/AppLayout'
import { OrgPeopleGate } from './OrgPeopleGate'
import { IdentityHero } from '../../components/IdentityHero'
import { PicturePicker } from '../../../shared/pictures/picker'
import { useSavePictures } from '../../../shared/pictures/picker/useSavePictures'
import { InspectPicture } from '../../../shared/pictures/InspectPicture'
import { PersonProfileFacts } from './PersonProfileFacts'
import { RoleChoices } from './RoleChoices'
import { PersonProjects } from './PersonProjects'
import { ErasePersonDialog } from './ErasePersonDialog'
import { ResetPasswordDialog } from './ResetPasswordDialog'
import { fleetAdminRole, localTimeText, shortDate, shownHandle, type OrgRole } from './peopleFormat'
import { useAttentionWhen, useBackgroundRead } from '@agenthix/ui/attention'
import { useDemo } from '../../../demo/useDemo'

function LeftNotice({ userId, name, leftAt, leftBy, erased, onErase }: { userId: string; name: string; leftAt: Date | null; leftBy: string | null; erased: boolean; onErase: () => void }) {
  const reactivate = useAction(reactivatePerson)
  const [error, setError] = useState<string | null>(null)
  const errorDialog = useAttentionWhen(error, { kind: 'alert' })
  return (
    <div className="mb-6 rounded-xl border border-border bg-surface-1 p-4">
      <p className="text-body font-medium text-text-primary">{erased ? 'Their data was erased' : `${name} left the organisation on ${shortDate(leftAt)}${leftBy ? `, removed by ${leftBy}` : ''}`}</p>
      <p className="mt-1 text-small text-text-muted">
        {erased
          ? 'Their name shows as Former member on the shared work that remains.'
          : 'Nothing was deleted. Their name stays on shared work as left; their private conversations and files stay private, unread by anyone.'}
      </p>
      {!erased && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void reactivate({ userId }).catch(e => setError(e instanceof Error ? e.message : String(e)))}>Reactivate</Button>
          <Button size="sm" variant="secondary" onClick={onErase}>Erase their data…</Button>
        </div>
      )}
      {errorDialog}
    </div>
  )
}

function OrgPerson({ userId }: { userId: string }) {
  const query = useQuery(getOrgPerson, { userId })
  const { data: view } = query
  const read = useBackgroundRead(query, { what: 'This person' })
  const [menu, setMenu] = useState(false)
  const [erasing, setErasing] = useState(false)
  const [resetting, setResetting] = useState(false)
  const updateRole = useAction(updateUserRole)
  const [roleError, setRoleError] = useState<string | null>(null)
  const [roleRetry, setRoleRetry] = useState<(() => void) | undefined>(undefined)
  const roleErrorDialog = useAttentionWhen(roleError, { kind: 'alert', title: 'The role was not changed', retry: roleRetry })
  const demo = useDemo()
  const [picker, setPicker] = useState<'avatar' | 'cover' | null>(null)
  const [inspecting, setInspecting] = useState(false)
  const savePictures = useSavePictures({ kind: 'person', id: userId })
  const crumbs = (last: string) => [ADMIN_CRUMB, { label: 'People', href: '/admin/people' }, { label: last }]

  if (!view) {
    return (
      <AppLayout breadcrumbs={crumbs('…')}>
        {read.failedWithoutData ? read.nudge : <div className="px-6 py-16 text-center text-text-muted">Loading…</div>}
      </AppLayout>
    )
  }
  const { person } = view
  const changeRole = async (role: OrgRole) => {
    setRoleError(null)
    setRoleRetry(() => () => void changeRole(role))
    try { await updateRole({ userId: person.userId, role }) } catch (e) { setRoleError(e instanceof Error ? e.message : String(e)) }
  }
  const active = person.state === 'active'
  const editable = person.state !== 'erased'
  const time = localTimeText(view.timezone, new Date())

  const roleSelectable = active && !view.isMe && !!view.orgRole
  const heading = 'text-micro font-medium uppercase tracking-wide text-text-muted'

  return (
    <AppLayout breadcrumbs={crumbs(person.name)}>
      <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8">
        {read.nudge}
        {!active && <LeftNotice userId={person.userId} name={person.name} leftAt={view.leftAt} leftBy={view.leftBy?.name ?? null} erased={person.state === 'erased'} onErase={() => setErasing(true)} />}
        <div className="-mx-4 lg:-mx-8">
          <IdentityHero
            round
            name={person.name}
            subline={[person.handle ? shownHandle(person, demo.on) : 'Erased', view.joinedAt ? `joined ${shortDate(view.joinedAt)}` : null, view.invitedBy ? `invited by ${view.invitedBy.name}` : view.invitedFromHqMachine ? "invited from HQ's machine" : null].filter(Boolean).join(' · ')}
            avatarUrl={person.avatarUrl}
            coverUrl={person.coverUrl ?? null}
            onOpenPicker={editable ? setPicker : undefined}
            onInspectAvatar={person.avatarUrl ? () => setInspecting(true) : undefined}
            actions={active && !view.isMe ? (
              <div className="relative">
                <button type="button" aria-label="More" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)} className={`p-1.5 rounded-lg font-medium ${BUTTON_SECONDARY}`}>
                  <MoreHorizontal size={18} />
                </button>
                {menu && (
                  <div role="menu" className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-border bg-popover py-1 shadow-pop">
                    <button type="button" role="menuitem" onClick={() => { setMenu(false); setResetting(true) }} className={`block w-full px-3 py-2 text-left text-body ${FOCUS_RING_INSET} ${ROW_ITEM}`}>Reset password</button>
                    <Link role="menuitem" to={`/admin/people/${person.userId}/remove`} className={`block px-3 py-2 text-body text-danger ${FOCUS_RING_INSET} transition-colors hover:bg-surface-hover active:bg-surface-pressed`}>Remove from the organisation</Link>
                  </div>
                )}
              </div>
            ) : undefined}
          />
        </div>
        <div className="mt-4 border-b border-border-subtle" />

        <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
          <div className="space-y-8">
            {active && (
              <section aria-label="Organisation role">
                <h2 className={`${heading} mb-2`}>Organisation role</h2>
                <Tooltip label="You cannot change your own role." wrap side="top" disabled={!view.isMe}>
                  <div>
                    <RoleChoices label={`Organisation role of ${person.name}`} value={view.orgRole} disabled={!roleSelectable} onChange={role => void changeRole(role)} />
                  </div>
                </Tooltip>
                {roleErrorDialog}
              </section>
            )}
            {active && (
              <section aria-label="Fleet admin">
                <h2 className={`${heading} mb-2`}>Fleet admin</h2>
                <p className="text-body text-text-primary">{fleetAdminRole(view.fleetAdmin, view.fleetAdminSince).state}</p>
                <p className="mt-1 text-small text-text-muted">{fleetAdminRole(view.fleetAdmin, view.fleetAdminSince).note}</p>
              </section>
            )}
            <section aria-label="Profile">
              <h2 className={`${heading} mb-2`}>Profile</h2>
              <PersonProfileFacts person={person} canEdit={editable} localTime={time} onChangePicture={() => setPicker('avatar')} />
            </section>
          </div>
          <PersonProjects view={view} />
        </div>
      </div>
      <InspectPicture open={inspecting} name={person.name} avatarUrl={person.avatarUrl} onClose={() => setInspecting(false)} onChange={editable ? () => setPicker('avatar') : undefined} />
      <PicturePicker
        open={picker !== null} initialTab={picker ?? 'avatar'} onClose={() => setPicker(null)} save={savePictures}
        subject={{ kind: 'person', name: person.name, role: 'Member' }}
        saved={{ avatarUrl: person.avatarUrl, avatarRecipe: view.avatarRecipe, coverUrl: person.coverUrl ?? null, coverRecipe: view.coverRecipe }}
      />
      <ErasePersonDialog person={person} open={erasing} onClose={() => setErasing(false)} />
      <ResetPasswordDialog person={person} open={resetting} onClose={() => setResetting(false)} />
    </AppLayout>
  )
}

export function OrgPersonPage() {
  const { userId } = useParams<{ userId: string }>()
  return <OrgPeopleGate><OrgPerson userId={userId!} /></OrgPeopleGate>
}
