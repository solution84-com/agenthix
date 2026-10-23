/**
 * Wire-payload converters shared by dispatchService.ts and its callers —
 * split out (plan 5d-2 task 9b) to keep dispatchService.ts under the repo's
 * 500-line rule. Both functions are pure (Prisma row → core protocol type),
 * with no side effects and no imports beyond the two types they convert
 * between — that's what makes them safe to share rather than reimplement:
 * `toSeed` between dispatchService.ts's own dispatch* functions and
 * sessions/actions.ts's createSession (D3's hq-copy-first session write);
 * `toAgentConfigPayload` between runContext.ts's buildContext and
 * agents/queries.ts's getAgentPromptPreview (site's agent.promptPreview
 * handler needs the same agent-config shape a real dispatch sends).
 */
import type { Agent, AgentSession } from '@prisma/client'
import { CLAUDE_SDK_RUNTIME, isApproval, type SessionSeed, type AgentConfigPayload, type JsonValue } from '@agenthix/core'
import { truncateTitle } from '../sessions/siteRuntimeStore'
import { DEFAULT_MODEL } from './models'

export function toSeed(session: AgentSession): SessionSeed {
  return {
    id: session.id,
    sessionKey: session.sessionKey,
    agentId: session.agentId,
    userId: session.userId,
    sessionType: session.sessionType as SessionSeed['sessionType'],
    taskId: session.taskId,
    title: truncateTitle(session.title),
    model: session.model,
    metadata: (session.metadata ?? {}) as Record<string, JsonValue>,
    primaryOwnerType: session.primaryOwnerType,
    primaryOwnerId: session.primaryOwnerId,
    primaryWorkspaceId: session.primaryWorkspaceId,
    runtime: session.runtime,
    createdAt: session.createdAt.toISOString(),
  }
}

/**
 * The agent's config as a site reads it. Its runtime and model are the resolver's to decide, not the agent's: a run
 * overwrites them with the resolved ones (runContext.ts), and these are what an older reader sees without one.
 */
export function toAgentConfigPayload(agent: Agent): AgentConfigPayload {
  return {
    id: agent.id,
    name: agent.name,
    handle: agent.handle,
    role: agent.role,
    runtime: CLAUDE_SDK_RUNTIME,
    approval: isApproval(agent.approval) ? agent.approval : 'deferred',
    defaultModel: DEFAULT_MODEL,
    // Stored JSON columns in one of the forms core declares; the site reads them through its own coercion.
    allowedTools: agent.allowedTools as AgentConfigPayload['allowedTools'],
    allowedBashPatterns: agent.allowedBashPatterns as AgentConfigPayload['allowedBashPatterns'],
    isKernel: agent.isKernel,
  }
}
