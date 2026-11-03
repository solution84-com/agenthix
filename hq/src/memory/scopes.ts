/**
 * Where memory lives and who reaches it (memory and knowledge spec, Knowledge delivery's table): a person's own
 * scopes only for that person, agent × place only in that place, and a principal with no person — a run nobody
 * commissioned — agent × place only. Reading and writing reach the same scopes.
 */
import type { MemoryScopeValue } from '../shared/memory/protocol'
import type { MemoryPrincipal, Place } from './contract'

export const MEMORY_SCOPES: readonly MemoryScopeValue[] = ['PERSON', 'AGENT_PERSON', 'AGENT_PLACE']

/** One scope as a principal reaches it: its key, and the owner columns its rows carry. */
export interface ScopeTarget {
  scope: MemoryScopeValue
  scopeKey: string
  userId: string | null
  agentId: string | null
  placeType: 'user' | 'project' | null
  placeId: string | null
}

/** The scope as this principal reaches it, or null when it may not. */
export function scopeTarget(principal: MemoryPrincipal, scope: MemoryScopeValue): ScopeTarget | null {
  const { personId, agentId, place } = principal
  switch (scope) {
    case 'PERSON':
      return personId
        ? { scope, scopeKey: `person:${personId}`, userId: personId, agentId: null, placeType: null, placeId: null }
        : null
    case 'AGENT_PERSON':
      return personId && agentId
        ? { scope, scopeKey: `agent-person:${agentId}:${personId}`, userId: personId, agentId, placeType: null, placeId: null }
        : null
    case 'AGENT_PLACE':
      return place && agentId
        ? { scope, scopeKey: `agent-place:${agentId}:${place.type}:${place.id}`, userId: null, agentId, placeType: place.type, placeId: place.id }
        : null
  }
}

/** Every scope this principal reaches, narrowed to `only` when given. */
export function reachableTargets(principal: MemoryPrincipal, only?: readonly MemoryScopeValue[]): ScopeTarget[] {
  return MEMORY_SCOPES
    .filter(scope => !only || only.includes(scope))
    .map(scope => scopeTarget(principal, scope))
    .filter((target): target is ScopeTarget => target !== null)
}

/**
 * The person a conversation's turn reads and writes memory for, given its home: a task's thread is read by every
 * member of its project, so a person's own scopes are used there only when the task is in that person's own space,
 * which nobody else reads — as a run in a project's shared home is for no person. Every other home is its opener's.
 */
export function personOfTurnHome(home: 'PERSON' | 'PROJECT' | 'TASK', place: Place | null, personId: string | null): string | null {
  if (!personId || home !== 'TASK') return personId
  return place?.type === 'user' && place.id === personId ? personId : null
}

/** Why a principal may not reach a scope, in words for whoever asked. */
export function scopeRefusal(principal: MemoryPrincipal, scope: MemoryScopeValue): string {
  if (scope === 'AGENT_PLACE') return 'This work has no place, so there is no memory of a place to use.'
  return principal.personId
    ? 'This memory is not reachable from here.'
    : 'This work is not for any person, or happens where others read it, so only what the agent learned about this place can be used.'
}
