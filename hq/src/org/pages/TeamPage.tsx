import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { rootCrumbFor } from '../../admin/adminCrumbs'
import { teamsBase } from '../../admin/adminPaths'
import { useQuery, useAction, getTeam, getUserSettings, deleteTeam, uploadTeamImage, removeTeamImage } from 'wasp/client/operations'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { IdentityHero } from '../components/IdentityHero'
import { MoreMenu } from '../components/menus'
import { AddToProjectDialog } from '../components/teams/AddToProjectDialog'
import { TeamDialog } from '../components/teams/TeamDialog'
import { TeamMembers } from '../components/teams/TeamMembers'
import { TeamWorksIn } from '../components/teams/TeamWorksIn'
import { BUTTON_SECONDARY } from '@agenthix/ui/primitives'
import { useAttentionWhen } from '@agenthix/ui/attention'

const BUTTON = `px-3 py-1.5 text-body rounded-lg font-medium ${BUTTON_SECONDARY}`

/** A team's own page (every screen reviewed spec §3): its hero, Add to a project, its people and agents, and the projects it works in. */
export function TeamPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const base = teamsBase(pathname)
  const { data: team, error, refetch } = useQuery(getTeam, { id: id! })
  const { data: me } = useQuery(getUserSettings)
  const upload = useAction(uploadTeamImage)
  const removeImage = useAction(removeTeamImage)
  const remove = useAction(deleteTeam)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [problem, setProblem] = useState('')
  const problemDialog = useAttentionWhen(problem, { kind: 'alert' })
  const isAdmin = me?.role === 'ADMIN'

  const crumbs = [rootCrumbFor(pathname), { label: 'Teams', href: base }, { label: team?.name ?? '…' }]
  if (!team) {
    return (
      <AppLayout breadcrumbs={crumbs}>
        <div className="px-6 py-16 text-center text-text-muted">{error ? error.message : 'Loading…'}</div>
      </AppLayout>
    )
  }

  const askDelete = async () => {
    if (!confirm(`Delete the team ${team.name}? This cannot be undone.`)) return
    setProblem('')
    try { await remove({ id: team.id }); navigate(base) } catch (err) { setProblem(err instanceof Error ? err.message : 'Could not delete the team') }
  }

  return (
    <AppLayout breadcrumbs={crumbs}>
      <IdentityHero
        name={team.name}
        subline={team.purpose || 'A team'}
        avatarUrl={team.avatarUrl}
        coverUrl={team.coverUrl}
        onUploadImage={isAdmin ? async (type, dataUrl) => { await upload({ teamId: team.id, type, dataUrl }); await refetch() } : undefined}
        onRemoveImage={isAdmin ? async type => { await removeImage({ teamId: team.id, type }); await refetch() } : undefined}
        actions={isAdmin ? (
          <>
            <button type="button" className={BUTTON} onClick={() => setAdding(true)}>Add to a project</button>
            <MoreMenu items={[
              { label: 'Edit name and purpose', onSelect: () => setEditing(true) },
              { label: 'Delete team', danger: true, separatorBefore: true, onSelect: () => void askDelete() },
            ]} />
          </>
        ) : undefined}
      />
      {problemDialog}
      <div className="max-w-4xl px-4 pb-12 pt-6 lg:px-10">
        <TeamMembers team={team} isAdmin={isAdmin} onChanged={() => void refetch()} />
        <TeamWorksIn team={team} />
      </div>
      <TeamDialog open={editing} team={team} onClose={() => setEditing(false)} onSaved={() => void refetch()} />
      <AddToProjectDialog open={adding} team={team} onClose={() => setAdding(false)} onAdded={() => void refetch()} />
    </AppLayout>
  )
}
