import { useQuery, useAction, getAgent, getAgentOverride, setAgentOverride } from 'wasp/client/operations'
import { AgentOverrideForm, type AgentOverrideValue } from '@agenthix/ui/agents'
import { modelOverrideChoices } from '../overrides/modelOverrideChoices'

const NONE: AgentOverrideValue = { model: null, approval: null, allowedTools: null, allowedBashPatterns: null }

export function AgentOverridePanel(props: {
  boundaryType: 'project' | 'user'
  boundaryId: string
  agentId: string
  title: string
  description: string
}) {
  const { boundaryType, boundaryId, agentId } = props
  const { data, isLoading, error } = useQuery(getAgentOverride, { boundaryType, boundaryId, agentId })
  const { data: agent } = useQuery(getAgent, { id: agentId })
  const save = useAction(setAgentOverride)

  if (isLoading) return <p className="text-small text-text-muted">Loading overrides…</p>
  if (error) return <p className="text-small text-danger">{error.message}</p>
  return (
    <AgentOverrideForm
      title={props.title}
      description={props.description}
      value={(data as AgentOverrideValue | null) ?? NONE}
      modelOptions={agent ? modelOverrideChoices(agent as { defaultModel: string; runtime: string }) : undefined}
      onSave={next => save({ boundaryType, boundaryId, agentId, ...next })}
    />
  )
}
