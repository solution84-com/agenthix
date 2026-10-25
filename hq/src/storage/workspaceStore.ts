/**
 * hq's typed store over the site channel for Workspace + RepoAttachment rows
 * (plan 5c task 11). Every read/write below is a thin wrapper around
 * `siteChannelRegistry.request`, calling site's `workspace.*`/`repo.*`
 * handlers (site/src/server/hq/channelMethods.ts,
 * site/src/server/storage/workspaceRows.ts) — nothing here touches
 * `prisma.workspace`/`prisma.repoAttachment` directly, because those tables no
 * longer live in hq's database. Task 12 rewires every existing caller in this
 * module's direction; nothing is rewired yet — this file lands with tests only.
 *
 * Two addressing modes, matching the plan:
 *  - Owner-scoped calls take an explicit `logicalSiteId` — the caller already
 *    resolved which site to ask (a project's site, an agent's home site, or
 *    the default site via `requireDefaultSiteRef`,
 *    ../sites/localSite.ts). "Logical" means `SiteConfig.siteId`, the
 *    id the channel registry keys live connections by — not `ExecutionSite.id`.
 *  - Bare-id calls (`getWorkspace`, `setWorkspaceAllowedTools`,
 *    `deleteWorkspace`) resolve the site themselves, from `WorkspacePlacement`
 *    (schema.prisma) — that index is keyed by workspaceId and holds
 *    `ExecutionSite.id`, so resolving it into the logical siteId a channel
 *    request needs takes one extra `executionSite` lookup.
 *
 * A site that will not answer is never turned into `null` or an empty list —
 * that would make "the site is down" indistinguishable from "there is nothing
 * here", silently hiding data that still exists (SC-322). `offline`, `timeout`
 * AND `disconnected` all become `SiteUnreachableError`: `disconnected` is what
 * `PendingRequests.rejectAll` fires with the moment a live socket dies mid-request
 * (../sites/channel/pendingRequests.ts), which in practice is the most
 * common way a site goes away while hq is mid-read — far more often than a
 * clean `offline`/`timeout`. `disconnected` also fires for one momentary,
 * harmless case — `SiteChannelRegistry.add` rejecting in-flight requests on the
 * OLD socket when a site reconnects on a NEW one (../sites/channel/siteChannelRegistry.ts)
 * — but the site is still very much reachable there, so mapping that case to
 * "unreachable" too is a slight overstatement, not a wrong one: the caller sees
 * a transient unavailable rather than a crash, and the very next call succeeds
 * against the new connection. Any other channel failure (`handler_failed`,
 * `unknown_method`) propagates unchanged — those are this module's own bugs or
 * site's, not "the site is unreachable", and deserve to surface as what they are.
 */
import { prisma } from 'wasp/server'
import {
  SITE_DATA_METHODS,
  type SiteMethodName,
  type SiteMethodParams,
  type SiteMethodResult,
  type WorkspaceRow,
  type WorkspaceCapsRow,
  type WorkspaceNameRow,
  type WorkspaceOwnerType,
  type WorkspaceListByOwnerSelect,
  type RepoAttachmentGitHubIds,
  type RepoAttachmentRow,
  type RepoAttachmentSummaryRow,
  type RepoAttachmentTarget,
} from '@agenthix/core'
import { siteChannelRegistry, ChannelRequestFailed } from '../sites/channel'
import { displaySiteName } from '../shared/siteName'
import { upgradeSide } from '../sites/siteStanding'

/** ExecutionSite.status values that matter to the messages below — see schema.prisma. */
const REVOKED = 'REVOKED'
const VERSION_MISMATCH = 'VERSION_MISMATCH'

export type SiteUnavailableReason = 'offline' | 'revoked' | 'version_mismatch'

export class SiteUnreachableError extends Error {
  readonly revoked: boolean

  constructor(
    public readonly siteLabel: string,
    public readonly logicalSiteId: string,
    public readonly reason: SiteUnavailableReason = 'offline',
    public readonly protocolVersion: string | null = null,
  ) {
    super(messageFor(siteLabel, reason, protocolVersion))
    this.name = 'SiteUnreachableError'
    this.revoked = reason === 'revoked'
  }
}

function messageFor(label: string, reason: SiteUnavailableReason, version: string | null): string {
  switch (reason) {
    case 'revoked':
      return `Execution Site "${label}" has been revoked — its workspaces are unavailable`
    case 'version_mismatch': {
      // Not "until it reconnects": it is connected and refused, and stays so
      // until the side behind is upgraded. A missing header is recorded as
      // '', which must read as unknown rather than as a blank version.
      const known = version || null
      const until = upgradeSide(known) === 'hq' ? 'HQ is upgraded' : 'the site is upgraded'
      return known
        ? `Execution Site "${label}" runs protocol ${known}, which this HQ does not accept — its runs and workspaces are unavailable until ${until}`
        : `Execution Site "${label}" runs an incompatible protocol version, which this HQ does not accept — its runs and workspaces are unavailable until ${until}`
    }
    default:
      return `Execution Site "${label}" is unreachable — its runs and workspaces are unavailable until it reconnects`
  }
}

/** Maps an `ExecutionSite.status` value to the reason a `SiteUnreachableError` should carry. */
export function reasonFor(status: string | null): SiteUnavailableReason {
  if (status === REVOKED) return 'revoked'
  if (status === VERSION_MISMATCH) return 'version_mismatch'
  return 'offline'
}

export class WorkspaceNotPlacedError extends Error {
  constructor(public readonly workspaceId: string) {
    super(`Workspace ${workspaceId} has no Execution Site placement`)
    this.name = 'WorkspaceNotPlacedError'
  }
}

/**
 * A `WorkspacePlacement` row exists but the `ExecutionSite` it names is gone —
 * a deleted/renumbered row, not "never placed". Kept distinct from the plain
 * unplaced case (`getWorkspace` returning `null`, `WorkspaceNotPlacedError` on
 * a write) deliberately: silently treating a dangling index entry the same as
 * "no placement" would hide that the index itself is inconsistent, which is a
 * bug worth surfacing loudly rather than a normal not-yet-placed state.
 */
export class DanglingPlacementError extends Error {
  constructor(
    public readonly workspaceId: string,
    public readonly executionSiteId: string,
  ) {
    super(`Workspace ${workspaceId}'s placement points at Execution Site ${executionSiteId}, which no longer exists`)
    this.name = 'DanglingPlacementError'
  }
}

/**
 * Raised when `workspace.listByIds` answers with fewer rows than ids asked —
 * the §H6 tool intersection (capabilityService.ts) must never silently drop a
 * workspace's cap from the computation just because the site it asked didn't
 * have that row (wrong site addressed, or the row moved/was deleted without
 * hq's placement index noticing). Failing closed here is what makes that
 * impossible to do quietly: a partial answer throws instead of returning the
 * subset.
 */
export class WorkspacePlacementMismatchError extends Error {
  constructor(
    public readonly missingIds: string[],
    public readonly logicalSiteId: string,
  ) {
    super(
      `Execution Site ${logicalSiteId} did not return workspace(s) ${missingIds.join(', ')} — ` +
        `refusing to compute the §H6 tool intersection with a missing cap`,
    )
    this.name = 'WorkspacePlacementMismatchError'
  }
}

type SiteInfo = { label: string; status: string | null; protocolVersion: string | null }

/**
 * Looked up by logical siteId — the path an owner-scoped call takes when its
 * channel request fails, since it was never handed a label up front. The
 * `.catch` is deliberate: a database failure here must fall back to the raw
 * id, never replace the `SiteUnreachableError` the caller is about to see
 * with an unrelated Prisma error.
 */
async function siteInfoForLogicalSiteId(logicalSiteId: string): Promise<SiteInfo> {
  const site = await prisma.executionSite
    .findUnique({ where: { siteId: logicalSiteId }, select: { label: true, isDefault: true, status: true, protocolVersion: true } })
    .catch(() => null)
  return { label: site ? displaySiteName(site) : logicalSiteId, status: site?.status ?? null, protocolVersion: site?.protocolVersion ?? null }
}

/**
 * The one place every channel call funnels through. `knownSite` lets a caller
 * that already resolved the site's label/status (the bare-id functions, via
 * `resolvePlacement`) skip a redundant lookup on the unreachable path.
 */
async function request<M extends SiteMethodName>(
  logicalSiteId: string,
  method: M,
  params: SiteMethodParams<M>,
  knownSite?: SiteInfo,
): Promise<SiteMethodResult<M>> {
  try {
    return await siteChannelRegistry.request(logicalSiteId, method, params)
  } catch (err) {
    if (err instanceof ChannelRequestFailed && (err.code === 'offline' || err.code === 'timeout' || err.code === 'disconnected')) {
      const site = knownSite ?? (await siteInfoForLogicalSiteId(logicalSiteId))
      throw new SiteUnreachableError(site.label, logicalSiteId, reasonFor(site.status), site.protocolVersion)
    }
    throw err
  }
}

/**
 * `WorkspacePlacement.workspaceId -> siteId` holds `ExecutionSite.id`, not the
 * logical siteId a channel request needs — this resolves both the logical id
 * and the label/status a `SiteUnreachableError` would need, in one extra
 * lookup. Returns `null` ONLY for a genuinely unplaced workspace (no
 * `WorkspacePlacement` row at all); a placement row whose `ExecutionSite` has
 * since gone away throws `DanglingPlacementError` instead — see that class's
 * doc comment for why those two cases must not be conflated.
 */
export async function resolvePlacement(
  workspaceId: string,
): Promise<{ logicalSiteId: string; label: string; status: string | null; protocolVersion: string | null } | null> {
  const placement = await prisma.workspacePlacement.findUnique({
    where: { workspaceId },
    select: { siteId: true },
  })
  if (!placement) return null
  const site = await prisma.executionSite.findUnique({
    where: { id: placement.siteId },
    select: { siteId: true, label: true, isDefault: true, status: true, protocolVersion: true },
  })
  if (!site) throw new DanglingPlacementError(workspaceId, placement.siteId)
  return { logicalSiteId: site.siteId, label: displaySiteName(site), status: site.status, protocolVersion: site.protocolVersion }
}

// ── Owner-scoped ───────────────────────────────────────────────────────────

export function listWorkspacesByOwner(
  logicalSiteId: string,
  ownerType: WorkspaceOwnerType,
  ownerId: string,
  select: 'caps',
): Promise<WorkspaceCapsRow[]>
export function listWorkspacesByOwner(
  logicalSiteId: string,
  ownerType: WorkspaceOwnerType,
  ownerId: string,
  select: 'names',
): Promise<WorkspaceNameRow[]>
export function listWorkspacesByOwner(
  logicalSiteId: string,
  ownerType: WorkspaceOwnerType,
  ownerId: string,
  select?: undefined,
): Promise<WorkspaceRow[]>
export function listWorkspacesByOwner(
  logicalSiteId: string,
  ownerType: WorkspaceOwnerType,
  ownerId: string,
  select?: WorkspaceListByOwnerSelect,
): Promise<WorkspaceRow[] | WorkspaceCapsRow[] | WorkspaceNameRow[]> {
  return request(logicalSiteId, SITE_DATA_METHODS.workspaceListByOwner, { ownerType, ownerId, select })
}

/**
 * Fails CLOSED on a partial answer — see `WorkspacePlacementMismatchError`.
 * The §H6 intersection this feeds must never silently proceed one workspace
 * short of what it asked for.
 *
 * Deliberately unused by capabilityService's chat branch today: a chat's
 * candidate workspace set is usually one id whose owning site isn't
 * necessarily the run's own siteId (a product/program-owned workspace can be
 * anchored elsewhere), so that path resolves placement-addressed per id
 * (`getWorkspace`) instead of asking one site for a same-site batch. This
 * stays exported for the task-run shape 5d is expected to add — a batch read
 * against workspaces already known to share one site (e.g. a project's own
 * set, read by id rather than by owner) — and is exercised directly by
 * workspaceStore.test.ts in the meantime.
 */
export async function listWorkspacesByIds(logicalSiteId: string, ids: string[]): Promise<WorkspaceCapsRow[]> {
  const rows = await request(logicalSiteId, SITE_DATA_METHODS.workspaceListByIds, { ids, select: 'caps' })
  if (rows.length !== ids.length) {
    const found = new Set(rows.map((r) => r.id))
    const missing = ids.filter((id) => !found.has(id))
    throw new WorkspacePlacementMismatchError(missing, logicalSiteId)
  }
  return rows
}

export function listAllWorkspaces(logicalSiteId: string): Promise<WorkspaceRow[]> {
  return request(logicalSiteId, SITE_DATA_METHODS.workspaceList, {})
}

export function listAllRepos(logicalSiteId: string): Promise<RepoAttachmentSummaryRow[]> {
  return request(logicalSiteId, SITE_DATA_METHODS.repoList, {})
}

export function createWorkspace(
  logicalSiteId: string,
  params: { name: string; ownerType: WorkspaceOwnerType; ownerId: string },
): Promise<WorkspaceRow> {
  return request(logicalSiteId, SITE_DATA_METHODS.workspaceCreate, params)
}

export function getRepoForTarget(
  logicalSiteId: string,
  target: RepoAttachmentTarget,
): Promise<RepoAttachmentRow | null> {
  return request(logicalSiteId, SITE_DATA_METHODS.repoGetForTarget, target)
}

export function findRepoByUrl(logicalSiteId: string, repoUrl: string): Promise<RepoAttachmentRow | null> {
  return request(logicalSiteId, SITE_DATA_METHODS.repoFindByUrl, { repoUrl })
}

export function createRepo(
  logicalSiteId: string,
  params: { ownerType: WorkspaceOwnerType; ownerId: string; workspaceId: string | null; repoUrl: string } & Partial<RepoAttachmentGitHubIds>,
): Promise<RepoAttachmentRow> {
  return request(logicalSiteId, SITE_DATA_METHODS.repoCreate, params)
}

export async function deleteRepo(logicalSiteId: string, id: string): Promise<void> {
  await request(logicalSiteId, SITE_DATA_METHODS.repoDelete, { id })
}

// ── Bare-id (resolves the site via WorkspacePlacement) ─────────────────────

export async function getWorkspace(workspaceId: string): Promise<WorkspaceRow | null> {
  const placement = await resolvePlacement(workspaceId)
  if (!placement) return null
  return request(
    placement.logicalSiteId,
    SITE_DATA_METHODS.workspaceGet,
    { id: workspaceId },
    placement,
  )
}

export async function setWorkspaceAllowedTools(workspaceId: string, allowedTools: string[] | null): Promise<void> {
  const placement = await resolvePlacement(workspaceId)
  if (!placement) throw new WorkspaceNotPlacedError(workspaceId)
  await request(
    placement.logicalSiteId,
    SITE_DATA_METHODS.workspaceSetAllowedTools,
    { id: workspaceId, allowedTools },
    placement,
  )
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const placement = await resolvePlacement(workspaceId)
  if (!placement) throw new WorkspaceNotPlacedError(workspaceId)
  await request(
    placement.logicalSiteId,
    SITE_DATA_METHODS.workspaceDelete,
    { id: workspaceId },
    placement,
  )
}

/**
 * Owner-scoped delete — used ONLY as create-flow compensation
 * (workspaceService.ts's `createWorkspace`) when the site-side row was
 * created but hq's own `WorkspacePlacement` insert then failed: at that
 * point there is no placement row to resolve, so the bare-id `deleteWorkspace`
 * above cannot reach it. This calls the site directly with the siteId the
 * caller already used for the create, bypassing placement lookup entirely.
 * `workspace.delete` is idempotent site-side (workspaceRows.ts uses
 * `deleteMany`), so this is safe to call even if the create is later found
 * to have failed for an unrelated reason.
 */
export async function deleteWorkspaceAt(logicalSiteId: string, workspaceId: string): Promise<void> {
  await request(logicalSiteId, SITE_DATA_METHODS.workspaceDelete, { id: workspaceId })
}

// ── Placement index (hq is the ONLY writer of WorkspacePlacement) ──────────

/**
 * Records that `workspaceId` lives on `executionSiteId` (ExecutionSite.id).
 * Task 12's create flow calls this only after the site has confirmed the row
 * exists — recording placement first would let a lookup route a request to a
 * site that never actually created it. If this insert itself fails after that
 * site-side create succeeded, the workspace now exists somewhere hq cannot
 * find: the compensating action is the site's own idempotent `workspace.delete`
 * (Task 12 wires the retry/compensation; this function is only the write).
 * Without it, the workspace is invisible to hq forever — present on disk,
 * absent from every list.
 *
 * Uses `create`, not `upsert` or `createMany` with `skipDuplicates` — a
 * duplicate placement (the same workspaceId placed twice) is a bug the index
 * must surface loudly via the unique-constraint error, unlike `removePlacement`
 * below, where a redundant removal is an expected idempotent no-op.
 */
export async function recordPlacement(workspaceId: string, executionSiteId: string): Promise<void> {
  await prisma.workspacePlacement.create({ data: { workspaceId, siteId: executionSiteId } })
}

/**
 * Removes `workspaceId`'s placement row. Task 12's delete flow calls this only
 * after the site has confirmed the row is gone. If that confirmation never
 * arrives (the site call fails after this would have run), the compensating
 * action is site's own idempotent `workspace.delete` on a later retry — not a
 * placement row removed ahead of the site actually deleting anything.
 *
 * Uses `deleteMany`, not `delete` — a workspace with no placement row (already
 * removed, or never had one) is not an error here, deliberately asymmetric
 * with `recordPlacement`'s loud `create` above: a duplicate placement is a bug,
 * a redundant removal is just this function being idempotent.
 */
export async function removePlacement(workspaceId: string): Promise<void> {
  await prisma.workspacePlacement.deleteMany({ where: { workspaceId } })
}
