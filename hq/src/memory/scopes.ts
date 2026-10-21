/**
 * Where memory lives and who reaches it (memory and knowledge spec, Knowledge delivery's table): a person's own
 * scopes only for that person, agent × place only in that place, and a principal with no person — a run nobody
 * commissioned — agent × place only. Reading and writing reach the same scopes.
 */
import type { MemoryScopeValue } from '../shared/memory/protocol'
import type { MemoryPrincipal } from './contract'

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

/** Why a principal may not reach a scope, in words for whoever asked. */
export function scopeRefusal(principal: MemoryPrincipal, scope: MemoryScopeValue): string {
  if (scope === 'AGENT_PLACE') return 'This work has no place, so there is no memory of a place to use.'
  return principal.personId
    ? 'This memory is not reachable from here.'
    : 'This work is not for any person, so only what the agent learned about this place can be used.'
}
