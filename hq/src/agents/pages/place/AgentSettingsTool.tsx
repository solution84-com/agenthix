import { useQuery, getAgent } from 'wasp/client/operations'
import { modelsForRuntime } from '../../models'
import { AgentOverridePanel } from '../AgentOverridePanel'
import { AgentPermissionsHere } from '../AgentPermissionsHere'

type AgentRow = { name: string; defaultModel: string; runtime: string }

/**
 * Your settings (spec §3): your model for the agent, beside the organisation's, and your permissions in Chat — the
 * same view as the organisation's, offering only what narrows it. Both are for your own runs in your Chat.
 */
export function AgentSettingsTool({ agentId, userId }: { agentId: string; userId: string }) {
  const { data } = useQuery(getAgent, { id: agentId })
  const agent = data as AgentRow | undefined
  const model = agent ? modelsForRuntime(agent.runtime).find(m => m.value === agent.defaultModel)?.label ?? agent.defaultModel : ''
  return (
    <div className="space-y-6 p-4">
      <section aria-label="Your model">
        {agent && (
          <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-4 text-body">
            <dt className="text-text-muted">The organisation&apos;s model</dt><dd className="text-text-primary">{model}</dd>
          </dl>
        )}
        <AgentOverridePanel
          boundaryType="user"
          boundaryId={userId}
          agentId={agentId}
          title="Your model"
          description="Your own runs with it, in your Chat. Can only narrow the organisation's."
        />
      </section>
      {agent && <AgentPermissionsHere agentId={agentId} agentName={agent.name} boundaryType="user" boundaryId={userId} title="Your permissions in Chat" />}
    </div>
  )
}
