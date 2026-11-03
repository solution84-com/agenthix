/**
 * What one knowledge call may reach (agent knowledge spec, part 4, *Who reaches what*), built only from what hq
 * signed: a run's capability, or a conversation turn's. A run reaches its one place; a turn its conversation's places
 * (conversations/places.ts): its own, then those its person added. The organisation's knowledge and the platform guide are every
 * agent's, and the knowledge service adds them itself; nothing an agent passes in a call widens what is built here.
 * What is built here is the most a call reaches: the service narrows it at every call to the person's standing in
 * each place (knowledge/standing.ts), so a project they left is gone and one they only view is read-only.
 *
 * A place is where its files live (adr-0060): a project's own storage, named by the project's slug, or the person's
 * own, named `personal`, for their space.
 */
import { prisma } from 'wasp/server'
import type { CapabilityClaims, CapabilityEffectivePermissions, KnowledgeOwnerRef } from '@agenthix/core'
import type { KnowledgeReach } from '../../knowledge'
import { PERSONAL_LEVEL } from '../../knowledge/reach'
import type { TurnCapability } from '../../conversations/contract'
import { placeStorageOf } from '../../projects/personalProject'
import { WRITE_TOOLS } from '../../agents/toolPermissions'
import { addedPlaces, placesConversation, projectLevel } from '../../conversations/places'

export type KnowledgePlace = KnowledgeReach['places'][number]

/** The level name of a person's own space. */

const personal = (userId: string): KnowledgePlace => ({ level: PERSONAL_LEVEL, owner: { ownerType: 'user', ownerId: userId } })

/** A project's place: its own storage under its slug, or its person's own space. Null for a project that is gone. */
export async function placeOfProject(projectId: string): Promise<KnowledgePlace | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, slug: true, key: true, personalOwnerId: true, personalSpace: true },
  })
  if (!project) return null
  const storage = placeStorageOf(project)
  if (storage.ownerType === 'user') return personal(storage.ownerId)
  const owner: KnowledgeOwnerRef = { ownerType: 'project', ownerId: project.id }
  return { level: projectLevel(project), owner }
}

/** A run's one place, from its token alone: its project, or, for a chat in its person's own storage, that person's. */
export async function runPlaces(claims: CapabilityClaims): Promise<KnowledgePlace[]> {
  if (claims.projectId !== null) {
    const place = await placeOfProject(claims.projectId)
    return place ? [place] : []
  }
  if (claims.taskId === null && claims.runner?.kind === 'person') return [personal(claims.runner.userId)]
  return []
}

/** A turn's own place: its project (a project's or a task's conversation), or the person's own space. */
async function turnOwnPlace(turn: TurnCapability): Promise<KnowledgePlace | null> {
  if (turn.projectId) return placeOfProject(turn.projectId)
  const owner = turn.actingUserId ?? turn.readerUserId ?? null
  if (turn.home === 'PERSON' && turn.taskId === null && owner) return personal(owner)
  return null
}

/**
 * A turn's places (adr-0152): its own first, then each its person added, oldest first, re-checked as they are read —
 * a place the person can no longer open is not among them. A task's thread has its project only.
 */
export async function turnPlaces(turn: TurnCapability): Promise<KnowledgePlace[]> {
  const own = await turnOwnPlace(turn)
  const places = own ? [own] : []
  const conversation = turn.home === 'TASK' ? null : await placesConversation(turn.conversationId)
  for (const { place } of conversation ? await addedPlaces(conversation) : []) {
    const reached = place.type === 'user' ? personal(place.id) : await placeOfProject(place.id)
    if (reached && !places.some(p => p.owner.ownerType === reached.owner.ownerType && p.owner.ownerId === reached.owner.ownerId)) places.push(reached)
  }
  return places
}

/**
 * Whether a run may change files at all, read as the site reads it to mount its storage read-only or not
 * (`runHasWriteTools` there): a write tool never-listed is off even when approval is bypassed, and a write tool its
 * agent's list leaves out is not granted. A run without one changes no knowledge either.
 */
export function runHasWriteTools(p: CapabilityEffectivePermissions): boolean {
  return WRITE_TOOLS.some(tool => {
    if (p.neverTools.includes(tool)) return false
    if (p.bypassed) return true
    const entry = p.allowedTools.find(perm => perm.name === tool)
    return entry?.state === 'always' || entry?.state === 'ask'
  })
}

export async function runReach(claims: CapabilityClaims, userId: string, runId: string): Promise<KnowledgeReach> {
  return {
    places: await runPlaces(claims),
    userId,
    agent: { agentId: claims.agentId, runId },
    mayChange: runHasWriteTools(claims.permissions),
    callerKey: runId,
  }
}

/** A turn that answers a person may change knowledge, as it may remember; any other turn only reads. */
export function turnMayChange(turn: TurnCapability): boolean {
  return !!turn.actingUserId && turn.trigger !== 'REPORT' && turn.expiresAt > Date.now()
}

export async function turnReach(turn: TurnCapability, userId: string): Promise<KnowledgeReach> {
  return {
    places: await turnPlaces(turn),
    userId,
    agent: { agentId: turn.agentId, conversationId: turn.conversationId },
    mayChange: turnMayChange(turn),
    callerKey: turn.conversationId,
  }
}
