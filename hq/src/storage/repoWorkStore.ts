/**
 * hq's typed store over the site channel for repository work in a storage
 * location. One function per `REPO_WORK_METHODS` entry
 * (core/src/protocol/repoWork.ts), calling the handlers at
 * `site/src/server/storage/repoWorkMethods.ts`. Every method name is read from
 * that constant, never re-typed as a string literal here.
 *
 * ## What stays on hq
 *
 * The GitHub side and the credential. hq creates or resolves the repository,
 * parses the URL and rebuilds it from its parts, and mints the installation
 * token; the site receives a URL and a token and runs git. Resolving the
 * credential on the site would need a credential store there, which is a
 * decision this work has not made and must not pre-empt.
 *
 * ## The `OnSite` suffix is load-bearing
 *
 * `repoAttachmentService.ts` already has `getRepoState` and `connectRepo`, and
 * those are the functions that check whether an attachment exists and write
 * the row. **Nothing here checks anything.** A caller must have applied
 * `assertLocationAccess` and the administer rule before it reaches this
 * module; the site holds no identity store and cannot check it for us
 * (ADR-0042).
 *
 * ## The site is passed in, not resolved here
 *
 * Unlike `locationFileStore.ts`, which resolves the site from the location,
 * every function here takes the logical siteId its caller already resolved —
 * the same shape `workspaceStore.ts`'s owner-scoped calls use. That caller
 * writes the `RepoAttachment` row to that site in the same breath, and a
 * second resolution could answer differently: the git and the row would then
 * land on different sites, which is the one failure this module can cause and
 * cannot detect.
 *
 * ## An unreachable site is never a quiet answer
 *
 * `offline`, `timeout` and `disconnected` become `SiteUnreachableError` — the
 * same class `workspaceStore.ts` raises, imported rather than redeclared.
 */
import { prisma } from 'wasp/server'
import {
  REPO_CONNECT_TIMEOUT_MS,
  REPO_WORK_METHODS,
  RepoWorkError,
  type RepoConnectDirection,
  type RepoConnectResult,
  type RepoStateResult,
  type StorageOwnerType,
  type LocationRef,
  type RepoWorkMethod,
  type SiteMethodParams,
  type SiteMethodResult,
} from '@agenthix/core'
import type { WorkspaceOwnerType } from '@prisma/client'
import { siteChannelRegistry, ChannelRequestFailed } from '../sites/channel'
import { SiteUnreachableError, reasonFor } from './workspaceStore'
import { recordError } from '../diagnostics/recordedErrors'
import { PUSH_REFUSED } from '../diagnostics/errorAdvice'
import { displaySiteName } from '../shared/siteName'

/**
 * Core cannot import this app's generated Prisma types, so the wire declares
 * its own owner vocabulary. Asserted in BOTH directions, for the reason
 * `locationFileStore.ts` sets out: a one-directional check passes while core
 * is missing an owner kind the schema has, which is the direction that breaks.
 *
 * The location SHAPE needs no such pin: hq no longer declares one of its own,
 * and the `LocationRef` imported above is core's.
 */
type _CoreCoversPrisma = WorkspaceOwnerType extends StorageOwnerType ? true : never
type _PrismaCoversCore = StorageOwnerType extends WorkspaceOwnerType ? true : never
const _ownerTypesAgree: [_CoreCoversPrisma, _PrismaCoversCore] = [true, true]
void _ownerTypesAgree

type SiteInfo = { label: string; status: string | null; protocolVersion: string | null }

/** Same shape and purpose as `workspaceStore.ts`'s and `locationFileStore.ts`'s own private helpers. */
async function siteInfoForLogicalSiteId(logicalSiteId: string): Promise<SiteInfo> {
  const site = await prisma.executionSite
    .findUnique({ where: { siteId: logicalSiteId }, select: { label: true, isDefault: true, status: true, protocolVersion: true } })
    .catch(() => null)
  return { label: site ? displaySiteName(site) : logicalSiteId, status: site?.status ?? null, protocolVersion: site?.protocolVersion ?? null }
}

/**
 * Exactly the four fields the wire declares, and nothing a caller's object
 * happened to be carrying beside them. hq's callers here hold repo targets;
 * site validates strictly and refuses an unexpected field.
 */
function toWireLocation(loc: LocationRef): LocationRef {
  return {
    ownerType: loc.ownerType,
    ownerId: loc.ownerId,
    workspaceId: loc.workspaceId ?? null,
    taskId: loc.taskId ?? null,
  }
}

async function translateFailure(logicalSiteId: string, method: string, err: unknown): Promise<never> {
  const code = err instanceof ChannelRequestFailed ? err.code : null
  if (code === 'offline' || code === 'timeout' || code === 'disconnected') {
    const site = await siteInfoForLogicalSiteId(logicalSiteId)
    throw new SiteUnreachableError(site.label, logicalSiteId, reasonFor(site.status), site.protocolVersion)
  }
  // The site's refusals arrive as one string with the code encoded into it, so
  // a caller can tell a rejected push from a missing binary without matching on
  // prose. Anything that is not one of ours is left alone.
  if (err instanceof Error) {
    const fromSite = RepoWorkError.fromWire(err.message)
    if (fromSite?.code === 'push_rejected') {
      void recordError({ origin: 'github', subject: logicalSiteId, advice: PUSH_REFUSED, siteId: logicalSiteId, detail: fromSite.detail })
    }
    if (fromSite) throw fromSite
  }
  throw err
}

async function request<M extends RepoWorkMethod>(
  logicalSiteId: string,
  loc: LocationRef,
  method: M,
  params: Omit<SiteMethodParams<M>, 'loc'>,
  timeoutMs?: number,
): Promise<SiteMethodResult<M>> {
  try {
    // `M` correlates the params with the method; TypeScript does not carry that through the spread.
    const sent = { loc: toWireLocation(loc), ...params } as SiteMethodParams<M>
    return await siteChannelRegistry.request(logicalSiteId, method, sent, timeoutMs)
  } catch (err) {
    return translateFailure(logicalSiteId, method, err)
  }
}

/** Is this location a git repository, and does it hold anything besides `.git`? */
export function repoStateOnSite(logicalSiteId: string, loc: LocationRef): Promise<RepoStateResult> {
  return request(logicalSiteId, loc, REPO_WORK_METHODS.state, {})
}

/**
 * Attach a repository to a location: `push` sends the location's files up to
 * it, `pull` brings it down into a location that must be empty.
 *
 * `token` is hq's installation token, borrowed by the site for this one call.
 * It travels in one direction: nothing the site sends back carries it, which
 * is a rule the site's own failure path enforces rather than a property of the
 * URLs this module happens to build.
 *
 * ## `REPO_CONNECT_TIMEOUT_MS` is a BACKSTOP, not the bound
 *
 * The channel's default is fifteen seconds, which is right for a row read and
 * far too short for a first push of a whole location. But a longer timer here
 * would not, on its own, stop anything: this channel has no cancel frame, so
 * when hq gives up it deletes its pending entry and the site never learns that
 * the caller has gone. The deadline that actually stops git is the site's, and
 * it is deliberately shorter (`REPO_CONNECT_SITE_BUDGET_MS`, declared beside
 * this one in core so the ordering is one decision rather than two).
 *
 * So reaching the timer below means the site stopped answering altogether — in
 * which case "unreachable" is the true diagnosis rather than a guess about a
 * git nobody stopped.
 */
export function connectRepoOnSite(
  logicalSiteId: string,
  loc: LocationRef,
  direction: RepoConnectDirection,
  repoUrl: string,
  token: string,
): Promise<RepoConnectResult> {
  return request(
    logicalSiteId,
    loc,
    REPO_WORK_METHODS.connect,
    { direction, repoUrl, token },
    REPO_CONNECT_TIMEOUT_MS,
  )
}
