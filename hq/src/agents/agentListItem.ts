import type { Agent } from '@prisma/client'
import { CLAUDE_SDK_RUNTIME, isAgentRuntime, isApproval, type AgentListItem } from '@agenthix/core'

/** One agent as `getAgents` lists it. A runtime or approval its row does not name counts as the default, as a run's does. */
export function agentListItem(agent: Agent): AgentListItem {
  return {
    id: agent.id,
    name: agent.name,
    handle: agent.handle,
    role: agent.role,
    avatarUrl: agent.avatarUrl,
    defaultModel: agent.defaultModel,
    runtime: isAgentRuntime(agent.runtime) ? agent.runtime : CLAUDE_SDK_RUNTIME,
    isKernel: agent.isKernel,
    approval: isApproval(agent.approval) ? agent.approval : 'deferred',
    voiceEnabled: agent.voiceEnabled,
    voiceId: agent.voiceId,
    voiceTtsModel: agent.voiceTtsModel,
  }
}
