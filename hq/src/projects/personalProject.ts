/**
 * A person's personal projects (models from one place, part 4). A personal project is an ordinary project with
 * one column, `personalOwnerId`, and the rules that column brings:
 *
 *  - a person has several. One is **Your space**, marked `personalSpace`: made with the account and never
 *    deleted before they are erased (adr-0100). The others are made by the person and deleted by them;
 *  - private, with exactly one member — its owner, as its admin — who cannot leave it, add anyone, change its
 *    access, file it, or become more than a project only they use;
 *  - its runs act as that person (their credentials, choices and agent settings). Where they work differs: the
 *    space works in the person's own storage, every other personal project in its own, on the site that holds
 *    the person's (`taskRunOwner`, `placeStorageOf`).
 *
 * Each rule is enforced by the action that would break it, through `refuseOnPersonalProject` below, and
 * visibility by `isProjectMember` and `entitledProjectsFilter` (membership.ts), which answer for the owner alone.
 */
import { randomInt } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { HttpError, prisma } from 'wasp/server'
import { builtInTaskTypesCreate } from './taskTypes'
import { requireRole } from '../server/identity/requireRole'
import { Logger } from '../server/utils/logger'
import { KERNEL_HANDLE } from '../agents/kernelGuards'
import { requireId } from './requireId'

const logger = new Logger('PersonalProject')

export type StorageOwner = { ownerType: 'project' | 'user'; ownerId: string }

export const PERSONAL_PROJECT_NAME = 'My tasks'

/** The person a project is personal to, or null for any other project (or none). */
export async function personalOwnerOf(projectId: string): Promise<string | null> {
  requireId(projectId, 'project')
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { personalOwnerId: true } })
  return project?.personalOwnerId ?? null
}

export async function isPersonalProject(projectId: string): Promise<boolean> {
  return (await personalOwnerOf(projectId)) !== null
}

/** Whether a project is a person's own space: the personal project that works in the person's own storage. */
export function isYourSpace(project: { personalOwnerId: string | null; personalSpace: boolean }): boolean {
  return project.personalOwnerId !== null && project.personalSpace
}

/**
 * Where a project's files, workspaces and runs live: the person's own storage for their space, the project's
 * own for every other project, a personal one included.
 */
export function placeStorageOf(project: { id: string; personalOwnerId: string | null; personalSpace: boolean }): StorageOwner {
  return isYourSpace(project) && project.personalOwnerId
    ? { ownerType: 'user', ownerId: project.personalOwnerId }
    : { ownerType: 'project', ownerId: project.id }
}

/** Where a project's files, workspaces and runs live, by id; the project's own when it is gone. */
export async function storageOfProject(projectId: string): Promise<StorageOwner> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, personalOwnerId: true, personalSpace: true } })
  return project ? placeStorageOf(project) : { ownerType: 'project', ownerId: projectId }
}

/** Whether the project is a person's space, by id. */
export async function isSpaceProject(projectId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { personalOwnerId: true, personalSpace: true } })
  return project !== null && isYourSpace(project)
}

/**
 * Who may delete a project: its owner for a personal project that is not their space, and the organisation's
 * admin for any other. The space is never deleted; to anyone but its owner a personal project does not exist,
 * organisation admins included.
 */
export async function requireMayDeleteProject(context: { user?: { id: string } | null }, projectId: string): Promise<void> {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  requireId(projectId, 'project')
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { personalOwnerId: true, personalSpace: true } })
  if (!project?.personalOwnerId) {
    // Destroying a boundary is structure, symmetric with creating one (§6.4's org-admin column).
    await requireRole(context, 'ADMIN', 'Deleting a project')
    return
  }
  if (project.personalOwnerId !== context.user.id) throw new HttpError(404, 'Project not found')
  if (project.personalSpace) throw new HttpError(400, 'Your space is not deleted; it stays for as long as you are in the organisation')
}

/** Refuses an act a personal project does not allow, for everyone — its owner and the org's admins alike. */
export async function refuseOnPersonalProject(projectId: string, act: string): Promise<void> {
  if (await isPersonalProject(projectId)) {
    throw new HttpError(400, `${act} is not possible for a personal project`)
  }
}

/** Whether a change would give Your space another name or key than it has; its description and the rest stay open. */
export function changesYourSpaceIdentity(
  current: { name: string; key: string },
  change: { name?: string; key?: string },
): boolean {
  return (change.name !== undefined && change.name !== current.name) || (change.key !== undefined && change.key !== current.key)
}

/** Your space keeps the name and key it was made with; every other project, a personal one included, may change both. */
export async function refuseRenamingYourSpace(projectId: string, change: { name?: string; key?: string }): Promise<void> {
  if (change.name === undefined && change.key === undefined) return
  requireId(projectId, 'project')
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, key: true, personalOwnerId: true, personalSpace: true },
  })
  if (project && isYourSpace(project) && changesYourSpaceIdentity(project, change)) {
    throw new HttpError(400, 'Your space keeps its name and key. You can still change its description. Nothing was changed.')
  }
}

export type TaskRunOwner = {
  projectId: string
  /** Whose authority the run carries and whose settings apply: the person for any personal project, else the project. */
  ownerType: 'project' | 'user'
  ownerId: string
  /** Where the run works: the person's own storage for Your space, the project's own for every other project. */
  storage: StorageOwner
}

/**
 * Whose a task's runs are, and where they work — the one rule every task-run path reads. A task in a personal
 * project runs as its person, in their own storage for Your space and in the project's own for any other
 * personal project; any other task runs as its project, in its storage. Null when the task is gone. Read fresh
 * from the task's current project, never from a session row.
 */
export async function taskRunOwner(taskId: string): Promise<TaskRunOwner | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true, project: { select: { personalOwnerId: true, personalSpace: true } } },
  })
  if (!task) return null
  const { personalOwnerId: person, personalSpace } = task.project
  const storage = placeStorageOf({ id: task.projectId, personalOwnerId: person, personalSpace })
  return person
    ? { projectId: task.projectId, ownerType: 'user', ownerId: person, storage }
    : { projectId: task.projectId, ownerType: 'project', ownerId: task.projectId, storage }
}

/**
 * The tasks whose runs go to one site — the same answer `taskRunOwner` gives
 * dispatch: a project's tasks on the project's site (a personal project's too,
 * which is placed on the site holding its person's storage), Your space's, which names no site of its own,
 * on the site holding its person's storage.
 * For the sweeps that pick a site's tasks out of the database (reconcile, the
 * reconnect drain), so they never miss a personal project's.
 */
export function tasksRunOnSite(siteId: string): Prisma.TaskWhereInput {
  return {
    OR: [
      { project: { executionSite: { siteId } } },
      { project: { personalSpace: true, personalOwner: { is: { storagePlacement: { is: { site: { siteId } } } } } } },
    ],
  }
}

/**
 * What a personal place's roster starts with: Kernel, on it from when the place is made (its agents are its own
 * roster, apart from people). Nothing before the organisation's setup has made Kernel.
 */
export async function startingRoster(): Promise<{ defaultAgentId?: string; agents?: { create: { agentId: string; direct: true } } }> {
  const kernel = await prisma.agent.findUnique({ where: { handle: KERNEL_HANDLE }, select: { id: true } })
  return kernel ? { defaultAgentId: kernel.id, agents: { create: { agentId: kernel.id, direct: true } } } : {}
}

/** Two to six letters, as every project key is: `MY` and three or four more. */
function candidateKey(attempt: number): string {
  const letters = attempt < 20 ? 3 : 4
  let key = 'MY'
  for (let i = 0; i < letters; i++) key += String.fromCharCode(65 + randomInt(26))
  return key
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
}

export type PersonalProjectRef = { id: string; key: string; name: string }

/**
 * The person's space, created if it does not exist yet. Idempotent and safe to race: at most one personal
 * project per person is the space (a partial unique index), so a second creator fails on it and reads back the
 * winner's. A key collision with another project just tries another key.
 *
 * It names no Execution Site and provisions no files: it has no storage of its own, because its runs work in the
 * person's own storage. The projects a person makes themselves are placed and provisioned by
 * `createPersonalProject` (personalProjectService.ts).
 */
export async function ensurePersonalProject(userId: string): Promise<PersonalProjectRef> {
  const select = { id: true, key: true, name: true } as const
  const where = { personalOwnerId: userId, personalSpace: true }
  const existing = await prisma.project.findFirst({ where, select })
  if (existing) return existing
  const roster = await startingRoster()

  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      return await prisma.project.create({
        data: {
          name: PERSONAL_PROJECT_NAME,
          key: candidateKey(attempt),
          accessLevel: 'PRIVATE',
          personalOwnerId: userId,
          personalSpace: true,
          members: { create: { userId, role: 'ADMIN' } },
          // Its Task and Epic types, as every project has (adr-0174).
          taskTypes: { create: builtInTaskTypesCreate() },
          ...roster,
        },
        select,
      })
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      const raced = await prisma.project.findFirst({ where, select })
      if (raced) return raced
    }
  }
  throw new Error(`Could not find a free project key for the personal project of ${userId}`)
}

/**
 * Every account's space, at boot. Only the accounts that have none
 * are touched, so it is a no-op once each has one; an erased person's went
 * with their data and is never made again (adr-0100). One account's failure is
 * logged and does not stop the rest; `ensurePersonalProject` runs again the
 * next time that person opens it.
 */
export async function ensurePersonalProjectsForEveryone(): Promise<void> {
  const users = await prisma.user.findMany({ where: { personalProjects: { none: { personalSpace: true } }, erasedAt: null }, select: { id: true } })
  for (const { id } of users) {
    try {
      await ensurePersonalProject(id)
    } catch (err) {
      logger.error(`could not create the personal project of ${id}:`, err)
    }
  }
}

/** For the account-creation paths: the account exists whether or not this succeeds, and the next read creates it. */
export async function ensurePersonalProjectAfterSignup(userId: string): Promise<void> {
  try {
    await ensurePersonalProject(userId)
  } catch (err) {
    logger.error(`could not create the personal project of new account ${userId}:`, err)
  }
}
