/**
 * Who may curate which memory on the memory screen (memory and knowledge spec, The two kinds): a person their own
 * scopes — what every agent knows about them, and what one agent knows about them; a place's admins the agent ×
 * place scope (a person's own space: that person). The person is `context.user`, never an argument, and the
 * scope is built from the same principal rule the tools use, so the screen cannot reach what a run could not.
 */
import { HttpError, prisma } from 'wasp/server'
import type { MemoryItemKindValue, MemoryScopeValue } from '../../shared/memory/protocol'
import type { MemoryPrincipal, Place } from '../contract'
import { mayManageProjectPeople } from '../../projects/membership'
import { personalOwnerOf } from '../../projects/personalProject'
import { scopeTarget, type ScopeTarget } from '../scopes'

export const SCOPES: readonly MemoryScopeValue[] = ['PERSON', 'AGENT_PERSON', 'AGENT_PLACE']
export const KINDS: readonly MemoryItemKindValue[] = ['FACT', 'PREFERENCE', 'DECISION', 'FEEDBACK', 'PROJECT']

export interface ScopeSpec {
  scope: MemoryScopeValue
  agentId?: string
  place?: { type: 'user' | 'project'; id: string }
}

export function signedIn(context: { user?: { id: string } | null }): string {
  if (!context.user) throw new HttpError(401)
  return context.user.id
}

/** A project's place: the owner's own space for a personal project, whose memory is that person's. */
async function placeOf(spec: NonNullable<ScopeSpec['place']>): Promise<Place> {
  if (spec.type === 'user') return { type: 'user', id: spec.id }
  const owner = await personalOwnerOf(spec.id)
  return owner ? { type: 'user', id: owner } : { type: 'project', id: spec.id }
}

async function mayCurate(userId: string, place: Place): Promise<boolean> {
  if (place.type === 'user') return place.id === userId
  return mayManageProjectPeople(place.id, userId)
}

/** The principal the screen acts as for this scope, or a refusal. */
export async function screenPrincipal(userId: string, spec: ScopeSpec): Promise<MemoryPrincipal> {
  if (!SCOPES.includes(spec.scope)) throw new HttpError(400, 'Unknown memory scope')
  if (spec.scope === 'PERSON') return { personId: userId, agentId: '', place: null }
  if (!spec.agentId) throw new HttpError(400, 'Choose an agent')
  const agent = await prisma.agent.findUnique({ where: { id: spec.agentId }, select: { id: true } })
  if (!agent) throw new HttpError(404, 'That agent does not exist')
  if (spec.scope === 'AGENT_PERSON') return { personId: userId, agentId: agent.id, place: null }
  if (!spec.place) throw new HttpError(400, 'Choose a place')
  const place = await placeOf(spec.place)
  if (!(await mayCurate(userId, place))) {
    throw new HttpError(403, "Only a place's admins can curate what an agent remembers there")
  }
  return { personId: userId, agentId: agent.id, place }
}

export async function screenTarget(userId: string, spec: ScopeSpec): Promise<{ principal: MemoryPrincipal; target: ScopeTarget }> {
  const principal = await screenPrincipal(userId, spec)
  const target = scopeTarget(principal, spec.scope)
  if (!target) throw new HttpError(403, 'This memory is not reachable from here')
  return { principal, target }
}

/** The scope an existing item lives in, as a spec, so an item is reached by the same rule as its list. */
export function specOf(item: { scope: MemoryScopeValue; agentId: string | null; placeType: 'user' | 'project' | null; placeId: string | null }): ScopeSpec {
  return {
    scope: item.scope,
    ...(item.agentId ? { agentId: item.agentId } : {}),
    ...(item.placeType && item.placeId ? { place: { type: item.placeType, id: item.placeId } } : {}),
  }
}
