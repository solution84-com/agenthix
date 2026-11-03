/**
 * Storage Actions (ADR-0039)
 * createWorkspace — bare workspace (no repo); headless forced to the requesting user.
 * connectRepo / disconnectRepo — GitHub over a target (a workspace or an owner's files).
 * deleteWorkspace — remove a workspace (RepoAttachment cascades).
 */
import { HttpError, prisma } from 'wasp/server'
import type { WorkspaceOwnerType } from '@prisma/client'
import { createWorkspace, deleteWorkspace } from './workspaceService'
import { connectRepo, disconnectRepo, type RepoTarget } from './repoAttachmentService'
import { parseAllowedToolsInput } from './allowedToolsService'
import { requireDefaultSiteRef } from '../sites/localSite'
import { resolveOwnerSiteId } from './ownerSite'
import * as store from './workspaceStore'
import { asHttp, rethrowLocationFileErrorAsHttp, rethrowSiteUnreachableAsHttp } from './httpErrors'
import { assertLocationAccess, type LocationUse } from './locationAccess'
import { requireProjectAdmin } from '../projects/membership'
import { checkConnect, type ConnectCheck } from '../github/connectChecks'
import { proposeStartersFor, type StarterOutcome } from '../github/connectStarters'
import { stopBranchesOfWorkspace } from '../branches/workspaceRemoval'

type Ctx = { user?: { id: string } }

export const createWorkspaceAction = async (
  { name, ownerType, ownerId }: { name: string; ownerType: WorkspaceOwnerType; ownerId: string },
  context: Ctx,
): Promise<{ workspaceId: string }> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  if (!name?.trim()) throw new HttpError(400, 'Workspace name is required')
  // A headless (user) workspace is always owned by the requesting user — never trust a client ownerId.
  const resolvedOwnerId = ownerType === 'user' ? context.user.id : ownerId
  // Creating a workspace inside a boundary is writing what that boundary owns.
  await assertLocationAccess({ ownerType, ownerId: resolvedOwnerId }, context.user.id, 'work')

  let siteRef: { id: string; siteId: string } | null
  if (ownerType === 'project') {
    const project = await prisma.project.findUnique({
      where: { id: resolvedOwnerId },
      select: { executionSite: { select: { id: true, siteId: true } } },
    })
    siteRef = project?.executionSite ?? null
    if (!siteRef) throw new HttpError(400, 'Project has no Execution Site')
  } else {
    // Non-project owners anchor to the default site until multi-site placement UI exists (plan 5c deferred list).
    siteRef = await requireDefaultSiteRef()
  }

  try {
    const ws = await createWorkspace({
      name, ownerType, ownerId: resolvedOwnerId,
      executionSiteId: siteRef.id, logicalSiteId: siteRef.siteId,
    })
    return { workspaceId: ws.id }
  } catch (err) {
    // Creating the workspace's directory is now an ask of the site, so this
    // boundary meets the site's own refusals as well as an unreachable one.
    rethrowLocationFileErrorAsHttp(err)
  }
}

/**
 * A project's repository attachments are its admin's (spec §6.4). Entitlement —
 * which assertLocationAccess already checked — says who may work in a project;
 * attaching a repository to it is administering it. A person's own storage is
 * their own, and needs nothing beyond that check.
 */
async function assertMayAdministerAttachment(target: RepoTarget, userId: string, what: string): Promise<void> {
  if (target.ownerType === 'project') {
    await requireProjectAdmin(target.ownerId, userId, what)
  }
}

/**
 * Applies the location access rule to a bare workspace id by resolving its owner
 * first. Used where the operation names only the workspace.
 */
export async function assertWorkspaceReachable(workspaceId: string, userId: string, use: LocationUse): Promise<void> {
  let ws
  try {
    ws = await store.getWorkspace(workspaceId)
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }
  if (!ws) throw new HttpError(404, 'Workspace not found')
  await assertLocationAccess({ ownerType: ws.ownerType, ownerId: ws.ownerId, workspaceId }, userId, use)
}

export type ConnectInput = {
  target: RepoTarget
  /** `init` is a new repository; `existing` (or the older `adopt`, `link`) one that is there. */
  mode: 'init' | 'existing' | 'adopt' | 'link'
  repoUrl?: string
  name?: string
  /** hq's id for the GitHub account chosen; the project's default when absent. */
  installationId?: string
}

/** Who may connect, and where: the same for the check and the connection. */
async function connectingContext(target: RepoTarget, userId: string, what: string): Promise<string> {
  // Outside the try: asHttp would rewrap its 403/404 as a generic 400.
  await assertLocationAccess(target, userId, 'work')
  await assertMayAdministerAttachment(target, userId, what)
  // Outside the try as well: asHttp would rewrap the shared 503 as a 400.
  const siteId = await resolveOwnerSiteId(target.ownerType, target.ownerId)
  if (!siteId) throw new HttpError(400, 'No Execution Site available for this owner')
  return siteId
}

/** What `connectRepoAction` would meet, asked before anything is created: the account, the name, the reach. */
export const checkConnectAction = async (input: Omit<ConnectInput, 'mode'> & { kind: 'new' | 'existing' }, context: Ctx): Promise<ConnectCheck> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await connectingContext(input.target, context.user.id, 'Connecting a repository')
  try {
    return await checkConnect({
      place: { type: input.target.ownerType, id: input.target.ownerId }, person: context.user.id,
      kind: input.kind, name: input.name, repoUrl: input.repoUrl, installationRowId: input.installationId,
    })
  } catch (err) {
    if (err instanceof HttpError) throw err
    throw asHttp(err)
  }
}

export const connectRepoAction = async (
  { target, mode, repoUrl, name, installationId }: ConnectInput,
  context: Ctx,
): Promise<{ repoUrl: string; starters: StarterOutcome }> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const siteId = await connectingContext(target, context.user.id, 'Connecting a repository')
  let connected: { repoUrl: string }
  try {
    connected = await connectRepo(siteId, { target, mode, repoUrl, name, userId: context.user.id, installationId })
  } catch (err) {
    if (err instanceof HttpError) throw err
    throw asHttp(err)
  }
  const starters = await proposeStartersFor({ type: target.ownerType, id: target.ownerId }, target.workspaceId ?? null)
  return { repoUrl: connected.repoUrl, starters }
}

export const disconnectRepoAction = async (
  { target }: { target: RepoTarget },
  context: Ctx,
): Promise<void> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  // Outside the try: asHttp would rewrap its 403/404 as a generic 400.
  await assertLocationAccess(target, context.user.id, 'work')
  await assertMayAdministerAttachment(target, context.user.id, 'Disconnecting a repository')
  const siteId = await resolveOwnerSiteId(target.ownerType, target.ownerId)
  if (!siteId) throw new HttpError(400, 'No Execution Site available for this owner')
  try {
    await disconnectRepo(siteId, target)
  } catch (err) {
    throw asHttp(err)
  }
}

export const deleteWorkspaceAction = async (
  { workspaceId }: { workspaceId: string },
  context: Ctx,
): Promise<void> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  // Only a workspace id arrives, so the owner has to be resolved before the
  // rule can be applied to it — otherwise any signed-in person destroys any
  // project's workspace.
  await assertWorkspaceReachable(workspaceId, context.user.id, 'work')
  try {
    // Its branches' agents stop and their copies go first (live preview spec, Defaults for review 5).
    await stopBranchesOfWorkspace(workspaceId, context.user.id)
    await deleteWorkspace(workspaceId)
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }
}

/**
 * §H6: sets a workspace's contribution to the run's tool-intersection cap.
 * Someone who works where the workspace is (adr-0102). Validated via parseAllowedToolsInput — a legacy ToolPermission[]
 * object shape is refused rather than silently written, since the mint (capabilityService)
 * reads this column as string[] and a mismatched shape would match no tool, locking
 * every tool to 'never' (5b-1 ledger 15).
 *
 * Null clears the cap. The write itself goes through the store (workspaceStore.ts) —
 * site's own `workspace.setAllowedTools` handler maps null to Prisma.JsonNull on its
 * own database; hq no longer touches that marker directly.
 */
export const setWorkspaceAllowedToolsAction = async (
  { workspaceId, allowedTools }: { workspaceId: string; allowedTools: unknown }, context: Ctx,
): Promise<void> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  if (!workspaceId) throw new HttpError(400, 'workspaceId is required')
  await assertWorkspaceReachable(workspaceId, context.user.id, 'work')
  try {
    const parsed = parseAllowedToolsInput(allowedTools)
    await store.setWorkspaceAllowedTools(workspaceId, parsed)
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }
}
