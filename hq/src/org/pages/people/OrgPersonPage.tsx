import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { MoreHorizontal } from 'lucide-react'
import { useQuery, useAction, getOrgPerson, reactivatePerson, updateUserRole } from 'wasp/client/operations'
import { Button } from '@agenthix/ui/primitives'
import { AppLayout } from '../../../shared/layouts/AppLayout'
import { OrgPeopleGate } from './OrgPeopleGate'
import { PersonFace } from './PersonFace'
import { PersonProfileFacts } from './PersonProfileFacts'
import { RoleChoices } from './RoleChoices'
import { PersonProjects } from './PersonProjects'
import { ErasePersonDialog } from './ErasePersonDialog'
import { ResetPasswordDialog } from './ResetPasswordDialog'
import { fleetAdminRole, localTimeText, shortDate, type OrgRole } from './peopleFormat'

function LeftNotice({ userId, name, leftAt, leftBy, erased, onErase }: { userId: string; name: string; leftAt: Date | null; leftBy: string | null; erased: boolean; onErase: () => void }) {
  const reactivate = useAction(reactivatePerson)
  const [error, setError] = useState<string | null>(null)
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
      {error && <p role="alert" className="mt-2 text-small text-danger">{error}</p>}
    </div>
  )
}

function OrgPerson({ userId }: { userId: string }) {
  const { data: view, error } = useQuery(getOrgPerson, { userId })
  const [menu, setMenu] = useState(false)
  const [erasing, setErasing] = useState(false)
  const [resetting, setResetting] = useState(false)
  const updateRole = useAction(updateUserRole)
  const [roleError, setRoleError] = useState<string | null>(null)
  const crumbs = (last: string) => [{ label: 'Organisation', href: '/org' }, { label: 'People', href: '/org/people' }, { label: last }]

  if (!view) {
    return (
      <AppLayout breadcrumbs={crumbs('…')}>
        <div className="px-6 py-16 text-center text-text-muted">{error ? error.message : 'Loading…'}</div>
      </AppLayout>
    )
  }
  const { person } = view
  const changeRole = async (role: OrgRole) => {
    setRoleError(null)
    try { await updateRole({ userId: person.userId, role }) } catch (e) { setRoleError(e instanceof Error ? e.message : String(e)) }
  }
  const active = person.state === 'active'
  const time = localTimeText(view.timezone, new Date())

  const roleSelectable = active && !view.isMe && !!view.orgRole
  const heading = 'text-micro font-medium uppercase tracking-wide text-text-muted'

  return (
    <AppLayout breadcrumbs={crumbs(person.name)}>
      <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8">
        {!active && <LeftNotice userId={person.userId} name={person.name} leftAt={view.leftAt} leftBy={view.leftBy?.name ?? null} erased={person.state === 'erased'} onErase={() => setErasing(true)} />}
        <header className="flex items-center gap-4 border-b border-border-subtle pb-4">
          <PersonFace person={person} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-h1 font-semibold text-text-primary">{person.name}</h1>
            <p className="truncate text-small text-text-secondary">
              {[person.handle ? `@${person.handle}` : 'Erased', view.joinedAt ? `joined ${shortDate(view.joinedAt)}` : null, view.invitedBy ? `invited by ${view.invitedBy.name}` : view.invitedFromHqMachine ? "invited from HQ's machine" : null].filter(Boolean).join(' · ')}
            </p>
          </div>
          {active && !view.isMe && (
            <div className="relative">
              <button type="button" aria-label="More" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)} className="rounded-lg border border-border p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary">
                <MoreHorizontal size={18} />
              </button>
              {menu && (
                <div role="menu" className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-border bg-surface-1 py-1 shadow-lg">
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); setResetting(true) }} className="block w-full px-3 py-2 text-left text-body text-text-primary hover:bg-surface-hover">Reset password</button>
                  <Link role="menuitem" to={`/org/people/${person.userId}/remove`} className="block px-3 py-2 text-body text-danger hover:bg-surface-hover">Remove from the organisation</Link>
                </div>
              )}
            </div>
          )}
        </header>

        <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
          <div className="space-y-8">
            {active && (
              <section aria-label="Organisation role">
                <h2 className={`${heading} mb-2`}>Organisation role</h2>
                <RoleChoices label={`Organisation role of ${person.name}`} value={view.orgRole} disabled={!roleSelectable} onChange={role => void changeRole(role)} />
                {view.isMe && <p className="mt-1 text-small text-text-muted">You cannot change your own role.</p>}
                {roleError && <p role="alert" className="mt-1 text-small text-danger">{roleError}</p>}
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
              <PersonProfileFacts person={person} canEdit={person.state !== 'erased'} localTime={time} />
            </section>
          </div>
          <PersonProjects view={view} />
        </div>
      </div>
      <ErasePersonDialog person={person} open={erasing} onClose={() => setErasing(false)} />
      <ResetPasswordDialog person={person} open={resetting} onClose={() => setResetting(false)} />
    </AppLayout>
  )
}

export function OrgPersonPage() {
  const { userId } = useParams<{ userId: string }>()
  return <OrgPeopleGate><OrgPerson userId={userId!} /></OrgPeopleGate>
}
