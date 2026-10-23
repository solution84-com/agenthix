import type { Agent } from '@prisma/client'
import { CLAUDE_SDK_RUNTIME, isApproval, type AgentListItem } from '@agenthix/core'
import { DEFAULT_MODEL } from './models'

/** One agent as `getAgents` lists it. An approval its row does not name counts as the default, as a run's does. */
export function agentListItem(agent: Agent): AgentListItem {
  return {
    id: agent.id,
    name: agent.name,
    handle: agent.handle,
    role: agent.role,
    avatarUrl: agent.avatarUrl,
    // Deprecated fields, kept so an older app still reads: the resolver decides a model and a runtime, not the agent.
    defaultModel: DEFAULT_MODEL,
    runtime: CLAUDE_SDK_RUNTIME,
    isKernel: agent.isKernel,
    approval: isApproval(agent.approval) ? agent.approval : 'deferred',
    // Deprecated fields, kept so an older app still reads: every agent has a voice, chosen per agent through the resolver.
    voiceEnabled: true,
    voiceId: null,
    voiceTtsModel: null,
  }
}
