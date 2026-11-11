import { useQuery, getAgentSkillSet } from 'wasp/client/operations'
import { retryUnlessDenied } from '../../../projects/place/retryUnlessDenied'
import { AgentSkillsBody } from './AgentSkillsBody'
import { useBackgroundRead } from '@agenthix/ui/attention'

/**
 * What the agent can do, on its own page (spec part 6, board A1): the same rows as the manage page. An administrator
 * can add and remove here; a member reads, and only the projects they are in are named.
 */
export function AgentSkillsTool({ agentId }: { agentId: string }) {
  const query = useQuery(getAgentSkillSet, { agentId }, { retry: retryUnlessDenied })
  const { data, refetch } = query
  const read = useBackgroundRead(query, { what: "The agent's skills" })
  if (!data) return read.failedWithoutData ? read.nudge : <p className="p-4 text-small text-text-muted">Loading…</p>
  return <div className="p-4">{read.nudge}<AgentSkillsBody agentId={agentId} data={data} refetch={refetch} /></div>
}
