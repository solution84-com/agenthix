/**
 * When someone leaves the organisation (adr-0100): three separate acts, each an
 * organisation admin's.
 *
 *  - **Remove** deactivates and deletes nothing. Sign-in is refused from then
 *    on, and every session, pairing token and connection ends; they leave every
 *    project, and the open tasks done on their behalf go where the admin chose
 *    for each project the admin can see, and wait everywhere else; every site ends their conversations, runs and
 *    harness logins (`personLeftOrganisation`), keeping the transcripts, and
 *    their own conversations in hq close the same way. With
 *    no sign-in and no project, none of their model logins is used again.
 *  - **Reactivate** restores the same account. Projects are not restored.
 *  - **Erase**, only after Remove, is `erasePerson.ts`.
 *
 * The last-admin rule applies to Remove as it did to deleting an account.
 */
import { HttpError, prisma } from 'wasp/server'
import { MEMBERSHIP_METHODS } from '@agenthix/core'
import { requireRole } from '../server/identity/requireRole'
import { projectsLeftWithoutAnAdmin } from '../projects/membership'
import { heldInstructionRows, deliverHeldInstructionsTo } from '../sites/heldInstructions'
import { sitesForPerson } from '../sites/membershipEnding'
import { expirePreviewsForSessions } from '../preview/previewRegistry'
import { blockTasksForLostAccess } from '../projects/lossOfAccess'
import { parseDestinationsByProject, type OpenTasksDestination, type ProjectDestination } from '../projects/openTasksDestination'
import { checkOpenTasksDestination, handOverOpenTasks, openTaskCountsOf } from '../projects/openTaskHandover'
import { OWN_CONVERSATION_HOMES } from './erasePerson'

type Ctx = { user?: { id: string } | null }

export type RemovePersonArgs = {
  userId: string
  /**
   * Where their open tasks go, for each project they are in where tasks are
   * done on their behalf. Every such project needs a choice; none is assumed.
   */
  openTasks?: ProjectDestination[]
}

export type RemovePersonResult = { ok: true; moved: number; waiting: number }

async function requireOtherPerson(context: Ctx, userId: string, what: string) {
  await requireRole(context, 'ADMIN', what)
  if (userId === context.user!.id) throw new HttpError(400, `${what} is not possible for your own account`)
  const person = await prisma.user.findUnique({ where: { id: userId }, select: { deactivatedAt: true, erasedAt: true } })
  if (!person) throw new HttpError(404, 'Person not found')
  return person
}

/**
 * A refused removal names what blocks it and changes nothing, so it is checked
 * before anything is written. A choice is needed for each project the admin can
 * see where tasks are done on the person's behalf; in a private project the
 * admin is not in, which they may not see into, the tasks wait.
 */
async function plannedDestinations(
  userId: string,
  actorId: string,
  openTasks: ProjectDestination[] | undefined,
): Promise<Map<string, OpenTasksDestination>> {
  const orphaned = await projectsLeftWithoutAnAdmin(userId)
  if (orphaned.length > 0) {
    const named = orphaned.map(p => `${p.name} (${p.key})`).join(', ')
    throw new HttpError(
      400,
      `Removing this person would leave ${orphaned.length === 1 ? 'a project' : 'these projects'} ` +
        `without an admin: ${named}. Appoint another admin first.`,
    )
  }
  let chosen: Map<string, OpenTasksDestination>
  try {
    chosen = parseDestinationsByProject(openTasks)
  } catch (err) {
    throw new HttpError(400, (err as Error).message)
  }
  const memberOf = await prisma.projectMember.findMany({
    where: {
      userId,
      project: { personalOwnerId: null, OR: [{ accessLevel: 'OPEN' }, { members: { some: { userId: actorId } } }] },
    },
    select: { project: { select: { id: true, name: true } } },
  })
  const inProject = new Map(memberOf.map(m => [m.project.id, m.project.name]))
  for (const projectId of chosen.keys()) {
    if (!inProject.has(projectId)) throw new HttpError(400, 'A choice names a project they are not in, or one you cannot see')
  }
  const counts = await openTaskCountsOf(userId, [...inProject.keys()])
  const unchosen = [...counts.keys()].filter(id => !chosen.has(id))
  if (unchosen.length > 0) {
    throw new HttpError(400, `Choose where their open tasks go in ${unchosen.map(id => inProject.get(id)).join(', ')}`)
  }
  for (const [projectId, destination] of chosen) await checkOpenTasksDestination(projectId, userId, destination)
  return chosen
}

export const removePerson = async (args: RemovePersonArgs, context: Ctx): Promise<RemovePersonResult> => {
  const person = await requireOtherPerson(context, args.userId, 'Removing a person')
  if (person.deactivatedAt) throw new HttpError(400, 'This person has already left')
  const { userId } = args
  const destinations = await plannedDestinations(userId, context.user!.id, args.openTasks)

  const ownChats = await prisma.agentSession.findMany({ where: { userId, sessionType: 'chat' }, select: { id: true } })
  const instructSites = await sitesForPerson()
  const now = new Date()
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { deactivatedAt: now, deactivatedById: context.user!.id } }),
    // Wasp's sessions are keyed by the auth row, not the user: every signed-in browser and device ends here.
    prisma.session.deleteMany({ where: { auth: { userId } } }),
    prisma.mobileAuthToken.deleteMany({ where: { userId } }),
    prisma.personConnection.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
    // Their own project stays theirs, for Reactivate; every other membership ends.
    prisma.projectMember.deleteMany({ where: { userId, project: { personalOwnerId: null } } }),
    // Out of their teams too, or the next change to a team would write them back into its projects (adr-0103).
    prisma.teamPerson.deleteMany({ where: { userId } }),
    // Their Library maintainer role ends with them; the history still names them by id (skills spec part 2).
    prisma.libraryMaintainer.deleteMany({ where: { userId } }),
    // Their own conversations close, as every site closes their chats, and keep what was said.
    prisma.conversation.updateMany({
      where: { openedById: userId, home: { in: OWN_CONVERSATION_HOMES }, status: { not: 'CLOSED' } },
      data: { status: 'CLOSED', closedReason: 'LEFT_ORGANISATION' },
    }),
    prisma.heldSiteInstruction.createMany({
      data: heldInstructionRows(instructSites, { method: MEMBERSHIP_METHODS.personLeftOrganisation, params: { userId } }),
    }),
  ])
  void deliverHeldInstructionsTo(instructSites)
  // A PreviewSession names its session with no relation, so nothing above reaches one.
  await expirePreviewsForSessions(ownChats.map(s => s.id))

  let moved = 0
  for (const [projectId, destination] of destinations) {
    moved += (await handOverOpenTasks({ projectId, fromUserId: userId, destination, actorId: context.user!.id })).moved
  }
  // Everything not handed on waits — in projects they had already left, and in their own — and no run is theirs.
  await prisma.task.updateMany({ where: { runOnBehalfOfUserId: userId }, data: { runOnBehalfOfUserId: null } })
  const waiting = await blockTasksForLostAccess({ onBehalfOfUserId: userId }, { stopActiveRuns: false })
  return { ok: true, moved, waiting }
}

export const reactivatePerson = async ({ userId }: { userId: string }, context: Ctx): Promise<{ ok: true }> => {
  const person = await requireOtherPerson(context, userId, 'Reactivating a person')
  if (person.erasedAt) throw new HttpError(400, 'An erased person cannot be reactivated')
  if (!person.deactivatedAt) throw new HttpError(400, 'This person has not left')
  await prisma.user.update({ where: { id: userId }, data: { deactivatedAt: null, deactivatedById: null } })
  return { ok: true }
}
