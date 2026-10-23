import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { rootCrumbFor } from '../../admin/adminCrumbs'
import { teamsBase } from '../../admin/adminPaths'
import { Plus } from 'lucide-react'
import { useQuery, getTeams, getUserSettings } from 'wasp/client/operations'
import { Button } from '@agenthix/ui/primitives'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { TeamCard } from '../components/teams/TeamCard'
import { TeamDialog } from '../components/teams/TeamDialog'

/** Teams (every screen reviewed spec §3, Organisation): a card for each, with its cover and picture, purpose, faces, mix and where it works. */
export function TeamsPage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { data: teams, isLoading } = useQuery(getTeams)
  const { data: me } = useQuery(getUserSettings)
  const [creating, setCreating] = useState(false)
  const isAdmin = me?.role === 'ADMIN'

  return (
    <AppLayout
      breadcrumbs={[rootCrumbFor(pathname), { label: 'Teams' }]}
      title="Teams"
      subtitle="Groups of people and agents with a purpose. A team can join a project as one member"
      action={isAdmin ? <Button leadingIcon={<Plus size={14} />} onClick={() => setCreating(true)}>New</Button> : undefined}
    >
      <div className="px-4 py-6 lg:px-8">
        {isLoading && <p className="text-body text-text-muted">Loading…</p>}
        {teams && teams.length === 0 && (
          <p className="rounded-2xl border border-border-subtle bg-surface-1 p-10 text-center text-body text-text-muted">
            No teams yet.{isAdmin ? ' Make one, or add a ready-made team from the Library.' : ''}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(teams ?? []).map(team => <TeamCard key={team.id} team={team} />)}
        </div>
        <p className="mt-5 text-small text-text-muted">From the Library, a ready-made team adds its agents (and their boards) as a new team; people are added after.</p>
      </div>
      <TeamDialog open={creating} onClose={() => setCreating(false)} onSaved={id => navigate(`${teamsBase(pathname)}/${id}`)} />
    </AppLayout>
  )
}
