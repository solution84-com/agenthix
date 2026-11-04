/**
 * Project Service
 * ===============
 * Pure business logic for projects — their agent assignments in agentAssignment.ts — and the single
 * import point for boards and tasks: `boardService`, `taskService` and
 * `taskStateService` are re-exported below. No auth, no HTTP — called by Wasp
 * actions (which add auth) and MCP tool handlers (which add response formatting).
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { HttpError } from 'wasp/server'
import { SITE_PROTOCOL_VERSION, checkProtocolCompatibility } from '@agenthix/core'
import { provisionProjectFiles } from '../storage/filesService'
import { deriveProjectKey, deriveSlug } from '../shared/identifiers'
import { checkedLinkId, checkedProjectDescription, checkedProjectName } from './projectFields'
import { requireId } from './requireId'
import { RESERVED_PROJECT_KEYS, reservedKeyRefusal, reservedSlugRefusal } from './reservedNames'
import { triggerSnapshotPush } from '../server/dashboard/debouncedPush'
import { taskSessionsWhere } from '../sessions/taskSessionDeletion'
import { leaveRoomsNoLongerAllowed } from '../server/roomAccess'
import { recordActivity } from '../server/dashboard/activity'
import { projectTasksBoardCreate } from './boardColumns'
import { startingRoster } from './personalProject'
import { Logger } from '../server/utils/logger'
import { displaySiteName } from '../shared/siteName'
import { upgradeSide } from '../sites/siteStanding'
import { closeTaskThreads, declineWaitingInThreads } from '../conversations/taskThread/lifecycle'
import { profileForNewProject } from '../billing/profiles'
import { deletePlaceRecordsOf } from '../secrets/placeDeletion'
import { projectSkillErasure } from './projectSkillErase'
import { removeTaskAttachmentFolders } from './taskAttachmentFiles'

const logger = new Logger('Projects')

export * from './boardService'
export * from './taskService'
export * from './taskStateService'
export * from './sprintService'
export * from './taskPlanService'
export * from './agentAssignment'

// ── Projects ──────────────────────────────────────────────────────────────────

/**
 * `executionSiteId` is required, not optional. A project's workspace is real
 * bytes on one machine's disk, so a project that names no site is not a valid
 * project — and making it optional here meant the MCP `create_project` tool
 * silently created one, which no test caught. Required means the compiler
 * catches the next caller that forgets, which a test never would.
 *
 * Callers with a user's explicit pick pass that; callers with no picker to
 * offer (workforce templates, MCP) pass `requireDefaultExecutionSiteId()`, which
 * fails with the shared "No Execution Site is connected" error when there is none.
 */
/**
 * No project may be left without an admin (spec §6.4), so one is appointed at
 * creation. The person who created it, where there is one; otherwise the org's
 * admin, for the paths that run with nobody behind them.
 */
async function appointFirstProjectAdmin(projectId: string, createdByUserId?: string): Promise<void> {
  let userId = createdByUserId
  if (!userId) {
    const orgAdmin = await prisma.userSettings.findFirst({
      where: { role: 'ADMIN' },
      select: { userId: true },
      orderBy: { userId: 'asc' },
    })
    userId = orgAdmin?.userId
  }
  if (!userId) {
    // Reachable only before the org has an admin at all. Refusing keeps §6.4's
    // "no project may be left without a project admin" unqualified; returning
    // quietly would have made it a rule with an exception nobody could see.
    throw new HttpError(400, 'A project cannot be created before the organisation has an admin')
  }
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, role: 'ADMIN' },
    update: { role: 'ADMIN' },
  })
}

export async function createProject(params: {
  name: string
  description?: string
  productId?: string
  programId?: string
  defaultAgentId?: string
  key?: string
  executionSiteId: string | undefined
  /** The person creating it, who becomes its first admin (spec §6.4). Absent for
   *  the paths with no person behind them — onboarding's seed and the
   *  workforce assembly board — where the org's admin is appointed instead. */
  createdByUserId?: string
  /** Makes it a personal project of this person (not their space): private, with them as its one member, no slug. */
  personalOwnerId?: string
  /** A shared project's billing profile, as its creator picked it; the default when absent (billing/profiles.ts). */
  billingProfileId?: string
}) {
  const checkedName = checkedProjectName(params.name)
  const checkedDescription = checkedProjectDescription(params.description) ?? undefined
  if (!params.executionSiteId) {
    throw new HttpError(400, 'Pick an Execution Site to create the project on')
  }
  const site = await prisma.executionSite.findUnique({
    where: { id: params.executionSiteId },
    select: { id: true, label: true, isDefault: true, status: true, protocolVersion: true },
  })
  if (!site) {
    throw new HttpError(400, 'That Execution Site does not exist')
  }
  if (site.status === 'REVOKED') {
    throw new HttpError(400, `Execution Site "${displaySiteName(site)}" is revoked and cannot accept new projects`)
  }
  if (
    site.status === 'VERSION_MISMATCH' ||
    (site.protocolVersion && !checkProtocolCompatibility(SITE_PROTOCOL_VERSION, site.protocolVersion).ok)
  ) {
    throw new HttpError(
      400,
      `Execution Site "${displaySiteName(site)}" is suspended on a protocol mismatch (runs protocol ${site.protocolVersion ?? 'unknown'}, ` +
        `HQ speaks ${SITE_PROTOCOL_VERSION}); upgrade ${upgradeSide(site.protocolVersion) === 'hq' ? 'HQ' : 'the site'}`,
    )
  }

  // A personal project names no slug: a slug taken would tell another person the name was in use.
  const personalOwnerId = params.personalOwnerId
  // The name's slug is numbered to a free one, so a second project named alike (or named in no Latin letters, which all give
  // the same slug) is made, not refused.
  const reserved = personalOwnerId ? null : reservedSlugRefusal(deriveSlug(checkedName))
  if (reserved) throw new HttpError(400, reserved)
  const takenSlugs = personalOwnerId ? [] : (await prisma.project.findMany({ where: { slug: { not: null } }, select: { slug: true } })).flatMap(p => p.slug ?? [])
  const slug = personalOwnerId ? null : deriveSlug(checkedName, takenSlugs)

  const existingKeys = (await prisma.project.findMany({ select: { key: true } })).map(p => p.key)
  if (params.key !== undefined && typeof params.key !== 'string') {
    throw new HttpError(400, 'Project key must be 2–6 uppercase letters')
  }
  const key = params.key
    ? params.key.toUpperCase()
    : deriveProjectKey(checkedName, [...existingKeys, ...RESERVED_PROJECT_KEYS])
  if (RESERVED_PROJECT_KEYS.includes(key)) throw new HttpError(400, reservedKeyRefusal(key))

  if (!/^[A-Z]{2,6}$/.test(key)) {
    throw new HttpError(400, 'Project key must be 2–6 uppercase letters')
  }
  if (existingKeys.includes(key)) {
    throw new HttpError(409, `Project key "${key}" is already in use`)
  }

  // A person's own project is always billed to the default, so it names none (part 5).
  const billingProfileId = personalOwnerId ? null : await profileForNewProject(params.billingProfileId)

  // Named fields only: the id is generated, and the project's folders are built from it (spec §4.28).
  const { productId, programId, defaultAgentId, executionSiteId } = params
  const name = checkedName
  const description = checkedDescription
  // Made with its Project Tasks, so work has somewhere to go from the start (adr-0097).
  const project = await prisma.project.create({
    data: {
      name, description, productId, programId, defaultAgentId, executionSiteId, slug, key, billingProfileId,
      ...(personalOwnerId ? { accessLevel: 'PRIVATE' as const, personalOwnerId, ...(await startingRoster()) } : {}),
      boards: { create: projectTasksBoardCreate() },
    },
  }).catch((err: unknown) => {
    // Two creates racing past the checks above meet the unique columns: the loser is told so, not given a 500.
    if ((err as { code?: string } | null)?.code === 'P2002') {
      throw new HttpError(409, 'Another project was made with that name or key a moment ago. Try again.')
    }
    throw err
  })
  await appointFirstProjectAdmin(project.id, personalOwnerId ?? params.createdByUserId)
  // Provision the project's files/ home with ROADMAP.md bootstrap (ADR-0039 §1 + ADR-0031).
  // Keyed by immutable project id — the files/ dir replaces the old projects/{slug} working dir.
  //
  // The row is already committed, and both `slug` and `key` are unique, so a
  // failed provisioning that left it behind would burn this project's name
  // permanently: the files would not exist and every retry would collide on
  // the constraint. Compensate — the id the seed is keyed by does not exist
  // until the insert does, so there is no ordering that avoids this. Same
  // shape as `workspaceService.createWorkspace`, including that the cleanup's
  // own failure is logged and never replaces the error that caused it.
  try {
    await provisionProjectFiles(project.id, project.name)
  } catch (err) {
    // Its Project Tasks goes first: a board holds its project.
    await prisma.board.deleteMany({ where: { projectId: project.id } })
      .then(() => prisma.project.delete({ where: { id: project.id } }))
      .catch((cleanupErr) => {
        logger.warn(
          `createProject: provisioning failed and the compensating delete of project ` +
            `${project.id} ("${project.name}", key ${key}) failed too — its name and key stay taken until ` +
            `it is removed by hand:`,
          cleanupErr,
        )
      })
    throw err
  }

  const fullCreate = await prisma.project.findUniqueOrThrow({
    where: { id: project.id },
    include: { tasks: { select: { status: true } }, agents: { select: { agentId: true } } },
  })
  // Not for a personal project: the activity feed is the organisation's, and a personal project is nobody else's to see.
  if (!personalOwnerId) recordActivity('project_created', `Project ${fullCreate.name} created`, fullCreate.id, fullCreate.id)
  triggerSnapshotPush()

  return project
}

export async function updateProject(params: {
  projectId: string
  name?: string
  description?: string
  productId?: string | null
  programId?: string | null
  defaultAgentId?: string | null
  key?: string
}) {
  // Named fields only, like createProject above: the params type is compile-time
  // and the client posts whatever it likes. Spreading would let `accessLevel`
  // through, past the project-admin gate setProjectAccessLevel applies to it,
  // and would carry nested relation writes into Prisma.
  const { projectId, productId, programId, defaultAgentId } = params
  requireId(projectId, 'project')
  const data: {
    name?: string
    description?: string | null
    productId?: string | null
    programId?: string | null
    defaultAgentId?: string | null
    key?: string
  } = {}
  if (params.name !== undefined) data.name = checkedProjectName(params.name)
  const description = checkedProjectDescription(params.description)
  if (description !== undefined) data.description = description
  const checkedProduct = checkedLinkId(productId, 'product')
  if (checkedProduct !== undefined) data.productId = checkedProduct
  const checkedProgram = checkedLinkId(programId, 'programme')
  if (checkedProgram !== undefined) data.programId = checkedProgram
  const checkedAgent = checkedLinkId(defaultAgentId, 'agent')
  if (checkedAgent !== undefined) data.defaultAgentId = checkedAgent
  if (params.key !== undefined) {
    if (typeof params.key !== 'string') throw new HttpError(400, 'Project key must be 2–6 uppercase letters')
    data.key = params.key
  }

  if (data.key !== undefined) {
    const taskCount = await prisma.task.count({ where: { projectId } })
    if (taskCount > 0) {
      throw new HttpError(400, 'Project key cannot be changed once tasks exist')
    }
    const newKey = data.key.toUpperCase()
    if (!/^[A-Z]{2,6}$/.test(newKey)) {
      throw new HttpError(400, 'Project key must be 2–6 uppercase letters')
    }
    const collision = await prisma.project.findFirst({ where: { key: newKey, id: { not: projectId } } })
    if (collision) {
      throw new HttpError(409, `Project key "${newKey}" is already in use`)
    }
    data.key = newKey
  }

  const updated = await prisma.project.update({ where: { id: projectId }, data })

  triggerSnapshotPush()

  return updated
}

/** `alsoInTransaction` commits or rolls back with the delete — used to hold the site's instruction (heldInstructions.ts). */
export async function deleteProject(
  projectId: string,
  alsoInTransaction?: (tx: Prisma.TransactionClient) => Promise<unknown>,
) {
  let closedThreads: string[] = []
  const taskIds = (await prisma.task.findMany({ where: { projectId }, select: { id: true } })).map(t => t.id)
  await prisma.$transaction(async (tx) => {
    await alsoInTransaction?.(tx)
    closedThreads = await closeTaskThreads(tx, { projectId }, 'PROJECT_DELETED')
    // Its tasks' conversations go with them (sessions/taskSessionDeletion.ts), never left without a project.
    await tx.agentSession.deleteMany({ where: taskSessionsWhere({ projectId }) })
    await tx.task.deleteMany({ where: { projectId } })
    await tx.board.deleteMany({ where: { projectId } })
    // A project's model list is keyed by its id, not a relation, so it cascades from nothing.
    await tx.modelList.deleteMany({ where: { owner: 'project', ownerId: projectId } })
    await Promise.all(deletePlaceRecordsOf(tx, [{ type: 'project', id: projectId }]))
    await projectSkillErasure(tx, projectId)
    await tx.project.delete({ where: { id: projectId } })
  })
  await removeTaskAttachmentFolders(taskIds)
  await declineWaitingInThreads(closedThreads)
  triggerSnapshotPush()
  void leaveRoomsNoLongerAllowed()
}
