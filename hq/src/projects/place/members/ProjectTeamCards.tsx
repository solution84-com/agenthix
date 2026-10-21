import { useAction, setProjectTeamRole } from 'wasp/client/operations'
import { NativeSelect } from '@agenthix/ui/primitives'
import type { ProjectTeams } from '../../../org/teams/teamQueries'
import { MoreMenu } from '../../../org/components/menus'
import { ROLE_LABEL, teamMix, type TeamRole } from '../../../org/components/teams/teamWords'
import { AuthedImg } from '../../../shared/components/AuthedImg'
import { reasonOf } from '../people/peopleErrors'

type TeamRow = ProjectTeams['teams'][number]
const day = (at: Date | string) => new Date(at).toLocaleDateString(undefined, { weekday: 'short' })

/** A project's teams as cards (every screen reviewed spec §3): the team's role here, and ⋯ Remove team. */
export function ProjectTeamCards({ projectId, teams, canManage, onRemove, onChanged, onError }: {
  projectId: string
  teams: TeamRow[]
  canManage: boolean
  onRemove: (teamId: string) => void
  onChanged: () => void
  onError: (message: string) => void
}) {
  const setRole = useAction(setProjectTeamRole)
  const change = async (teamId: string, role: TeamRole) => {
    try { await setRole({ projectId, teamId, role }); onChanged() } catch (err) { onError(reasonOf(err, "Could not change the team's role")) }
  }
  return (
    <div className="grid grid-cols-1 gap-2 px-4 sm:grid-cols-2">
      {teams.map(t => (
        <div key={t.id} className="flex flex-col gap-1 rounded-xl border border-border-subtle bg-surface-1 px-3 py-2.5" data-testid="project-team-card">
          <div className="flex items-center gap-2">
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-small font-semibold text-accent">
              {t.name.trim().charAt(0).toUpperCase()}
              <AuthedImg src={t.avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            </span>
            <b className="min-w-0 flex-1 truncate text-body text-text-primary">{t.name}</b>
            {canManage ? (
              <>
                <NativeSelect size="sm" className="w-24" value={t.role} aria-label={`${t.name}'s role here`} onChange={e => void change(t.id, e.target.value as TeamRole)}>
                  {(Object.keys(ROLE_LABEL) as TeamRole[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </NativeSelect>
                <MoreMenu label={`More about ${t.name}`} items={[{ label: 'Remove team', danger: true, onSelect: () => onRemove(t.id) }]} />
              </>
            ) : (
              <span className="text-small text-text-muted">{ROLE_LABEL[t.role]}</span>
            )}
          </div>
          <span className="truncate text-small text-text-muted">
            {teamMix(t.userIds.length, t.agentIds.length)}{t.addedBy ? ` · added by ${t.addedBy.name}, ${day(t.addedAt)}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}
