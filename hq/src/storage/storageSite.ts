/**
 * Which logical site (`SiteConfig.siteId` space — the same space
 * `resolveExecutionSiteId` in `../server/identity/capabilityService.ts`
 * returns) holds one storage location. Three owner kinds, no fallback chain:
 * a workspace is placed by `WorkspacePlacement` (reused from
 * `workspaceStore.resolvePlacement`, not re-derived here); a project reads
 * its own `executionSiteId`, which is an error to be missing, not a case to
 * fall back from; a person's own storage has no such column at all, so this
 * is what gives it one — read from `UserStoragePlacement` if it exists,
 * written once at the default site the first time it doesn't.
 *
 * One error family out of this seam: whatever a lower layer raises
 * (`WorkspaceNotPlacedError`, `DanglingPlacementError`) is wrapped into
 * `HttpError(400, ...)` here, message preserved, so nothing above this
 * function needs to know those types exist to say "I cannot tell you where
 * this lives".
 */
import { HttpError, prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import type { LocationRef } from '@agenthix/core'
import { resolvePlacement, WorkspaceNotPlacedError, DanglingPlacementError } from './workspaceStore'
import { requireDefaultSiteRef } from '../sites/localSite'

export async function resolveStorageSite(loc: LocationRef): Promise<string> {
  // taskId wins over workspaceId when a caller sets both, the same precedence
  // the site's own `locationDir` applies (site/src/server/storage/paths.ts,
  // which owns the layout now that hq's copy is gone). The two are documented
  // as mutually exclusive, so neither branch order is reachable today — but two
  // functions stating opposite rules about one invariant is how the unreachable
  // case gets reached.
  if (!loc.taskId && loc.workspaceId) return resolveWorkspaceStorageSite(loc.workspaceId)
  if (loc.ownerType === 'project') return resolveProjectStorageSite(loc.ownerId)
  return ensureUserStoragePlacement(loc.ownerId)
}

async function resolveWorkspaceStorageSite(workspaceId: string): Promise<string> {
  let placement: Awaited<ReturnType<typeof resolvePlacement>>
  try {
    placement = await resolvePlacement(workspaceId)
  } catch (err) {
    if (err instanceof DanglingPlacementError) throw new HttpError(400, err.message)
    throw err
  }
  if (!placement) throw new HttpError(400, new WorkspaceNotPlacedError(workspaceId).message)
  return placement.logicalSiteId
}

// Split so a typo'd project id (no such project) and a real project with no
// site assigned yet don't read as the same failure — the first sends an
// operator to check the id, the second to the Execution Sites page.
async function resolveProjectStorageSite(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { executionSite: { select: { siteId: true } } },
  })
  if (!project) throw new HttpError(400, `Project ${projectId} not found`)
  if (!project.executionSite) throw new HttpError(400, `Project ${projectId} has no Execution Site`)
  return project.executionSite.siteId
}

/**
 * Reads a person's `UserStoragePlacement`, or creates one at the default site
 * (`requireDefaultSiteRef` — already both id spaces, no PK/logical hop needed
 * here) the first time there isn't one. With no Execution Site connected it
 * throws the shared error and writes nothing. The `findUnique` fast path skips
 * resolving a default site at all once a row exists. A genuine first-resolution
 * race is benign rather than a raw unique-constraint 500: the caller whose
 * create loses on the unique `userId` reads the winner's row back, so both
 * answer the winner's site, not whichever `local` each of them resolved.
 * (Prisma's `upsert` with a relation `select` is not a native `ON CONFLICT`,
 * and lost this race on a 2-CPU machine.)
 */
export async function ensureUserStoragePlacement(userId: string): Promise<string> {
  const existing = await prisma.userStoragePlacement.findUnique({
    where: { userId },
    select: { site: { select: { siteId: true } } },
  })
  if (existing) return existing.site.siteId

  const local = await requireDefaultSiteRef()

  try {
    const placement = await prisma.userStoragePlacement.create({
      data: { userId, siteId: local.id },
      select: { site: { select: { siteId: true } } },
    })
    return placement.site.siteId
  } catch (err) {
    // A simultaneous first resolution wrote it first: theirs stands.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err
    const placed = await prisma.userStoragePlacement.findUniqueOrThrow({
      where: { userId },
      select: { site: { select: { siteId: true } } },
    })
    return placed.site.siteId
  }
}

/**
 * The site holding the organisation's knowledge: placed on the default site the first time it is asked, as a
 * person's storage is, and never moved. Returns the site's logical `siteId`.
 */
export async function ensureOrgKnowledgePlacement(): Promise<string> {
  const select = { site: { select: { siteId: true } } } as const
  const existing = await prisma.orgKnowledgePlacement.findUnique({ where: { id: 'org' }, select })
  if (existing) return existing.site.siteId

  const local = await requireDefaultSiteRef()
  try {
    const placement = await prisma.orgKnowledgePlacement.create({ data: { siteId: local.id }, select })
    return placement.site.siteId
  } catch (err) {
    // A simultaneous first resolution wrote it first: theirs stands.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err
    return (await prisma.orgKnowledgePlacement.findUniqueOrThrow({ where: { id: 'org' }, select })).site.siteId
  }
}
