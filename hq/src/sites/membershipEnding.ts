/**
 * Which sites must hear that someone's membership ended (person-scoped
 * execution spec §4, "When membership ends").
 *
 * A person's container and harness home for a project sit on whichever site
 * ran their sessions there: normally the one holding the project's storage,
 * and the one holding a workspace for a session that works in one. So each
 * answer is the storage site together with the site of every session
 * concerned, resolved the same way dispatch resolves it. Every lookup is read
 * before the change it belongs to commits, because the change removes the rows
 * it reads; and none throws, because a site that cannot be told is a site not
 * instructed, never a membership change refused.
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { resolveSiteIdForSession } from '../agents/dispatchSiteResolution'
import { resolveStorageSite } from '../storage/storageSite'
import { sitesToInstruct } from './heldInstructions'
import { Logger } from '../server/utils/logger'

const logger = new Logger('MembershipEnding')

const sessionLocation = {
  userId: true, sessionType: true, taskId: true,
  primaryOwnerType: true, primaryOwnerId: true, primaryWorkspaceId: true,
} as const

function projectSessions(projectId: string): Prisma.AgentSessionWhereInput {
  return { OR: [{ primaryOwnerType: 'project', primaryOwnerId: projectId }, { task: { projectId } }] }
}

async function sessionSites(where: Prisma.AgentSessionWhereInput): Promise<string[]> {
  const sessions = await prisma.agentSession.findMany({ where, select: { id: true, ...sessionLocation } })
  const sites: string[] = []
  for (const session of sessions) {
    try {
      sites.push(await resolveSiteIdForSession(session))
    } catch (err) {
      logger.warn(`session ${session.id} has no site to instruct:`, err instanceof Error ? err.message : err)
    }
  }
  return sites
}

async function projectStorageSite(projectId: string): Promise<string | null> {
  try {
    return await resolveStorageSite({ ownerType: 'project', ownerId: projectId })
  } catch (err) {
    logger.warn(`cannot tell which site holds project ${projectId}:`, err instanceof Error ? err.message : err)
    return null
  }
}

/** The sites holding a member's container and home in one project. */
export async function sitesForMemberInProject(projectId: string, userId: string): Promise<string[]> {
  const storage = await projectStorageSite(projectId)
  const sessions = await sessionSites({ AND: [projectSessions(projectId), { userId }] })
  return sitesToInstruct([storage, ...sessions])
}

/** The sites holding any container or home of a project. `storageSiteId` when the caller has already read it. */
export async function sitesForProject(projectId: string, storageSiteId?: string | null): Promise<string[]> {
  const storage = storageSiteId === undefined ? await projectStorageSite(projectId) : storageSiteId
  const sessions = await sessionSites(projectSessions(projectId))
  return sitesToInstruct([storage, ...sessions])
}

/**
 * Every site a person's leaving is sent to: all of them that are not revoked.
 * A person's homes can sit on a site hq no longer connects to them — a session
 * deleted, a workspace moved — and the instruction is cheap and idempotent, so
 * asking every site is the only answer that cannot miss one.
 */
export async function sitesForPerson(): Promise<string[]> {
  const rows = await prisma.executionSite.findMany({ where: { status: { not: 'REVOKED' } }, select: { siteId: true } })
  return rows.map(r => r.siteId)
}

/**
 * The people who worked in an open project without being its members — whose
 * access ends when it is made private. Only chats run as a person in a
 * project (a task runs as the project), so only chats are counted.
 */
export async function nonMembersWhoWorkedIn(projectId: string): Promise<string[]> {
  const rows = await prisma.agentSession.findMany({
    where: {
      primaryOwnerType: 'project',
      primaryOwnerId: projectId,
      sessionType: 'chat',
      user: { projectMemberships: { none: { projectId } } },
    },
    select: { userId: true },
    distinct: ['userId'],
  })
  return rows.map(r => r.userId)
}
