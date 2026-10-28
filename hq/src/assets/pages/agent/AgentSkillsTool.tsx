import { Link } from 'react-router'
import { useQuery, getAgentSkillSet } from 'wasp/client/operations'
import { refusalText } from '../../../shared/refusal'
import { PlaceLine } from './PlaceLine'
import { costLine, costWarning, listingCost } from './skillCost'
import { retryUnlessDenied } from '../../../projects/place/retryUnlessDenied'

const HEADING = 'text-micro font-medium uppercase tracking-wide text-text-muted'
const NAMES = 'mt-1 break-words text-small text-text-primary'

/**
 * What the agent can do, as a member sees it (spec part 6, board A1): read only. Everywhere (what the organisation
 * gives it), in the projects the member is in (each project switches its own), and the member's own skills in their
 * conversations. Places the member isn't in are not named.
 */
export function AgentSkillsTool({ agentId }: { agentId: string }) {
  const { data, error } = useQuery(getAgentSkillSet, { agentId }, { retry: retryUnlessDenied })
  if (error) return <p role="alert" className="p-4 text-small text-danger">{refusalText(error)}</p>
  if (!data) return <p className="p-4 text-small text-text-muted">Loading…</p>
  const name = data.agent.name
  const given = [...data.everyAgent, ...data.thisAgent]
  const builtIn = data.builtIn.filter(b => b.on)
  const cost = listingCost(data.listed)
  const warning = costWarning(name, cost, false)
  return (
    <div className="p-4">
      <p className="text-small text-text-secondary">What {name} can do. Read only. An administrator gives {name} skills; each project switches its own.</p>
      <p className="mt-1 text-micro text-text-muted" data-testid="agent-skills-cost">{costLine(cost)}</p>
      {warning && <p role="status" className="mt-2 rounded-lg border border-warning/50 bg-warning/5 px-3 py-2 text-small text-text-primary">{warning}</p>}

      <h3 className={`${HEADING} mt-4`}>Everywhere</h3>
      <p className={NAMES}>{given.length ? given.map(s => s.title).join(' · ') : <span className="text-text-muted">None given.</span>}</p>
      <p className="text-micro text-text-muted">
        {name} has {given.length}{builtIn.length > 0 && <> and {builtIn.length} built in: {builtIn.map(b => b.title).join(', ')}</>}
      </p>

      <h3 className={`${HEADING} mt-4`}>In your projects</h3>
      {data.places.length === 0 ? <p className="mt-1 text-small text-text-muted">None of your projects.</p> : (
        <ul className="divide-y divide-border-subtle">{data.places.map(p => <PlaceLine key={p.projectId} place={p} />)}</ul>
      )}

      <h3 className={`${HEADING} mt-4`}>Yours, in your conversations</h3>
      {data.yours.length === 0 ? <p className="mt-1 text-small text-text-muted">None switched on.</p> : <p className={NAMES}>{data.yours.map(s => s.name).join(' · ')}</p>}
      <p className="mt-1 text-small"><Link to="/space" className="font-medium text-accent hover:text-accent-hover">Manage in Your space</Link></p>
    </div>
  )
}
