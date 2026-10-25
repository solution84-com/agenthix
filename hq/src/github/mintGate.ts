/**
 * The mint gate (workflows spec part 4, *The mint gate*; adr-0147, ADR-0060): every installation token hq mints
 * passes these checks, here and in `mintGateConnect.ts` for a repository being connected. Nothing else asks GitHub
 * for an installation token.
 *
 * 1. The repository comes from the location's own connection, looked up by its workspace id on the site that holds
 *    it — never from a URL or anything the caller sends.
 * 2. The connection belongs to the place, and the place may connect to its GitHub account: allowed, and the account's
 *    rule still includes the place, asked at every mint.
 * 3. Accounts and repositories are matched by GitHub's ids. A connection without them is refused.
 * 4. Nothing here knows of agents: no agent, the built-in one included, gets past a check.
 * 5. Minted fresh, never cached, with exactly the permissions asked for and `repository_ids` for that one repository.
 * 6. A mint always names its permissions: GitHub gives a token asked for with none every permission the App holds.
 */
import { HttpError } from 'wasp/server'
import {
  GITHUB_PERMISSION_LEVELS, GITHUB_READ_ONLY_PERMISSIONS, isGitHubRepositoryPermission,
  type GitHubPermissions, type RepoAttachmentRow, type RepoAttachmentTarget,
} from '@agenthix/core'
import { placeStanding, type PlaceStanding, type WorkflowPlace } from '../workflows/placeAccess'
import { getRepoForTarget } from '../storage/workspaceStore'
import { findInstallation, personalProjectOf, ruleIncludesPlace, type PersonalProject, type RuledInstallation } from './connectRule'
import {
  GitHubTokenError, requestInstallationToken, revokeInstallationToken,
  type InstallationToken, type MintedRepository, type TokenAsk,
} from './installationTokens'

export type GateToken = {
  token: string
  expiresAt: Date
  repository: MintedRepository
  /** GitHub's installation id. */
  installationId: number
}

/** What the person acting must be able to do in the place: read it, or work in it. */
export type GateNeeds = 'read' | 'work'

export type GateDeps = {
  attachment(siteId: string, target: RepoAttachmentTarget): Promise<RepoAttachmentRow | null>
  installation(where: { installationId: number } | { id: string }): Promise<RuledInstallation | null>
  personalProject(place: WorkflowPlace): Promise<PersonalProject>
  standing(place: WorkflowPlace, userId: string): Promise<PlaceStanding>
  request(ask: TokenAsk): Promise<InstallationToken>
  revoke(token: string): Promise<boolean>
}

export const gateDeps: GateDeps = {
  attachment: getRepoForTarget,
  installation: findInstallation,
  personalProject: personalProjectOf,
  standing: placeStanding,
  request: requestInstallationToken,
  revoke: revokeInstallationToken,
}

const refuse = (status: number, message: string): never => {
  throw new HttpError(status, `${message} Nothing was changed.`)
}

/** Refuses an empty set, an unknown permission and an unknown level: never a default. */
export function requirePermissions(permissions: GitHubPermissions | null | undefined): GitHubPermissions {
  const entries = Object.entries(permissions ?? {})
  if (entries.length === 0) refuse(400, 'A GitHub token is minted only with the permissions it needs named; none were.')
  for (const [name, level] of entries) {
    if (!isGitHubRepositoryPermission(name)) refuse(400, `${name} is not a GitHub permission a repository's token can have.`)
    if (!(GITHUB_PERMISSION_LEVELS as readonly unknown[]).includes(level)) refuse(400, `${name} must be read or write.`)
    if (level === 'write' && GITHUB_READ_ONLY_PERMISSIONS.includes(name as never)) refuse(400, `GitHub grants ${name} only to read.`)
  }
  return Object.fromEntries(entries) as GitHubPermissions
}

export async function requirePerson(place: WorkflowPlace, userId: string, needs: GateNeeds, deps: GateDeps): Promise<void> {
  const standing = await deps.standing(place, userId)
  const ok = needs === 'read' ? standing !== 'none' : standing === 'administers' || standing === 'works'
  if (!ok) refuse(403, needs === 'read' ? 'This needs membership of this place.' : 'This needs the Member or Admin role in this place.')
}

/** The installation, allowed, still including the place. */
export async function requireInstallationFor(
  inst: RuledInstallation | null, place: WorkflowPlace, deps: GateDeps,
): Promise<RuledInstallation & { accountId: number }> {
  if (!inst) refuse(409, 'The GitHub account of this repository is no longer connected to HQ; an organisation administrator can connect it again on the GitHub page.')
  const i = inst as RuledInstallation
  if (i.rule.state !== 'ALLOWED') refuse(403, `HQ doesn't use the GitHub account ${i.accountLogin} until an organisation administrator allows it on the GitHub page.`)
  if (i.accountId === null) refuse(409, `HQ hasn't recorded GitHub's id for the account ${i.accountLogin} yet; an organisation administrator can refresh it on the GitHub page.`)
  if (!ruleIncludesPlace(i.rule, place, await deps.personalProject(place))) {
    refuse(403, `This place may not connect to the GitHub account ${i.accountLogin}; an organisation administrator can add it on the GitHub page.`)
  }
  return i as RuledInstallation & { accountId: number }
}

export async function mint(ask: TokenAsk, deps: GateDeps): Promise<InstallationToken> {
  try {
    return await deps.request(ask)
  } catch (err) {
    if (err instanceof GitHubTokenError) return refuse(502, `GitHub refused a token (${err.status}): ${err.message}`)
    throw err
  }
}

/** The token reaches exactly one repository, the one asked for, under the account asked for; otherwise it is ended. */
export async function requireOneRepository(
  t: InstallationToken, accountId: number, deps: GateDeps, repositoryId?: number,
): Promise<MintedRepository> {
  const [r, ...more] = t.repositories
  if (!r || more.length || r.ownerId !== accountId || (repositoryId !== undefined && r.id !== repositoryId)) {
    await deps.revoke(t.token).catch(() => false)
    refuse(502, 'GitHub answered with a token for another repository than the one asked for, so HQ ended it.')
  }
  return r
}

export type LocationMint = {
  /** The place the connection must belong to: the run's, or the location's owner. */
  place: WorkflowPlace
  /** The site that holds the location's storage. */
  siteId: string
  /** The workspace, or null for the owner's own files. */
  workspaceId: string | null
  /** The person acting, or the person an agent's run is for. */
  person: string
  needs: GateNeeds
  permissions: GitHubPermissions
}

/** A token for the repository a location is connected to. */
export async function mintForLocation(req: LocationMint, deps: GateDeps = gateDeps): Promise<GateToken> {
  const permissions = requirePermissions(req.permissions)
  await requirePerson(req.place, req.person, req.needs, deps)
  const target: RepoAttachmentTarget = req.workspaceId
    ? { ownerType: req.place.type, ownerId: req.place.id, workspaceId: req.workspaceId }
    : { ownerType: req.place.type, ownerId: req.place.id }
  const row = await deps.attachment(req.siteId, target)
  if (!row) return refuse(409, 'This location has no GitHub repository connected.')
  if (row.ownerType !== req.place.type || row.ownerId !== req.place.id || (row.workspaceId ?? null) !== req.workspaceId) {
    refuse(403, 'That repository is connected to another place.')
  }
  const { installationId, repositoryId, accountId } = row
  if (installationId == null || repositoryId == null || accountId == null) {
    return refuse(409, 'This repository was connected before HQ recorded GitHub\'s ids for it; a project administrator can disconnect it and connect it again.')
  }
  const inst = await requireInstallationFor(await deps.installation({ installationId }), req.place, deps)
  if (inst.accountId !== accountId) refuse(409, 'This repository\'s GitHub account is not the one it was connected with; a project administrator can connect it again.')
  const t = await mint({ installationId, permissions, repositoryIds: [repositoryId] }, deps)
  const repository = await requireOneRepository(t, accountId, deps, repositoryId)
  return { token: t.token, expiresAt: t.expiresAt, repository, installationId }
}

/** Ends a token where it was issued; true once GitHub has it ended. */
export async function revokeGateToken(token: string, deps: Pick<GateDeps, 'revoke'> = gateDeps): Promise<boolean> {
  return deps.revoke(token)
}
