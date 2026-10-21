import type { RenderAgentAvatar } from '@agenthix/ui/agents'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'

export const avatarOf: RenderAgentAvatar = (agent, size) => (
  <AuthedAgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size={size} />
)
