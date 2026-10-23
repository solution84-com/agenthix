import { useQuery, getAgent } from 'wasp/client/operations'
import { useAgentModelLine } from '../../useAgentModelLine'
import { AgentPermissionsHere } from '../AgentPermissionsHere'

type AgentRow = { name: string }

/**
 * Your settings (spec §3): the models the agent uses, as the organisation set them, and your permissions in Chat — the
 * same view as the organisation's, offering only what narrows it. A person's own list of models is in their Settings.
 */
export function AgentSettingsTool({ agentId, userId }: { agentId: string; userId: string }) {
  const { data } = useQuery(getAgent, { id: agentId })
  const agent = data as AgentRow | undefined
  const modelLine = useAgentModelLine()(agentId)
  return (
    <div className="space-y-6 p-4">
      <section aria-label="Models">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 text-body">
          <dt className="text-text-muted">Its models</dt><dd className="text-text-primary">{modelLine}</dd>
        </dl>
        <p className="mt-1 text-small text-text-muted">Set by the organisation&apos;s admins. Narrow what may run for you under Settings.</p>
      </section>
      {agent && <AgentPermissionsHere agentId={agentId} agentName={agent.name} boundaryType="user" boundaryId={userId} title="Your permissions in Chat" />}
    </div>
  )
}
