/**
 * Workspace + RepoAttachment row access for the hq→site control channel
 * (plan 5c task 10). Plain functions over site's own prisma, one per
 * `channelMethods.ts` entry — hq is the only caller and it is trusted, but
 * params still arrive as `unknown` off the wire, so every function validates
 * its own shape the same defensive way hq's own data path does
 * (`hq/src/server/controlplane/dataApi.ts`: `z.object(...).safeParse`) rather
 * than trusting the JSON hq sent.
 *
 * Return values are plain Prisma rows — nothing here pre-serializes a Date.
 * `site.describe` calls `.toISOString()` on `startedAt` explicitly; this
 * module instead relies on `JSON.stringify`'s own Date coercion, which fires
 * inside the channel's `send` (hqConnection.ts) once a handler's result is
 * on its way back to hq — the same ISO-string wire shape, reached a
 * different way.
 */
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '#db'
import { SITE_DATA_METHODS, WORKSPACE_OWNER_TYPES, type OkResult } from '@agenthix/core'
import { canonicalGitHubRepoUrl } from './canonicalRepoUrl'
import { parseParams } from './locationContainment'
import { removeLocation } from './locationRemove'
import { removeWorkspaceServices } from '../livePreviews/services/previewServices'
import { dbServiceApprovals } from '../livePreviews/services/serviceApprovals'
import { cliServiceDocker, type ServiceDocker } from '../livePreviews/services/serviceDocker'
import { Logger } from '../utils/logger'

const logger = new Logger('workspaceRows')

/**
 * A workspace removed from this site: its live previews' services lose their approvals, and, where the site makes
 * containers, their volumes, which hold the services' data.
 */
export async function forgetWorkspaceServices(workspaceId: string, docker: ServiceDocker = cliServiceDocker): Promise<void> {
  await dbServiceApprovals.forgetWorkspace(workspaceId)
  if (process.env.AGENT_CONTAINER_ISOLATION !== 'true') return
  await removeWorkspaceServices(workspaceId, docker)
}

/** A row as core declares it: `allowedTools` holds only what `parseAllowedToolsShape` below lets through. */
type WithTools<T extends { allowedTools: Prisma.JsonValue }> = Omit<T, 'allowedTools'> & { allowedTools: string[] | null }
const withTools = <T extends { allowedTools: Prisma.JsonValue }>(row: T): WithTools<T> => row as WithTools<T>

const ownerTypeSchema = z.enum(WORKSPACE_OWNER_TYPES)
const idParams = z.object({ id: z.string().min(1) })
const emptyParams = z.object({})

// ── Workspace ──────────────────────────────────────────────────────────

export async function getWorkspace(params: unknown) {
  const { id } = parseParams(idParams, params, SITE_DATA_METHODS.workspaceGet)
  const row = await prisma.workspace.findUnique({ where: { id } })
  return row && withTools(row)
}

export async function listWorkspaces(params: unknown) {
  parseParams(emptyParams, params, SITE_DATA_METHODS.workspaceList)
  // hq's getMyStorage (queries.ts) depends on creation order to group and
  // display workspaces deterministically — Postgres gives no ordering
  // guarantee without one, which would make the Storage page's row order
  // flap between requests.
  return (await prisma.workspace.findMany({ orderBy: { createdAt: 'asc' } })).map(withTools)
}

const listByOwnerParams = z
  .object({
    ownerType: ownerTypeSchema,
    ownerId: z.string().min(1),
    select: z.enum(['caps', 'names']).optional(),
  })

export async function listWorkspacesByOwner(params: unknown) {
  const { ownerType, ownerId, select } = parseParams(listByOwnerParams, params, SITE_DATA_METHODS.workspaceListByOwner)
  if (select === 'caps') {
    return (await prisma.workspace.findMany({ where: { ownerType, ownerId }, select: { id: true, allowedTools: true } })).map(withTools)
  }
  if (select === 'names') {
    return prisma.workspace.findMany({ where: { ownerType, ownerId }, select: { id: true, name: true } })
  }
  return (await prisma.workspace.findMany({ where: { ownerType, ownerId } })).map(withTools)
}

const listByIdsParams = z
  .object({
    ids: z.array(z.string().min(1)),
    select: z.literal('caps'),
  })

export async function listWorkspacesByIds(params: unknown) {
  const { ids } = parseParams(listByIdsParams, params, SITE_DATA_METHODS.workspaceListByIds)
  return (await prisma.workspace.findMany({ where: { id: { in: ids } }, select: { id: true, allowedTools: true } })).map(withTools)
}

const createWorkspaceParams = z
  .object({
    // .trim() before .min(1): a whitespace-only name is refused (matches hq's
    // own `if (!name?.trim())` guard, actions.ts), and what's stored is the
    // trimmed name — not a copy carrying leading/trailing whitespace.
    name: z.string().trim().min(1),
    ownerType: ownerTypeSchema,
    ownerId: z.string().min(1),
  })

/** siteId is never a caller-supplied param — this installation's own SiteConfig.siteId
 *  fills it, matching the row's self-referential-by-design contract (schema.prisma).
 *  An unconfigured site (no SiteConfig row yet) cannot own rows, so it refuses. */
export async function createWorkspace(params: unknown) {
  const { name, ownerType, ownerId } = parseParams(createWorkspaceParams, params, SITE_DATA_METHODS.workspaceCreate)
  const config = await prisma.siteConfig.findFirst()
  if (!config) throw new Error('This site has no SiteConfig — cannot create a workspace until it is configured')
  return withTools(await prisma.workspace.create({ data: { name, ownerType, ownerId, siteId: config.siteId } }))
}

const MAX_ALLOWED_TOOLS = 200

/** Shape-only mirror of hq's parseAllowedToolsInput (allowedToolsService.ts): null
 *  clears the cap, a string array caps it, anything else — including the legacy
 *  ToolPermission[] object shape — is refused rather than silently written. The
 *  tool-name catalogue check does NOT live here: that vocabulary is hq's
 *  (listKnownToolNames), so site only guards the JSON shape it stores. */
function parseAllowedToolsShape(value: unknown): string[] | null {
  if (value === null) return null
  if (!Array.isArray(value)) throw new Error('allowedTools must be null or a list of tool names')
  if (value.length > MAX_ALLOWED_TOOLS) throw new Error(`allowedTools cannot have more than ${MAX_ALLOWED_TOOLS} entries`)
  const names = value.map((v) => {
    if (typeof v !== 'string' || v.trim() === '') throw new Error('allowedTools entries must be tool names (strings)')
    return v.trim()
  })
  return [...new Set(names)]
}

// `z.union([z.null(), z.array(...)])`, not `z.unknown()`: `unknown` accepts
// `undefined` too, so an absent `allowedTools` key would otherwise sail
// through zod and only fail inside parseAllowedToolsShape with a generic
// "must be null or a list" message — indistinguishable from a genuinely
// wrong-shaped value. The union makes a missing key its own zod "Required"
// error; entry-level validation (tool names, max length) still happens below.
const setAllowedToolsParams = z
  .object({ id: z.string().min(1), allowedTools: z.union([z.null(), z.array(z.unknown())]) })

export async function setWorkspaceAllowedTools(params: unknown): Promise<OkResult> {
  const { id, allowedTools } = parseParams(setAllowedToolsParams, params, SITE_DATA_METHODS.workspaceSetAllowedTools)
  const parsed = parseAllowedToolsShape(allowedTools)
  const ws = await prisma.workspace.findUnique({ where: { id }, select: { id: true } })
  if (!ws) throw new Error('Workspace not found')
  await prisma.workspace.update({
    where: { id },
    data: { allowedTools: parsed === null ? Prisma.JsonNull : parsed },
  })
  return { ok: true }
}

/** Idempotent by design — hq's own sequence (the row itself, then
 *  WorkspacePlacement, workspaceService.ts) lives hq-side;
 *  deleting an id that isn't here (already gone, or never was) is not an error.
 *  The workspace's folder goes with its row, as the screen says: a folder that cannot be removed is logged, not
 *  failed, since the row is already gone and a retry would not find the owner to remove it by. */
export async function deleteWorkspace(params: unknown): Promise<OkResult> {
  const { id } = parseParams(idParams, params, SITE_DATA_METHODS.workspaceDelete)
  const row = await prisma.workspace.findUnique({ where: { id }, select: { ownerType: true, ownerId: true } })
  await prisma.workspace.deleteMany({ where: { id } })
  if (row) {
    await removeLocation({ loc: { ownerType: row.ownerType, ownerId: row.ownerId, workspaceId: id } })
      .catch(err => logger.warn(`The folder of removed workspace ${id} was not removed: ${err instanceof Error ? err.message : String(err)}`))
  }
  await forgetWorkspaceServices(id).catch(err => logger.warn(`The services' volumes of removed workspace ${id} were not all removed: ${err instanceof Error ? err.message : String(err)}`))
  return { ok: true }
}

// ── RepoAttachment ─────────────────────────────────────────────────────

const getForTargetParams = z
  .object({
    ownerType: ownerTypeSchema,
    ownerId: z.string().min(1),
    workspaceId: z.string().min(1).nullable().optional(),
  })

/** Mirrors hq's getAttachment branches (repoAttachmentService.ts:20-23): a
 *  workspace target looks up by its unique workspaceId; an owner's-files
 *  target (no workspace) looks up by ownerType+ownerId with workspaceId null. */
export async function getRepoAttachmentForTarget(params: unknown) {
  const { ownerType, ownerId, workspaceId } = parseParams(getForTargetParams, params, SITE_DATA_METHODS.repoGetForTarget)
  const row = workspaceId
    ? await prisma.repoAttachment.findUnique({ where: { workspaceId } })
    : await prisma.repoAttachment.findFirst({ where: { ownerType, ownerId, workspaceId: null } })
  return row && repoAttachmentRow(row)
}

type StoredRepoAttachment = NonNullable<Awaited<ReturnType<typeof prisma.repoAttachment.findUnique>>>

/** GitHub's repository and account ids are stored as BigInt, which JSON can't carry; they fit a number exactly. */
function repoAttachmentRow(row: StoredRepoAttachment) {
  return {
    ...row,
    repositoryId: row.repositoryId == null ? null : Number(row.repositoryId),
    accountId: row.accountId == null ? null : Number(row.accountId),
  }
}

const findByUrlParams = z.object({ repoUrl: z.string().min(1) })

/** Rows linked before the canonical form was enforced keep whatever URL was pasted
 *  (http://, www., .git, SSH), so an exact-match lookup misses them. The database
 *  narrows to rows that mention owner/name in any spelling; the comparison that
 *  decides is on the canonical form, case-insensitive as GitHub itself is. */
export async function findRepoAttachmentByUrl(params: unknown) {
  const { repoUrl } = parseParams(findByUrlParams, params, SITE_DATA_METHODS.repoFindByUrl)
  const wanted = canonicalGitHubRepoUrl(repoUrl)
  if (!wanted) return null
  const ownerAndName = wanted.slice('https://github.com/'.length)
  const candidates = await prisma.repoAttachment.findMany({
    where: { repoUrl: { contains: ownerAndName, mode: 'insensitive' } },
  })
  const found = candidates.find(row => canonicalGitHubRepoUrl(row.repoUrl)?.toLowerCase() === wanted.toLowerCase())
  return found ? repoAttachmentRow(found) : null
}

export async function listRepoAttachments(params: unknown) {
  parseParams(emptyParams, params, SITE_DATA_METHODS.repoList)
  return prisma.repoAttachment.findMany({ select: { workspaceId: true, ownerType: true, ownerId: true, repoUrl: true } })
}

const createRepoAttachmentParams = z
  .object({
    ownerType: ownerTypeSchema,
    ownerId: z.string().min(1),
    workspaceId: z.string().min(1).nullable(),
    repoUrl: z.string().min(1),
    installationId: z.number().int().positive().nullable().optional(),
    repositoryId: z.number().int().positive().nullable().optional(),
    accountId: z.number().int().positive().nullable().optional(),
    accountLogin: z.string().min(1).nullable().optional(),
  })

export async function createRepoAttachment(params: unknown) {
  const p = parseParams(createRepoAttachmentParams, params, SITE_DATA_METHODS.repoCreate)
  return repoAttachmentRow(await prisma.repoAttachment.create({
    data: {
      ownerType: p.ownerType, ownerId: p.ownerId, workspaceId: p.workspaceId, repoUrl: p.repoUrl,
      installationId: p.installationId ?? null,
      repositoryId: p.repositoryId == null ? null : BigInt(p.repositoryId),
      accountId: p.accountId == null ? null : BigInt(p.accountId),
      accountLogin: p.accountLogin ?? null,
    },
  }))
}

export async function deleteRepoAttachment(params: unknown): Promise<OkResult> {
  const { id } = parseParams(idParams, params, SITE_DATA_METHODS.repoDelete)
  const existing = await prisma.repoAttachment.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw new Error('RepoAttachment not found')
  await prisma.repoAttachment.delete({ where: { id } })
  return { ok: true }
}

/** A deleted project's workspaces and repository links on this site. Their folders go with the project's own. */
export async function deleteProjectRows(projectId: string): Promise<void> {
  const workspaces = await prisma.workspace.findMany({ where: { ownerType: 'project', ownerId: projectId }, select: { id: true } })
  await prisma.repoAttachment.deleteMany({ where: { ownerType: 'project', ownerId: projectId } })
  await prisma.workspace.deleteMany({ where: { ownerType: 'project', ownerId: projectId } })
  for (const { id } of workspaces) {
    await forgetWorkspaceServices(id).catch(err => logger.warn(`The services' volumes of removed workspace ${id} were not all removed: ${err instanceof Error ? err.message : String(err)}`))
  }
}
