/**
 * Storage Queries (ADR-0039)
 */
import path from 'node:path'
import { HttpError } from 'wasp/server'
import { prisma } from 'wasp/server'
import type { WorkspaceRow, RepoAttachmentSummaryRow } from '@agenthix/core'
import { getRepoState, getAttachment, type RepoTarget } from './repoAttachmentService'
import { resolveOwnerSiteId } from './ownerSite'
import { askEverySite } from '../sites/combinedRead'
import * as store from './workspaceStore'
import { rethrowSiteUnreachableAsHttp, rethrowLocationFileErrorAsHttp, rethrowRepoWorkErrorAsHttp } from './httpErrors'
import { entitledProjectsFilter } from '../projects/membership'
import { assertLocationAccess } from './locationAccess'
import { listFilesOnSite, statFileOnSite, readFileOnSite } from './locationFileStore'
import { classifyFileContent, FILE_CONTENT_MAX_BYTES, type FileContent } from './fileContentService'

type Ctx = { user?: { id: string } }

/**
 * All storage this person may reach, grouped by owner: Personal, then each
 * project they are entitled to (ADR-0061 — two owner kinds; spec §6.4 — a
 * private project they are not on is not offered at all). Each group's files/
 * is implicit (the UI pins a Files row); workspaces are listed.
 *
 * A workspace belongs to whichever site holds it, and this listing belongs to
 * none of them, so it asks every site the organisation has and concatenates
 * what comes back: a project anchored to any site shows its workspaces here.
 *
 * A site that could not be asked costs its own workspaces and nothing else.
 * The listing does not fail — failing it would take everybody's storage page
 * away over one sleeping laptop — and it does not quietly show an owner with
 * no workspaces either, because "no workspaces" and "cannot ask" are different
 * facts. The groups themselves come from hq's own database and are true even
 * when no site answered at all; `unanswered` rides beside them and names the
 * sites whose workspaces are missing.
 */
export const getMyStorageQuery = async (_args: unknown, context: Ctx) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  // One question per site covering both reads, so a site that is asleep is
  // named once rather than twice, and the pair costs one deadline.
  const held = await askEverySite(async (site) => {
    const [workspaces, repos] = await Promise.all([
      store.listAllWorkspaces(site.siteId),
      store.listAllRepos(site.siteId),
    ])
    return { workspaces, repos, siteLabel: site.label }
  })
  const siteLabels = new Map(held.answers.map((a) => [a.siteId, a.value.siteLabel]))
  const workspaces: WorkspaceRow[] = held.answers.flatMap((a) => a.value.workspaces)
  const attachments: RepoAttachmentSummaryRow[] = held.answers.flatMap((a) => a.value.repos)
  // Only the projects this person is entitled to: an open one, or a private one
  // they are listed on (spec §6.4). Not Your space, which owns no storage — its
  // work is in their own, the "Personal" group. A personal project of theirs has its own.
  const projects = await prisma.project.findMany({
    where: { ...entitledProjectsFilter(context.user.id), personalSpace: false },
    select: { id: true, name: true, key: true },
  })
  const wsRepo = new Map(attachments.filter(a => a.workspaceId).map(a => [a.workspaceId as string, a.repoUrl]))
  const filesRepo = new Map(attachments.filter(a => !a.workspaceId).map(a => [`${a.ownerType}:${a.ownerId}`, a.repoUrl]))
  const wsByOwner = new Map<string, typeof workspaces>()
  for (const w of workspaces) {
    const k = `${w.ownerType}:${w.ownerId}`
    const arr = wsByOwner.get(k) ?? []
    arr.push(w)
    wsByOwner.set(k, arr)
  }

  const group = (ownerType: 'user' | 'project', ownerId: string, label: string, place: { key: string; name: string } | null = null) => ({
    key: `${ownerType}:${ownerId}`,
    label,
    ownerType,
    ownerId,
    /** The project's key (which its address uses) and name; null for the person's own space. */
    place,
    filesRepoUrl: filesRepo.get(`${ownerType}:${ownerId}`) ?? null,
    workspaces: (wsByOwner.get(`${ownerType}:${ownerId}`) ?? []).map(w => ({
      id: w.id, name: w.name, repoUrl: wsRepo.get(w.id) ?? null, siteLabel: siteLabels.get(w.siteId) ?? null,
    })),
  })

  // Two things own storage (ADR-0061).
  const groups = [
    group('user', context.user.id, 'Personal'),
    ...projects.map(p => group('project', p.id, `Project · ${p.name}`, { key: p.key, name: p.name })),
  ]
  return { groups, unanswered: held.unanswered }
}

/** A single workspace + its owner label, for the workspace root page. */
export const getWorkspaceQuery = async ({ workspaceId }: { workspaceId: string }, context: Ctx) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const { ws, attachment } = await (async () => {
    try {
      const ws = await store.getWorkspace(workspaceId)
      if (!ws) throw new HttpError(404, 'Workspace not found')
      // The row carries the owning project's name and key, its repo URL and its
      // tool cap, so reading it is reading what the boundary owns.
      await assertLocationAccess({ ownerType: ws.ownerType, ownerId: ws.ownerId, workspaceId }, context.user!.id, 'read')
      const attachment = await getAttachment(ws.siteId, { ownerType: ws.ownerType, ownerId: ws.ownerId, workspaceId: ws.id })
      return { ws, attachment }
    } catch (err) {
      rethrowSiteUnreachableAsHttp(err)
    }
  })()
  let ownerName = 'Unknown'
  // ownerKey: the owning project's key, used to root the workspace breadcrumb into
  // its project (/projects/:key/workspaces). Projects use key-based routes; other
  // owners have no such container page yet, so ownerKey stays null and the breadcrumb
  // falls back to the global Workspaces list.
  let ownerKey: string | null = null
  if (ws.ownerType === 'user') ownerName = 'Personal'
  else if (ws.ownerType === 'project') {
    const p = await prisma.project.findUnique({ where: { id: ws.ownerId }, select: { name: true, key: true } })
    ownerName = p?.name ?? 'Unknown'
    ownerKey = p?.key ?? null
  }
  const allowedTools = Array.isArray(ws.allowedTools) ? (ws.allowedTools as string[]) : null
  return { id: ws.id, name: ws.name, ownerType: ws.ownerType, ownerId: ws.ownerId, ownerName, ownerKey, repoUrl: attachment?.repoUrl ?? null, allowedTools }
}

/**
 * The entries directly under a location (or one directory inside it) for the
 * explorer.
 *
 * **The entitlement check comes before the ask.** A site cannot know whether
 * it happened — per ADR-0042 it holds no identity store, and a call made
 * before the check looks identical on the wire — so the ordering is the
 * security property, not a style preference. Nothing in
 * `./locationFileStore.ts` checks who is asking; this does, first.
 *
 * `.git` is dropped HERE rather than on the site. The site's listing stays
 * honest and complete — the repository-state probe is a caller that wants to
 * see it — and hiding a repository's own directory from a file browser is a
 * presentation rule, which belongs on the side that presents.
 *
 * COSMETIC, and only that. It keeps the entry out of a listing; it does not
 * make the directory unreachable, and is not meant to — `subPath: '.git'`
 * lists it and `filePath: '.git/config'` reads it, exactly as they did before
 * this crossed the channel. Nothing in there is a secret hq is keeping: a
 * remote URL never carries a token (`site/src/storage/repoOps.ts` passes
 * credentials through `GIT_ASKPASS`), and the caller is entitled to the
 * location either way. If
 * that ever stops being true, the answer is a rule on the site, not a longer
 * filter here.
 *
 * Containment is the site's: it resolves the path, symlinks and all, against
 * the location it was given and refuses anything that lands outside. hq does
 * not check it a second time in a weaker, lexical form.
 */
export const listLocationFilesQuery = async (
  { target, subPath }: { target: RepoTarget; subPath?: string },
  context: Ctx,
): Promise<{ entries: { name: string; isDir: boolean; size: number; modifiedAt: string }[] }> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await assertLocationAccess(target, context.user.id, 'read')
  try {
    const { entries } = await listFilesOnSite(target, subPath ?? null)
    return {
      entries: entries
        .filter(entry => entry.name !== '.git')
        .map(entry => ({ name: entry.name, isDir: entry.kind === 'directory', size: entry.size, modifiedAt: entry.modifiedAt })),
    }
  } catch (err) {
    rethrowLocationFileErrorAsHttp(err)
  }
}

/**
 * One file's content for the preview viewer, classified on hq and read from
 * the site that holds it.
 *
 * The size is asked for FIRST and the bytes only after: a file over the cap is
 * answered without reading it at all, rather than streaming a megabyte across
 * the channel in order to decide not to show it.
 *
 * The name is the one the caller addressed, not the one the site resolved: a
 * link is shown as the file the person asked for.
 */
export const getFileContentQuery = async (
  { target, filePath }: { target: RepoTarget; filePath: string },
  context: Ctx,
): Promise<FileContent> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await assertLocationAccess(target, context.user.id, 'read')
  const name = path.basename(filePath)
  try {
    const stat = await statFileOnSite(target, filePath)
    if (stat.size > FILE_CONTENT_MAX_BYTES) return { kind: 'too-large', name }
    return classifyFileContent(name, await readFileOnSite(target, filePath))
  } catch (err) {
    rethrowLocationFileErrorAsHttp(err)
  }
}

/** Repo + content state for a target (drives the GitHub panel). */
export const getRepoStateQuery = async (
  { target }: { target: RepoTarget },
  context: Ctx,
): Promise<{ repoUrl: string | null; isGitRepo: boolean; hasFiles: boolean }> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await assertLocationAccess(target, context.user.id, 'read')
  const siteId = await resolveOwnerSiteId(target.ownerType, target.ownerId)
  if (!siteId) throw new HttpError(400, 'No Execution Site available for this owner')
  try {
    return await getRepoState(siteId, target)
  } catch (err) {
    // The probe reads the site's disk now, so a refusal from the site is one
    // of the outcomes — an unreachable site is no longer the only way this
    // fails.
    rethrowRepoWorkErrorAsHttp(err)
  }
}
