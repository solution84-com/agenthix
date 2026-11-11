import { useQuery, getAgentSkillSet } from 'wasp/client/operations'
import { retryUnlessDenied } from '../../../projects/place/retryUnlessDenied'
import { AgentSkillsBody } from './AgentSkillsBody'
import { ReadFailure } from '@agenthix/ui/attention'

const HEADING = 'text-micro font-medium uppercase tracking-wide text-text-muted'

/** The agent's Skills on its manage page (administrators): the page's rows, with Add and Remove. */
export function AgentSkillsSection({ agentId }: { agentId: string }) {
  const { data, error, refetch } = useQuery(getAgentSkillSet, { agentId }, { retry: retryUnlessDenied })
  return (
    <section aria-label="Skills" className="border-t border-border-subtle py-4">
      <h3 className={`${HEADING} mb-2`}>Skills</h3>
      {error ? <ReadFailure what="The agent's skills" retry={() => void refetch()} />
        : !data ? <p className="text-small text-text-muted">Loading…</p>
        : <AgentSkillsBody agentId={agentId} data={data} refetch={refetch} />}
    </section>
  )
}
