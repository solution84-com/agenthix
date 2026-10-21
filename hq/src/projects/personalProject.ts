/**
 * A person's personal project (agents own schedule spec §4). It is an ordinary
 * project with one column, `personalOwnerId`, and the rules that column brings:
 *
 *  - one per person, created with their account and deleted only when they
 *    are erased (adr-0100);
 *  - private, with exactly one member — its owner, as its admin — who cannot
 *    leave it, add anyone, change its access, file it, or delete it;
 *  - its runs act as that person in their own storage, never as a project
 *    (`runBoundary`, `taskRunLocation`), so it has no project storage, no
 *    project credential and no project overrides of its own.
 *
 * Each rule is enforced by the action that would break it, through
 * `refuseOnPersonalProject` below, and visibility by `isProjectMember` and
 * `entitledProjectsFilter` (membership.ts), which answer for the owner alone.
 */
import { randomInt } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { HttpError, prisma } from 'wasp/server'
import { projectTasksBoardCreate } from './boardColumns'
import { Logger } from '../server/utils/logger'

const logger = new Logger('PersonalProject')

export const PERSONAL_PROJECT_NAME = 'My tasks'

/** The person a project is personal to, or null for any other project (or none). */
export async function personalOwnerOf(projectId: string): Promise<string | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { personalOwnerId: true } })
  return project?.personalOwnerId ?? null
}

export async function isPersonalProject(projectId: string): Promise<boolean> {
  return (await personalOwnerOf(projectId)) !== null
}

/** Refuses an act a personal project does not allow, for everyone — its owner and the org's admins alike. */
export async function refuseOnPersonalProject(projectId: string, act: string): Promise<void> {
  if (await isPersonalProject(projectId)) {
    throw new HttpError(400, `${act} is not possible for a personal project`)
  }
}

/**
 * A task and a board may sit in different projects (`Task.boardId` and
 * `Task.projectId` are independent), and nothing stops that in general. Across
 * a personal project's edge it would show one person's task on a board others
 * see, or put others' work on a board only one person sees, so it is refused.
 */
export async function refuseBoardAcrossPersonalEdge(taskProjectId: string, boardId: string | undefined | null): Promise<void> {
  if (!boardId) return
  const board = await prisma.board.findUnique({ where: { id: boardId }, select: { projectId: true } })
  if (!board || board.projectId === taskProjectId) return
  if ((await isPersonalProject(taskProjectId)) || (await isPersonalProject(board.projectId))) {
    throw new HttpError(400, "A task cannot be placed on a board in another project when either is a personal project")
  }
}

/** `refuseBoardAcrossPersonalEdge` for an existing task, named by id. */
export async function refuseMoveAcrossPersonalEdge(taskId: string, boardId: string | undefined | null): Promise<void> {
  if (!boardId) return
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } })
  if (task) await refuseBoardAcrossPersonalEdge(task.projectId, boardId)
}

export type TaskRunOwner = { projectId: string; ownerType: 'project' | 'user'; ownerId: string }

/**
 * Whose storage a task's runs work in, and so whose authority they carry — the
 * one rule every task-run path reads (spec §4): a task in a personal project
 * runs in its person's own storage, as that person; any other task runs in its
 * project's storage, as the project. Null when the task is gone. Read fresh
 * from the task's current project, never from a session row.
 */
export async function taskRunOwner(taskId: string): Promise<TaskRunOwner | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true, project: { select: { personalOwnerId: true } } },
  })
  if (!task) return null
  const person = task.project.personalOwnerId
  return person
    ? { projectId: task.projectId, ownerType: 'user', ownerId: person }
    : { projectId: task.projectId, ownerType: 'project', ownerId: task.projectId }
}

/**
 * The tasks whose runs go to one site — the same answer `taskRunOwner` gives
 * dispatch: a project's tasks on the project's site, a personal project's
 * (which names no site of its own) on the site holding its person's storage.
 * For the sweeps that pick a site's tasks out of the database (reconcile, the
 * reconnect drain), so they never miss a personal project's.
 */
export function tasksRunOnSite(siteId: string): Prisma.TaskWhereInput {
  return {
    OR: [
      { project: { executionSite: { siteId } } },
      { project: { personalOwner: { is: { storagePlacement: { is: { site: { siteId } } } } } } },
    ],
  }
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
 * The person's personal project, created if it does not exist yet. Idempotent
 * and safe to race: `personalOwnerId` is unique, so a second creator fails on it
 * and reads back the winner's. A key collision with another project just tries
 * another key.
 *
 * It names no Execution Site and provisions no files: it has no storage of its
 * own, because its runs work in the person's own storage (spec §4).
 */
export async function ensurePersonalProject(userId: string): Promise<PersonalProjectRef> {
  const select = { id: true, key: true, name: true } as const
  const existing = await prisma.project.findUnique({ where: { personalOwnerId: userId }, select })
  if (existing) return existing

  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      return await prisma.project.create({
        data: {
          name: PERSONAL_PROJECT_NAME,
          key: candidateKey(attempt),
          accessLevel: 'PRIVATE',
          personalOwnerId: userId,
          members: { create: { userId, role: 'ADMIN' } },
          // Its Project Tasks, as every project has (adr-0097).
          boards: { create: projectTasksBoardCreate() },
        },
        select,
      })
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      const raced = await prisma.project.findUnique({ where: { personalOwnerId: userId }, select })
      if (raced) return raced
    }
  }
  throw new Error(`Could not find a free project key for the personal project of ${userId}`)
}

/**
 * Every account's personal project, at boot. Only the accounts that have none
 * are touched, so it is a no-op once each has one; an erased person's went
 * with their data and is never made again (adr-0100). One account's failure is
 * logged and does not stop the rest; `ensurePersonalProject` runs again the
 * next time that person opens it.
 */
export async function ensurePersonalProjectsForEveryone(): Promise<void> {
  const users = await prisma.user.findMany({ where: { personalProject: null, erasedAt: null }, select: { id: true } })
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
