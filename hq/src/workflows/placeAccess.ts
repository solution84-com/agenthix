/**
 * Who may do what in a place (workflows spec part 1, *R4 · Who approves* and *Who may press Run*; ADR-0060). A place
 * is a project, or a person's own storage, and the same rules decide its workflows, its secrets and its variables:
 *
 * - **Administer** — approve, decline, switch a workflow, and change secrets and variables: a project's
 *   administrators; for a person's own project or their own storage, that person alone.
 * - **Start runs** — members, not viewers (adr-0102); for a person's own project or storage, that person.
 * - **Read** — names, descriptions, versions: any member, viewers included.
 *
 * An organisation administrator gets nothing here from that role, as in `projects/membership.ts`. An agent is never
 * a person: everything that administers takes a `WorkflowActor` and refuses an agent before asking anything else.
 */
import { HttpError, prisma } from 'wasp/server'
import type { WorkspaceOwnerType } from '@prisma/client'
import { projectStanding, projectRole } from '../projects/membership'

/** Where a workflow, a secret or a variable belongs: a project's id, or a person's id for their own storage. */
export type WorkflowPlace = { type: WorkspaceOwnerType; id: string }

/** Who is acting: a person, or an agent's run on behalf of one (ADR-0095). */
export type WorkflowActor =
  | { kind: 'person'; userId: string }
  | { kind: 'agent'; agentId: string; agentRunId: string; onBehalfOfUserId: string }

export type PlaceStanding = 'administers' | 'works' | 'reads' | 'none'

export const AGENT_REFUSAL = 'An agent can\'t do this: a person who administers this place can. Nothing was changed.'

/** What the person may do in the place. */
export async function placeStanding(place: WorkflowPlace, userId: string): Promise<PlaceStanding> {
  if (place.type === 'user') {
    if (place.id !== userId) return 'none'
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { deactivatedAt: true } })
    return user && user.deactivatedAt === null ? 'administers' : 'none'
  }
  const standing = await projectStanding(place.id, userId)
  if (standing === 'none') return 'none'
  if (standing === 'reads') return 'reads'
  const project = await prisma.project.findUnique({ where: { id: place.id }, select: { personalOwnerId: true } })
  // projectStanding has already confirmed the owner of a personal project; nobody else gets 'works' there.
  if (project?.personalOwnerId) return 'administers'
  return (await projectRole(place.id, userId)) === 'ADMIN' ? 'administers' : 'works'
}

export async function mayAdministerPlace(place: WorkflowPlace, userId: string): Promise<boolean> {
  return (await placeStanding(place, userId)) === 'administers'
}

export async function mayStartRunsInPlace(place: WorkflowPlace, userId: string): Promise<boolean> {
  const standing = await placeStanding(place, userId)
  return standing === 'administers' || standing === 'works'
}

export async function mayReadPlace(place: WorkflowPlace, userId: string): Promise<boolean> {
  return (await placeStanding(place, userId)) !== 'none'
}

function whoAdministers(place: WorkflowPlace): string {
  return place.type === 'user' ? 'the person whose storage this is' : 'one of this project\'s administrators'
}

/** Refuses an agent, and a person who doesn't administer the place, each told who can. */
export async function requireMayAdministerPlace(place: WorkflowPlace, actor: WorkflowActor, what: string): Promise<string> {
  if (actor.kind !== 'person') throw new HttpError(403, AGENT_REFUSAL)
  if (!(await mayAdministerPlace(place, actor.userId))) {
    throw new HttpError(403, `${what} needs ${whoAdministers(place)}; ask them. Nothing was changed.`)
  }
  return actor.userId
}

export async function requireMayStartRunsInPlace(place: WorkflowPlace, userId: string, what: string): Promise<void> {
  const standing = await placeStanding(place, userId)
  if (standing === 'none') throw new HttpError(403, `${what} needs membership of this place. Nothing was changed.`)
  if (standing === 'reads') {
    throw new HttpError(403, `${what} needs the Member or Admin role in this project; a Viewer only reads. Nothing was changed.`)
  }
}

export async function requireMayReadPlace(place: WorkflowPlace, userId: string, what: string): Promise<void> {
  if (!(await mayReadPlace(place, userId))) throw new HttpError(403, `${what} needs membership of this place.`)
}

/** The people who administer the place, for notifications: a project's administrators, or the person. */
export async function placeAdministrators(place: WorkflowPlace): Promise<string[]> {
  if (place.type === 'user') return (await mayAdministerPlace(place, place.id)) ? [place.id] : []
  const project = await prisma.project.findUnique({
    where: { id: place.id },
    select: { personalOwnerId: true, personalOwner: { select: { deactivatedAt: true } } },
  })
  if (!project) return []
  if (project.personalOwnerId) return project.personalOwner?.deactivatedAt === null ? [project.personalOwnerId] : []
  const admins = await prisma.projectMember.findMany({
    where: { projectId: place.id, role: 'ADMIN', user: { deactivatedAt: null } },
    select: { userId: true },
  })
  return admins.map((a) => a.userId)
}

export function isWorkflowPlace(value: unknown): value is WorkflowPlace {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (v.type === 'project' || v.type === 'user') && typeof v.id === 'string' && v.id !== ''
}
