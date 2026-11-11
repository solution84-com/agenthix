import { useEffect, useState } from 'react'
import { ADMIN_CRUMB } from '../../../admin/adminCrumbs'
import { Plus } from 'lucide-react'
import { useQuery, getOrgPeople } from 'wasp/client/operations'
import { Button, SearchField } from '@agenthix/ui/primitives'
import { AppLayout } from '../../../shared/layouts/AppLayout'
import { OrgPeopleGate } from './OrgPeopleGate'
import { InviteDialog, type CreatedInvite } from './InviteDialog'
import { WaitingInvitations, EarlierInvitations } from './InvitationsSection'
import { PeopleList } from './PeopleList'
import { personMatches } from './peopleFormat'
import { useAttentionWhen } from '@agenthix/ui/attention'

function OrgPeople() {
  const { data, isLoading, error, refetch } = useQuery(getOrgPeople)
  const errorDialog = useAttentionWhen(error?.message, { kind: 'alert', title: 'People could not be read', retry: () => void refetch() })
  const [query, setQuery] = useState('')
  const [inviting, setInviting] = useState(() => new URLSearchParams(window.location.search).get('invite') === '1')
  const [links, setLinks] = useState<Record<string, string>>({})
  // Needs attention's invitations notice opens the page at the invitations (`?show=invitations`).
  const showInvitations = new URLSearchParams(window.location.search).get('show') === 'invitations'
  useEffect(() => {
    if (showInvitations && data) document.getElementById('invitations')?.scrollIntoView({ block: 'start' })
  }, [showInvitations, !!data])
  const matching = (data?.people ?? []).filter(r => personMatches(r.person, query))

  return (
    <AppLayout
      breadcrumbs={[ADMIN_CRUMB, { label: 'People' }]}
      title="People"
      subtitle="Everyone in the organisation: admins invite them and set their roles"
      action={<Button leadingIcon={<Plus size={14} />} onClick={() => setInviting(true)}>Invite</Button>}
    >
      <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8">
        {isLoading && <p className="text-text-muted">Loading…</p>}
        {errorDialog}
        {data && (
          <>
            <div id="invitations">
              {data.invitations.waiting.length > 0 && <WaitingInvitations invitations={data.invitations.waiting} links={links} />}
              {showInvitations && data.invitations.waiting.length === 0 && <p className="mb-3 text-small text-text-muted">No invitations are waiting.</p>}
            </div>
            <div className="mb-3">
              <SearchField label="Search people" placeholder="Search by name or @handle" value={query} onChange={setQuery} className="block w-full" />
            </div>
            <PeopleList rows={matching.filter(r => r.person.state === 'active')} />
            <PeopleList title="Left" rows={matching.filter(r => r.person.state !== 'active')} />
            {matching.length === 0 && <p className="py-6 text-center text-text-muted">No one matches.</p>}
            {data.invitations.earlier.length > 0 && <EarlierInvitations invitations={data.invitations.earlier} />}
          </>
        )}
      </div>
      <InviteDialog open={inviting} onClose={() => setInviting(false)} onCreated={(i: CreatedInvite) => setLinks(l => ({ ...l, [i.id]: i.link }))} />
    </AppLayout>
  )
}

export function OrgPeoplePage() {
  return <OrgPeopleGate><OrgPeople /></OrgPeopleGate>
}
