import { useQuery, getAgentSkillSet } from 'wasp/client/operations'
import { retryUnlessDenied } from '../../../projects/place/retryUnlessDenied'
import { AgentSkillsBody } from './AgentSkillsBody'
import { ReadFailure } from '@agenthix/ui/attention'

/**
 * What the agent can do, on its own page (spec part 6, board A1): the same rows as the manage page. An administrator
 * can add and remove here; a member reads, and only the projects they are in are named.
 */
export function AgentSkillsTool({ agentId }: { agentId: string }) {
  const { data, error, refetch } = useQuery(getAgentSkillSet, { agentId }, { retry: retryUnlessDenied })
  if (error) return <ReadFailure what="The agent's skills" error={error} retry={() => void refetch()} />
  if (!data) return <p className="p-4 text-small text-text-muted">Loading…</p>
  return <div className="p-4"><AgentSkillsBody agentId={agentId} data={data} refetch={refetch} /></div>
}
