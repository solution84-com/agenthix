import { Link } from 'react-router'
import { useQuery, getProjectCards } from 'wasp/client/operations'
import type { TeamDetail } from '../../teams/teamQueries'
import { projectCardNow } from '../../../projects/pages/projectCardNow'
import { OrgGroupHeading } from '../orgCardParts'
import { ROLE_LABEL } from './teamWords'
import { CARD_CLICKABLE } from '@agenthix/ui/primitives'

const NOW_TEXT = { needsYou: 'Needs you', running: 'Running', idle: 'Idle', quiet: 'Quiet' } as const

/** Works in (every screen reviewed spec §3): a card per project with the team's role there and what is happening now. */
export function TeamWorksIn({ team }: { team: TeamDetail }) {
  const { data: cards } = useQuery(getProjectCards)
  const lineOf = new Map((cards?.cards ?? []).map(c => [c.projectId, c]))
  const at = new Date()
  return (
    <>
      <OrgGroupHeading title={`Works in · ${team.projectCount} ${team.projectCount === 1 ? 'project' : 'projects'}`} />
      {team.projectCount === 0 && <p className="text-small text-text-muted">Not in a project yet. Add to a project adds every member at once; who is in the team is changed in the team.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {team.projects.map(p => {
          const now = projectCardNow(lineOf.get(p.id), at)
          return (
            <Link key={p.id} to={`/projects/${p.key}`} className={`flex flex-col gap-1 rounded-2xl border bg-surface-1 p-4 ${CARD_CLICKABLE}`}>
              <div className="flex items-baseline justify-between gap-2">
                <b className="truncate text-body text-text-primary">{p.name}</b>
                <span className="shrink-0 text-small text-text-muted">{ROLE_LABEL[p.role]}</span>
              </div>
              <span className={`text-small ${now.state === 'needsYou' ? 'font-medium text-warning' : 'text-text-muted'}`}>
                {NOW_TEXT[now.state]}{now.detail ? ` · ${now.detail}` : ''}
              </span>
            </Link>
          )
        })}
      </div>
      {team.privateProjects > 0 && (
        <p className="mt-2 text-small text-text-muted">And {team.privateProjects} private {team.privateProjects === 1 ? 'project' : 'projects'} you are not in.</p>
      )}
    </>
  )
}
