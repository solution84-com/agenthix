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
import { getTokenFor } from '../github/githubApp'
import type { LocationRef } from '@agenthix/core'
import { connectRepoOnSite, repoStateOnSite } from './repoWorkStore'
import { createGitHubRepo, installRepoUrl, parseRepo, toRepoSlug } from './github'
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
  mode: 'init' | 'adopt' | 'link'
  repoUrl?: string  // required for link
  name?: string     // for init/adopt repo naming
}

/**
 * Connect a repo to a target. Creates the RepoAttachment; lands `.git` in the
 * location, on the site that holds it.
 *
 * **`init` and `adopt` can orphan a repository on GitHub, and nothing here
 * prevents it.** `createGitHubRepo`/`installRepoUrl` creates real, external
 * state before the git can run, and the name it takes is unique per
 * installation — so a failure after that point leaves a repository nobody
 * asked for, under a name the same request can never reuse.
 *
 * A reachability probe was tried here and removed: `getAttachment` on the line
 * above is ALREADY a channel round trip to the same site, milliseconds
 * earlier, so a site that is simply down fails before anything is created
 * either way. A second probe bought no window at all and read as protection it
 * was not providing.
 *
 * What is left is the genuine case — the site is reachable when asked and the
 * push then fails, because it went down mid-call or because git did — and that
 * is unmitigated. Closing it needs either a compensating delete (a GitHub App
 * permission this code does not establish it has) or creating the repository
 * after a successful push, which `init` cannot do because the push needs
 * somewhere to go.
 */
export async function connectRepo(logicalSiteId: string, p: ConnectParams): Promise<{ repoUrl: string; attachmentId: string }> {
  if (await getAttachment(logicalSiteId, p.target)) throw new Error('This location already has a connected repo.')
  let repoUrl: string

  if (p.mode === 'init' || p.mode === 'adopt') {
    const repoName = toRepoSlug(p.name || `${p.target.ownerType}-${p.target.ownerId.slice(0, 8)}`)
    // init creates a new repo; adopt pushes to the existing one of that name (consolidate).
    repoUrl = p.mode === 'init'
      ? await createGitHubRepo(repoName, `${BRANDING.displayName} storage: ${p.name ?? repoName}`)
      : await installRepoUrl(repoName)
    const { owner, name } = parseRepo(repoUrl)
    try {
      await connectRepoOnSite(logicalSiteId, p.target, 'push', repoUrl, await getTokenFor({ owner, name }))
    } catch (e) {
      // Adopt is git-safe: a non-fast-forward push (the existing repo has diverging content) is
      // rejected by git, and the site reports that as a code rather than as prose — so this
      // message no longer depends on git's own wording surviving the trip.
      if (p.mode === 'adopt' && e instanceof RepoWorkError && e.code === 'push_rejected') {
        throw new Error(`The repository "${name}" already has content that would be overwritten. Use a different name to create a new repo, or resolve it on GitHub first.`)
      }
      throw e
    }
  } else {
    if (!p.repoUrl?.trim()) throw new Error('A repository URL is required')
    // Parsed before anything else, and git is given the URL rebuilt from the parts,
    // never the client's string (spec §4.26).
    const { owner, name } = parseRepo(p.repoUrl.trim())
    repoUrl = `https://github.com/${owner}/${name}`
    if ((await repoStateOnSite(logicalSiteId, p.target)).hasFiles) {
      throw new Error('This location already has files. Linking would overwrite them.')
    }
    await connectRepoOnSite(logicalSiteId, p.target, 'pull', repoUrl, await getTokenFor({ owner, name }))
  }

  const attachment = await store.createRepo(logicalSiteId, {
    ownerType: p.target.ownerType, ownerId: p.target.ownerId, workspaceId: p.target.workspaceId ?? null, repoUrl,
  })
  return { repoUrl, attachmentId: attachment.id }
}

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
