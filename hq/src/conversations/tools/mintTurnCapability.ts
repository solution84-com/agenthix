/**
 * The authority one turn acts with (adr-0082, conversation layer spec, Tool execution contract): minted for the
 * author of the message the turn answers, in the conversation's place, and never stored.
 *
 * Its tool permissions are the agent's in that place, as a run's are: the agent's own with the place's boundary
 * narrowing on top, the strictest level winning (`runPermissions`, the resolution a run's capability is minted
 * from). Its person is checked here as they stand now, and again by the tool entry at every call (adr-0101).
 */
import { prisma } from 'wasp/server'
import { CAPABILITY_TTL_SECONDS, type CapabilityEffectivePermissions } from '@agenthix/core'
import { runPermissions, type OverrideBoundary } from '../../agents/overrides/agentOverrideService'
import { projectStanding } from '../../projects/membership'
import { taskRunOwner } from '../../projects/personalProject'
import { ControlPlaneError } from '../../server/controlplane/types'
import type { ConversationHomeRef, MintTurnCapability, TurnCapability } from '../contract'

/** As long as a run's capability lives; a turn that outlasts it is refused its next tool call. */
export const TURN_CAPABILITY_TTL_MS = CAPABILITY_TTL_SECONDS * 1000

interface Place { boundary: OverrideBoundary; projectId: string | null; taskId: string | null }

/** The conversation's place now: the opener's own space, its project, or its task's current project. */
async function placeOf(conversation: ConversationHomeRef): Promise<Place> {
  if (conversation.home === 'PERSON') {
    return { boundary: { type: 'user', id: conversation.openedById }, projectId: null, taskId: null }
  }
  if (conversation.home === 'PROJECT') {
    if (!conversation.projectId) throw new ControlPlaneError('invalid', 'A project conversation names no project')
    return { boundary: { type: 'project', id: conversation.projectId }, projectId: conversation.projectId, taskId: null }
  }
  if (!conversation.taskId) throw new ControlPlaneError('invalid', "A task's conversation names no task")
  // Read from the task as it is now: a task in a personal project is its person's, any other its project's.
  const owner = await taskRunOwner(conversation.taskId)
  if (!owner) throw new ControlPlaneError('not_found', "This conversation's task no longer exists")
  return { boundary: { type: owner.ownerType, id: owner.ownerId }, projectId: owner.projectId, taskId: conversation.taskId }
}

async function readerOf(conversation: ConversationHomeRef): Promise<string | null> {
  if (conversation.home !== 'TASK') return conversation.openedById
  if (!conversation.taskId) return null
  const task = await prisma.task.findUnique({ where: { id: conversation.taskId }, select: { onBehalfOfUserId: true } })
  return task?.onBehalfOfUserId ?? null
}

/** The person as they are now: still in the organisation, their role, and able to read the conversation's place. */
async function personInPlace(userId: string, conversation: ConversationHomeRef, place: Place) {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { deactivatedAt: true, settings: { select: { role: true } } },
  })
  if (!row || row.deactivatedAt !== null) {
    throw new ControlPlaneError('forbidden', 'The person this turn would act for is no longer in the organisation')
  }
  if (conversation.home === 'PERSON' && userId !== conversation.openedById) {
    throw new ControlPlaneError('forbidden', "A conversation in a person's own space acts for that person alone")
  }
  if (place.projectId !== null && (await projectStanding(place.projectId, userId)) === 'none') {
    throw new ControlPlaneError('forbidden', "The person this turn would act for is not a member of the conversation's project")
  }
  return { role: row.settings?.role ?? null }
}

/** The agent's tool permissions in a boundary, shaped as a run's capability carries them. */
export async function permissionsOf(agentId: string, boundary: OverrideBoundary): Promise<CapabilityEffectivePermissions> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { id: true, approval: true, allowedTools: true, allowedBashPatterns: true },
  })
  if (!agent) throw new ControlPlaneError('not_found', "This conversation's agent no longer exists")
  const effective = await runPermissions(agent, boundary)
  // Shaped as a run's capability is: a bypassed turn lists no tools, and Never is listed apart, since it binds even then.
  const bypassed = effective.approval === 'bypassed'
  return {
    bypassed,
    allowedTools: bypassed ? [] : effective.allowedTools,
    allowedBashPatterns: effective.allowedBashPatterns,
    neverTools: effective.allowedTools.filter(p => p.state === 'never').map(p => p.name),
  }
}

export const mintTurnCapability: MintTurnCapability = async ({ conversation, turnId, agentId, actingUserId, trigger, continuationDepth }) => {
  const place = await placeOf(conversation)
  const { role } = actingUserId ? await personInPlace(actingUserId, conversation, place) : { role: null }
  // A turn that answers no one reads as the conversation's one reader; in a task's thread, as the person the task
  // is for, whose work it is.
  const readerUserId = actingUserId === null ? await readerOf(conversation) : null
  const capability: TurnCapability = {
    conversationId: conversation.id,
    turnId,
    agentId,
    home: conversation.home,
    projectId: place.projectId,
    taskId: place.taskId,
    actingUserId,
    readerUserId,
    trigger: trigger ?? 'MESSAGE',
    ...(trigger === 'CONTINUATION' ? { continuationDepth: continuationDepth ?? 0 } : {}),
    role,
    permissions: await permissionsOf(agentId, place.boundary),
    expiresAt: Date.now() + TURN_CAPABILITY_TTL_MS,
  }
  return capability
}
