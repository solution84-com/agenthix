/**
 * Erase (adr-0100): separate from Remove, and only after it. Deletes the
 * person's own data — their conversations in hq, their chats from before
 * and those chats' runs on every site, their space and every other personal project they made, with their
 * tasks and files, their own files, what agents
 * remember of them, their connections, model logins, name, picture and
 * sign-in — and keeps every project's tasks, comments and task runs, which
 * then name them "Former member". It cannot be undone, so the admin types the
 * person's name or handle to confirm.
 *
 * Their data is found by what they own — a conversation is its person's, a
 * task session is its project's — never by a column that names someone only
 * for bookkeeping: a project task's session is filed under an admin
 * (dispatchService.ts), and erasing that admin must leave the project's runs
 * alone.
 *
 * Site first, as deleting an account was: a site that cannot be reached
 * refuses the erase before anything in hq changes, and it can be run again.
 */
import { HttpError, prisma } from 'wasp/server'
import fs from 'node:fs/promises'
import type { ConversationHome, Prisma } from '@prisma/client'
import { requireRole } from '../server/identity/requireRole'
import * as dispatchService from '../agents/dispatchService'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { rethrowSiteUnreachableAsHttp } from '../storage/httpErrors'
import { expirePreviewsForSessions } from '../preview/previewRegistry'
import { removeLocationOnSite } from '../storage/locationFileStore'
import { removeProjectStorageOnSite } from '../projects/projectStorageRemoval'
import { resolveStorageSite } from '../storage/storageSite'
import { getPersonImagesDir } from '../server/hqStoragePaths'
import { PERSON_SELECT, personSummary } from '../server/identity/personSummary'
import { MEMBERSHIP_METHODS } from '@agenthix/core'
import { heldInstructionRows, deliverHeldInstructionsTo } from '../sites/heldInstructions'
import { sitesForProject } from '../sites/membershipEnding'
import { Logger } from '../server/utils/logger'

const logger = new Logger('ErasePerson')

type Ctx = { user?: { id: string } | null }

/** The conversations in hq that are the person's own: the ones they opened in their space or a project. A task's thread is its project's. */
export const OWN_CONVERSATION_HOMES: ConversationHome[] = ['PERSON', 'PROJECT']

/** The sessions that are the person's own: their conversations, anywhere, and every session of their own project. */
export function ownSessionsOf(userId: string): Prisma.AgentSessionWhereInput {
  return {
    OR: [
      { sessionType: 'chat', userId },
      { primaryOwnerType: 'user', primaryOwnerId: userId },
      { task: { project: { personalOwnerId: userId } } },
    ],
  }
}

function confirms(typed: unknown, names: Array<string | null>): boolean {
  if (typeof typed !== 'string') return false
  const t = typed.trim().replace(/^@/, '').toLowerCase()
  return t !== '' && names.some(n => n !== null && n.trim().toLowerCase() === t)
}

async function deleteOwnSessionsOnSites(sessions: Array<Parameters<typeof dispatchService.resolveSiteIdForSession>[0] & { id: string }>) {
  const bySite = new Map<string, string[]>()
  for (const session of sessions) {
    const siteId = await dispatchService.resolveSiteIdForSession(session)
    bySite.set(siteId, [...(bySite.get(siteId) ?? []), session.id])
  }
  try {
    for (const [siteId, ids] of bySite) await siteRuntimeStore.deleteSessionsBy(siteId, { ids })
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }
}

/**
 * The personal projects they made besides their space, each with the site holding its own storage. The space is
 * not among them: its files are the person's own, removed with those.
 */
async function ownProjectsToErase(userId: string) {
  const rows = await prisma.project.findMany({
    where: { personalOwnerId: userId, personalSpace: false },
    select: { id: true, executionSite: { select: { siteId: true } } },
  })
  return rows.map(r => ({ id: r.id, siteId: r.executionSite?.siteId ?? null }))
}

/** How many personal projects, besides their space, erasing a person deletes: the erase dialog says so. */
export const getErasedProjectCount = async (
  { userId }: { userId: string },
  context: Ctx,
): Promise<{ count: number }> => {
  await requireRole(context, 'ADMIN', 'Reading what erasing a person deletes')
  return { count: await prisma.project.count({ where: { personalOwnerId: userId, personalSpace: false } }) }
}

/** Their own files on the site that holds them. Never fails the erase: a folder left behind is logged, by owner and site. */
async function removeOwnStorage(userId: string, siteId: string | null): Promise<void> {
  if (siteId === null) return
  try {
    await removeLocationOnSite({ ownerType: 'user', ownerId: userId }, { wholeOwner: true, logicalSiteId: siteId })
  } catch (err) {
    logger.warn(`the erased person ${userId}'s files on site ${siteId} could not be removed and stay until removed by hand:`, err)
  }
}

export const erasePerson = async (
  { userId, confirm }: { userId: string; confirm: string },
  context: Ctx,
): Promise<{ ok: true }> => {
  await requireRole(context, 'ADMIN', 'Erasing a person')
  const row = await prisma.user.findUnique({ where: { id: userId }, select: PERSON_SELECT })
  if (!row) throw new HttpError(404, 'Person not found')
  if (row.erasedAt) throw new HttpError(400, 'This person has already been erased')
  if (!row.deactivatedAt) throw new HttpError(400, 'Remove this person from the organisation before erasing them')
  const person = personSummary(row)
  if (!confirms(confirm, [person.handle, row.displayName])) {
    throw new HttpError(400, 'Type their name to confirm')
  }

  const sessions = await prisma.agentSession.findMany({
    where: ownSessionsOf(userId),
    select: { id: true, agentId: true, taskId: true, primaryOwnerType: true, primaryOwnerId: true, primaryWorkspaceId: true, userId: true, sessionType: true },
  })
  await deleteOwnSessionsOnSites(sessions)
  const storageSite = await resolveStorageSite({ ownerType: 'user', ownerId: userId }).catch(() => null)
  const ownProjects = await ownProjectsToErase(userId)
  const instructSites = new Set<string>()
  for (const p of ownProjects) for (const site of await sitesForProject(p.id, p.siteId)) instructSites.add(site)
  await expirePreviewsForSessions(sessions.map(s => s.id))

  const ownProject = { personalOwnerId: userId }
  const ownProjectIds = ownProjects.map(p => p.id)
  await prisma.$transaction([
    // Told to every site that holds any of their projects' homes and containers; a site that is down gets it later.
    prisma.heldSiteInstruction.createMany({
      data: ownProjectIds.flatMap(projectId => heldInstructionRows([...instructSites], { method: MEMBERSHIP_METHODS.projectDeleted, params: { projectId } })),
    }),
    prisma.agentSession.deleteMany({ where: { id: { in: sessions.map(s => s.id) } } }),
    prisma.conversation.deleteMany({ where: { openedById: userId, home: { in: OWN_CONVERSATION_HOMES } } }),
    prisma.task.deleteMany({ where: { project: ownProject } }),
    prisma.board.deleteMany({ where: { project: ownProject } }),
    prisma.project.deleteMany({ where: ownProject }),
    prisma.project.updateMany({ where: { leadUserId: userId }, data: { leadUserId: null } }),
    prisma.memoryItem.deleteMany({ where: { OR: [{ userId }, { placeType: 'user', placeId: userId }, { placeType: 'project', placeId: { in: ownProjectIds } }] } }),
    prisma.agentOverride.deleteMany({ where: { boundaryType: 'user', boundaryId: userId } }),
    prisma.personConnection.deleteMany({ where: { userId } }),
    prisma.cloudAccountLink.deleteMany({ where: { userId } }),
    prisma.cloudSignInAsk.deleteMany({ where: { userId } }),
    prisma.offerDismissal.deleteMany({ where: { userId } }),
    // Their own Claude subscription and their list of models go with them.
    prisma.aiProvider.deleteMany({ where: { ownerUserId: userId } }),
    prisma.modelList.deleteMany({ where: { owner: 'person', ownerId: userId } }),
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.mobileAuthToken.deleteMany({ where: { userId } }),
    prisma.deviceSession.deleteMany({ where: { userId } }),
    prisma.pin.deleteMany({ where: { userId } }),
    prisma.boardShowAlso.deleteMany({ where: { userId } }),
    prisma.userStoragePlacement.deleteMany({ where: { userId } }),
    prisma.projectMember.deleteMany({ where: { userId } }),
    prisma.teamPerson.deleteMany({ where: { userId } }),
    prisma.userSettings.deleteMany({ where: { userId } }),
    // The sign-in identity: the auth row, with its login name and sessions.
    prisma.auth.deleteMany({ where: { userId } }),
    prisma.user.update({ where: { id: userId }, data: { displayName: null, avatarUrl: null, erasedAt: new Date() } }),
  ])
  void deliverHeldInstructionsTo(instructSites)
  await removeOwnStorage(userId, storageSite)
  for (const p of ownProjects) await removeProjectStorageOnSite(p.id, p.siteId)
  await fs.rm(getPersonImagesDir(userId), { recursive: true, force: true })
  return { ok: true }
}
