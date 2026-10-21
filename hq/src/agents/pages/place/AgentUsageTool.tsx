import { useQuery, getAgentUsage } from 'wasp/client/operations'
import { UnansweredSitesNotice } from '@agenthix/ui/primitives'
import { unansweredSitesCopy } from '../../../shared/siteSilence'
import { UsageRows } from './UsageRows'

export function AgentUsageTool({ agentId, since }: { agentId: string; since: string }) {
  const { data, isLoading, error } = useQuery(getAgentUsage, { agentId, since })
  return (
    <div className="p-4">
      {isLoading && <p className="text-small text-text-muted">Loading…</p>}
      {error && <p role="alert" className="text-small text-danger">{error.message}</p>}
      {data && (
        <>
          <UnansweredSitesNotice copy={unansweredSitesCopy(data.unanswered, 'these totals')} className="mb-3" />
          <UsageRows yours={data.yours} organisation={data.organisation} />
        </>
      )}
    </div>
  )
}
