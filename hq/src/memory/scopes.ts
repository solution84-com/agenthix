/**
 * A memory's scope (ADR-0188): always one person, optionally one agent and optionally one place. An agent saves for
 * the person, itself and the place it works in; only the person widens a memory, by promoting it. Recall checks the
 * scope before the meaning search: the person must be the turn's or run's, and an agent or place the scope names
 * must be the turn's. A principal with no person reaches no memory.
 */
import type { Prisma } from '@prisma/client'
import type { MemoryPrincipal, Place } from './contract'

/** Where a memory holds. An absent agent is every agent; an absent place, everywhere. */
export interface MemoryScope {
  person: string
  agent: string | null
  place: Place | null
}

/** The scope as the columns a row carries. */
export interface ScopeColumns {
  scopeKey: string
  userId: string
  agentId: string | null
  placeType: 'user' | 'project' | null
  placeId: string | null
}

export function scopeKeyOf(scope: MemoryScope): string {
  const place = scope.place ? `${scope.place.type}:${scope.place.id}` : '*'
  return `person:${scope.person}/agent:${scope.agent ?? '*'}/place:${place}`
}

export function scopeColumns(scope: MemoryScope): ScopeColumns {
  return {
    scopeKey: scopeKeyOf(scope),
    userId: scope.person,
    agentId: scope.agent,
    placeType: scope.place?.type ?? null,
    placeId: scope.place?.id ?? null,
  }
}

/** The scope an agent saves into: the person, itself and where it works. Null when the work is for no person. */
export function savingScope(principal: MemoryPrincipal): MemoryScope | null {
  if (!principal.personId) return null
  return { person: principal.personId, agent: principal.agentId || null, place: principal.place }
}

/** Whether a memory's scope lets this principal recall it: its person is the principal's, and each part it names matches. */
export function scopeMatches(
  item: { userId: string; agentId: string | null; placeType: string | null; placeId: string | null },
  principal: MemoryPrincipal,
): boolean {
  if (!principal.personId || item.userId !== principal.personId) return false
  if (item.agentId !== null && item.agentId !== principal.agentId) return false
  if (item.placeType === null && item.placeId === null) return true
  return !!principal.place && item.placeType === principal.place.type && item.placeId === principal.place.id
}

/** The same check as a query, run before the meaning search; null when the principal reaches nothing. */
export function recallableWhere(principal: MemoryPrincipal): Prisma.MemoryItemWhereInput | null {
  if (!principal.personId) return null
  const place: Prisma.MemoryItemWhereInput[] = [{ placeType: null, placeId: null }]
  if (principal.place) place.push({ placeType: principal.place.type, placeId: principal.place.id })
  return {
    userId: principal.personId,
    AND: [
      { OR: [{ agentId: null }, ...(principal.agentId ? [{ agentId: principal.agentId }] : [])] },
      { OR: place },
    ],
  }
}

/** How narrow a scope is: one for each of agent and place it names. The narrowest is what an agent forgets first. */
export function specificity(item: { agentId: string | null; placeId: string | null }): number {
  return (item.agentId ? 1 : 0) + (item.placeId ? 1 : 0)
}

/**
 * The person a conversation's turn reads and writes memory for, given its home: a task's thread is read by every
 * member of its project, so a person's memory is used there only when the task is in that person's own space,
 * which nobody else reads — as a run in a project's shared home is for no person. Every other home is its opener's.
 */
export function personOfTurnHome(home: 'PERSON' | 'PROJECT' | 'TASK', place: Place | null, personId: string | null): string | null {
  if (!personId || home !== 'TASK') return personId
  return place?.type === 'user' && place.id === personId ? personId : null
}

/** Why work for no person cannot use memory, in words for whoever asked. */
export const NO_PERSON_REFUSAL =
  'This work is not for any person, or happens where others read it, so there is no memory to use here. ' +
  "What is true of a place belongs in that place's Knowledge."
