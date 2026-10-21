import type { TurnCapability } from '../../../conversations/contract'
import type { CallerContext } from '../types'

/** A turn answering u1's message in their own space, its agent allowed every tool it is asked about. */
export function turnCapability(overrides: Partial<TurnCapability> = {}): TurnCapability {
  return {
    conversationId: 'conv-1',
    turnId: 'turn-1',
    agentId: 'agent-1',
    home: 'PERSON',
    projectId: null,
    taskId: null,
    actingUserId: 'u1',
    role: 'MEMBER',
    permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
    expiresAt: Date.now() + 60_000,
    ...overrides,
  }
}

export function turnCaller(overrides: Partial<TurnCapability> = {}): CallerContext {
  return { kind: 'turn', turn: turnCapability(overrides) }
}

/** A turn in project p1's conversation. */
export function projectTurn(overrides: Partial<TurnCapability> = {}): CallerContext {
  return turnCaller({ home: 'PROJECT', projectId: 'p1', ...overrides })
}
