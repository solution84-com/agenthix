import type { Agent } from '@prisma/client'
import { isApproval, type AgentListItem } from '@agenthix/core'

/** One agent as `getAgents` lists it. An approval its row does not name counts as the default, as a run's does. */
export function agentListItem(agent: Agent): AgentListItem {
  return {
    id: agent.id,
    name: agent.name,
    handle: agent.handle,
    role: agent.role,
    avatarUrl: agent.avatarUrl,
    isKernel: agent.isKernel,
    approval: isApproval(agent.approval) ? agent.approval : 'deferred',
  }
}
