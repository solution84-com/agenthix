/**
 * RepoAttachment Service (ADR-0039)
 * =================================
 * GitHub linkage as a reusable attachment over a storage location — a workspace OR
 * an owner's files dir. One connect engine, two targets:
 *   init   — the location is the source of truth → create a NEW repo + push UP
 *   adopt  — the location is the source of truth → push UP to an EXISTING repo (consolidate)
 *   link   — the repo is the source of truth → pull DOWN into an empty location
 * Disconnect keeps the location + its files.
 *
 * Every function here takes the target's owning site's logical siteId as its
 * first parameter (plan 5c task 12) — the RepoAttachment row itself now lives
 * on that site, addressed over workspaceStore's channel wrapper, not hq's own
 * database. Callers resolve the siteId (a project's own site, or the local
 * site for other owner types — `../storage/ownerSite.ts`) before calling in.
 */
import type { LocationRef } from '@agenthix/core'
import { connectRepoOnSite, repoStateOnSite } from './repoWorkStore'
import { HttpError } from 'wasp/server'
import { parseRepo, toRepoSlug } from './github'
import { revokeGateToken, type GateToken } from '../github/mintGate'
import { mintForConnecting } from '../github/mintGateConnect'
import { checkConnect } from '../github/connectChecks'
import { createRepositoryFor, undoCreatedRepository } from '../github/connectNewRepository'
import type { WorkflowPlace } from '../workflows/placeAccess'
import * as store from './workspaceStore'
import { BRANDING, RepoWorkError, type RepoAttachmentTarget } from '@agenthix/core'

export type RepoTarget = LocationRef

/** Owner's-files targets must not send `workspaceId` on the wire at all — see workspaceStore.test.ts. */
function toRepoAttachmentTarget(t: RepoTarget): RepoAttachmentTarget {
  return t.workspaceId
    ? { ownerType: t.ownerType, ownerId: t.ownerId, workspaceId: t.workspaceId }
    : { ownerType: t.ownerType, ownerId: t.ownerId }
}

/** The RepoAttachment for a target (a workspace, or an owner's files when workspaceId is null). */
export async function getAttachment(logicalSiteId: string, t: RepoTarget) {
  return store.getRepoForTarget(logicalSiteId, toRepoAttachmentTarget(t))
}

/** Repo + content state for the UI panel. */
export async function getRepoState(
  logicalSiteId: string,
  t: RepoTarget,
): Promise<{ repoUrl: string | null; isGitRepo: boolean; hasFiles: boolean }> {
  const attachment = await getAttachment(logicalSiteId, t)
  const { isGitRepo, hasFiles } = await repoStateOnSite(logicalSiteId, t)
  return { repoUrl: attachment?.repoUrl ?? null, isGitRepo, hasFiles }
}

/** Resolve repoUrl for a target's Operations. null if no repo connected. */
export async function getRepoFor(logicalSiteId: string, t: RepoTarget): Promise<{ repoUrl: string } | null> {
  const attachment = await getAttachment(logicalSiteId, t)
  if (!attachment) return null
  return { repoUrl: attachment.repoUrl }
}

export interface ConnectParams {
  target: RepoTarget
  /**
   * `init` makes a new repository. `existing` connects one that is there: checked out into an empty location, or the
   * location's files pushed when the repository is empty or shares their history. `adopt` and `link` are `existing`,
   * kept for callers that send them.
   */
  mode: 'init' | 'existing' | 'adopt' | 'link'
  repoUrl?: string  // an existing repository's address
  name?: string     // the new repository's name, or an existing one's under the account
  /** The person connecting it, whom the mint gate checks. */
  userId: string
  /** hq's id for the GitHub account chosen; otherwise the mint gate's choice (`chooseConnectInstallation`). */
  installationId?: string | null
}

const refusal = (message: string) => new Error(`${message} Nothing was changed.`)

/**
 * Connect a repository to a target: creates the RepoAttachment and lands `.git` in the location, on the site that
 * holds it. Everything is checked before anything is created; if a step after creating a new repository fails, the
 * repository is deleted (or, when it can't be, named in the failure).
 */
export async function connectRepo(logicalSiteId: string, p: ConnectParams, deps: ConnectDeps = connectDeps): Promise<{ repoUrl: string; attachmentId: string }> {
  if (await deps.getAttachment(logicalSiteId, p.target)) throw refusal('This location already has a connected repository.')
  const place = { type: p.target.ownerType, id: p.target.ownerId }
  const isNew = p.mode === 'init'
  const checked = await deps.check({ place, person: p.userId, kind: isNew ? 'new' : 'existing', name: p.name, repoUrl: p.repoUrl, installationRowId: p.installationId })
  if (!checked.ok || !checked.account) throw new HttpError(checked.problem?.kind === 'choose_account' ? 409 : 422, checked.problem?.words ?? refusal('This repository can not be connected.').message)
  const account = { place, person: p.userId, installationRowId: checked.account.id, login: checked.account.login }

  const name = isNew ? toRepoSlug(p.name ?? '') : existingName(p)
  let created = false
  let token: GateToken | null = null
  try {
    let direction: 'push' | 'pull' = 'push'
    let newId: number | null = null
    if (isNew) {
      newId = (await deps.createRepository(account, name, `${BRANDING.displayName} storage: ${p.name ?? name}`)).id
      created = true
    } else {
      direction = (await deps.repoState(logicalSiteId, p.target)).hasFiles ? 'push' : 'pull'
    }
    token = await deps.mintForConnecting({ ...account, repositoryName: name, permissions: { contents: direction === 'push' ? 'write' : 'read' } })
    if (newId !== null && token.repository.id !== newId) throw new Error('GitHub answered another repository than the one just created. Nothing was pushed.')
    if (token.repository.fullName.toLowerCase() !== `${account.login}/${name}`.toLowerCase()) {
      throw refusal(`${account.login}/${name} is not a repository of the GitHub account chosen.`)
    }
    try {
      await deps.connectOnSite(logicalSiteId, p.target, direction, repoUrlOf(token), token.token)
    } catch (e) {
      if (e instanceof RepoWorkError && e.code === 'push_rejected') {
        throw new Error(`The repository ${token.repository.fullName} already has its own history, which the files in this location do not share, so nothing was pushed and nothing on GitHub was overwritten.`)
      }
      throw e
    }
    const attachment = await deps.createRow(logicalSiteId, {
      ownerType: p.target.ownerType, ownerId: p.target.ownerId, workspaceId: p.target.workspaceId ?? null, repoUrl: repoUrlOf(token),
      installationId: token.installationId, repositoryId: token.repository.id,
      accountId: token.repository.ownerId, accountLogin: token.repository.ownerLogin,
    })
    return { repoUrl: repoUrlOf(token), attachmentId: attachment.id }
  } catch (e) {
    if (!created) throw e
    const said = await deps.undo(account, name)
    const failure = e instanceof Error ? e.message.trim() : 'Connecting the repository failed.'
    throw new Error(`${/[.!?]$/.test(failure) ? failure : `${failure}.`} ${said}`)
  } finally {
    if (token) await deps.revoke(token.token)
  }
}

/** An existing repository's name: from its address, or as typed under the chosen account. */
function existingName(p: ConnectParams): string {
  if (p.repoUrl?.trim()) return parseRepo(p.repoUrl.trim()).name
  return (p.name ?? '').trim()
}

export type ConnectDeps = {
  getAttachment: typeof getAttachment
  check: typeof checkConnect
  repoState: typeof repoStateOnSite
  createRepository(account: { place: WorkflowPlace; person: string; installationRowId: string; login: string }, name: string, description: string): Promise<{ id: number }>
  mintForConnecting: typeof mintForConnecting
  connectOnSite: typeof connectRepoOnSite
  createRow: typeof store.createRepo
  undo: typeof undoCreatedRepository
  revoke(token: string): Promise<unknown>
}

export const connectDeps: ConnectDeps = {
  getAttachment, check: checkConnect, repoState: repoStateOnSite,
  createRepository: (a, name, description) => createRepositoryFor(a, name, description),
  mintForConnecting, connectOnSite: connectRepoOnSite, createRow: store.createRepo, undo: undoCreatedRepository,
  revoke: (t) => revokeGateToken(t).catch(() => false),
}

const repoUrlOf = (t: GateToken) => `https://github.com/${t.repository.fullName}`

/** Find the RepoAttachment for a GitHub owner/repo (normalised, .git-insensitive). */
export async function findAttachmentByRepoUrl(logicalSiteId: string, owner: string, repo: string) {
  const name = repo.replace(/\.git$/, '')
  return store.findRepoByUrl(logicalSiteId, `https://github.com/${owner}/${name}`)
}

/** Delete the RepoAttachment. The location + files remain. */
export async function disconnectRepo(logicalSiteId: string, t: RepoTarget): Promise<void> {
  const attachment = await getAttachment(logicalSiteId, t)
  if (!attachment) throw new Error('No repo is connected to this location.')
  await store.deleteRepo(logicalSiteId, attachment.id)
}
