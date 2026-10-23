import { Link, useLocation } from 'react-router'
import { teamsBase } from '../../../admin/adminPaths'
import type { TeamSummary } from '../../teams/teamQueries'
import { AuthedImg } from '../../../shared/components/AuthedImg'
import { AuthedPersonAvatar } from '../../../people/AuthedPersonAvatar'
import { AuthedAgentAvatar } from '../../../shared/components/AuthedAgentAvatar'
import { AgentCover } from '../../../agents/pages/AgentCover'
import { FaceStack } from '../orgCardParts'
import { teamMix, worksIn } from './teamWords'

const FACES = 5

/** A team on the Teams screen (every screen reviewed spec §3): its cover and picture, purpose, faces, mix and where it works. */
export function TeamCard({ team }: { team: TeamSummary }) {
  const { pathname } = useLocation()
  const total = team.people.length + team.agents.length
  const shownPeople = team.people.slice(0, FACES)
  const shownAgents = team.agents.slice(0, FACES - shownPeople.length)
  return (
    <Link
      to={`${teamsBase(pathname)}/${team.id}`}
      className="flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-1 transition-colors hover:border-accent"
    >
      <div className="relative h-16 overflow-hidden"><AgentCover coverUrl={team.coverUrl} /></div>
      <div className="relative -mt-6 flex flex-col gap-2 px-4 pb-4">
        <span className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-surface-2 text-h3 font-semibold text-accent ring-4 ring-surface-1">
          {team.name.trim().charAt(0).toUpperCase() || '?'}
          <AuthedImg src={team.avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        </span>
        <div>
          <b className="block truncate text-body text-text-primary">{team.name}</b>
          {team.purpose && <span className="line-clamp-2 text-small text-text-secondary">{team.purpose}</span>}
        </div>
        <FaceStack more={total - shownPeople.length - shownAgents.length}>
          {shownPeople.map(p => <AuthedPersonAvatar key={p.userId} person={p} size="sm" />)}
          {shownAgents.map(a => <AuthedAgentAvatar key={a.id} name={a.name} avatarUrl={a.avatarUrl} size="sm" />)}
        </FaceStack>
        <div className="flex items-baseline justify-between gap-2 text-small text-text-muted">
          <span>{teamMix(team.people.length, team.agents.length)}</span>
          <span>{worksIn(team.projectCount)}</span>
        </div>
      </div>
    </Link>
  )
}
