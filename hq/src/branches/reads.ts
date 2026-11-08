/**
 * What the workspace view reads (live preview spec, part 1): `main` and the open branches, a branch's changes and
 * commits, `main`'s versions, and a folder or a file of `main` or a branch. All read access: a project's Viewer
 * included. Read from the workspace's own repository on its site, never from a copy.
 */
import { HttpError, prisma } from 'wasp/server'
import {
  BRANCH_COMMITS_MAX, BRANCH_READ_METHODS, GIT_VERSIONS_MAX, BranchWorkError, isRepoPath, type BranchListResult, type GitRev,
} from '@agenthix/core'
import { siteCall } from './siteCalls'
import { mergeBaseOf, openBranchById, openBranches, type BranchWithCopies } from './branchRows'
import { reachWorkspace, requireUser, type ReachedWorkspace } from './workspaceAccess'
import { agentsWorking } from './working'
import { whoseOf, workAgents } from './whose'
import { asBranchHttp } from './refusals'
import { MERGE_CARD_TOOL, mergeCardKeyPrefix } from './mergeCardArgs'
import { mainVersionRev } from './versionReads'
import type {
  BranchChangesView, BranchCommitsView, BranchLineView, BranchRef, GitFileView, GitTreeView, MainVersionsView, WorkspaceBranchesView,
} from './views'

type Ctx = { user?: { id: string } | null }

/** How many of `main`'s versions one page holds. */
export const VERSIONS_PAGE = 50

async function listOf(ws: ReachedWorkspace, rows: readonly BranchWithCopies[]): Promise<BranchListResult> {
  const merged = rows.flatMap(r => { const base = mergeBaseOf(r); return base ? [{ branch: r.name, base }] : [] })
  return siteCall(ws.logicalSiteId, BRANCH_READ_METHODS.list, { workspace: ws.ref, merged })
}

export async function getWorkspaceBranches(args: { workspaceId: string }, context: Ctx): Promise<WorkspaceBranchesView> {
  const ws = await reachWorkspace(args?.workspaceId, requireUser(context), 'read')
  return asBranchHttp(async () => {
    const rows = await openBranches(ws.ref.workspaceId)
    let list: BranchListResult
    try {
      list = await listOf(ws, rows)
    } catch (err) {
      if (err instanceof BranchWorkError && err.code === 'not_repository') return { git: false, canAct: ws.canAct }
      throw err
    }
    const [whose, working, agents, previews, asked] = await Promise.all([
      whoseOf(rows), agentsWorking(ws.logicalSiteId, ws.ref, rows), workAgents(rows), livePreviewsOf(rows.map(r => r.id)),
      mergesAskedOf(rows.map(r => r.id)),
    ])
    const branches: BranchLineView[] = rows.flatMap(r => {
      const w = whose.get(r.id)
      if (!w) return []
      const line = list.branches.find(l => l.name === r.name)
      const agent = working.get(r.id)
      return [{
        id: r.id, name: r.name, whose: w, agentName: agents.get(r.id) ?? null,
        working: agent ? { agentName: agent } : null,
        ahead: line?.ahead ?? 0, behind: line?.behind ?? 0,
        lastCommitAt: line?.lastCommit.at ?? null,
        livePreview: previews.get(r.id) ?? null,
        mergeAsked: asked.has(r.id) ? { agentName: agents.get(r.id) ?? 'An agent' } : null,
      }]
    })
    return { git: true, canAct: ws.canAct, main: { name: list.main.name, head: list.main.head, versionCount: list.main.versions }, branches }
  })
}

/** The ids of the branches an agent's merge request waits on (`mergeCard.ts`). */
async function mergesAskedOf(branchIds: string[]): Promise<Set<string>> {
  if (branchIds.length === 0) return new Set()
  const rows = await prisma.operation.findMany({
    where: {
      toolName: MERGE_CARD_TOOL, state: 'WAITING_FOR_APPROVAL',
      OR: branchIds.map(id => ({ idempotencyKey: { startsWith: mergeCardKeyPrefix(id) } })),
    },
    select: { idempotencyKey: true },
  })
  return new Set(branchIds.filter(id => rows.some(r => r.idempotencyKey?.startsWith(mergeCardKeyPrefix(id)))))
}

const PREVIEW_STATE = { STARTING: 'starting', RUNNING: 'running', PAUSED: 'paused' } as const

/** Each branch's live preview while it is live, by the branch's id. */
async function livePreviewsOf(branchIds: string[]): Promise<Map<string, NonNullable<BranchLineView['livePreview']>>> {
  const out = new Map<string, NonNullable<BranchLineView['livePreview']>>()
  if (branchIds.length === 0) return out
  const rows = await prisma.livePreview.findMany({
    where: { branchId: { in: branchIds }, state: { in: ['STARTING', 'RUNNING', 'PAUSED'] } },
    select: { id: true, branchId: true, state: true },
    orderBy: { openedAt: 'asc' },
  })
  for (const r of rows) {
    if (r.branchId && r.state !== 'STOPPED') out.set(r.branchId, { livePreviewId: r.id, state: PREVIEW_STATE[r.state] })
  }
  return out
}

async function branchIn(workspaceId: string, branchId: unknown): Promise<BranchWithCopies> {
  const b = await openBranchById(workspaceId, branchId)
  if (!b) throw new HttpError(404, 'That branch is not open any more. Reload to see where it stands.')
  return b
}

export async function getBranchChanges(args: { workspaceId: string; branchId: string }, context: Ctx): Promise<BranchChangesView> {
  const ws = await reachWorkspace(args?.workspaceId, requireUser(context), 'read')
  const b = await branchIn(ws.ref.workspaceId, args.branchId)
  return asBranchHttp(async () => {
    const changes = await siteCall(ws.logicalSiteId, BRANCH_READ_METHODS.changes, { workspace: ws.ref, branch: b.name, base: mergeBaseOf(b) })
    // The base is where the branch left main, or its last merge's version: one of main's versions, when it is.
    const at = mergeBaseOf(b)?.mergedVersion ?? changes.base
    const { versions } = await siteCall(ws.logicalSiteId, BRANCH_READ_METHODS.versions, { workspace: ws.ref, limit: GIT_VERSIONS_MAX, before: null })
    return { ...changes, baseVersion: versions.find(v => v.commit === at)?.number ?? null }
  })
}

export async function getBranchCommits(args: { workspaceId: string; branchId: string }, context: Ctx): Promise<BranchCommitsView> {
  const ws = await reachWorkspace(args?.workspaceId, requireUser(context), 'read')
  const b = await branchIn(ws.ref.workspaceId, args.branchId)
  return asBranchHttp(() => siteCall(ws.logicalSiteId, BRANCH_READ_METHODS.commits, {
    workspace: ws.ref, branch: b.name, base: mergeBaseOf(b), limit: BRANCH_COMMITS_MAX,
  }))
}

export async function getMainVersions(args: { workspaceId: string; before: string | null }, context: Ctx): Promise<MainVersionsView> {
  const ws = await reachWorkspace(args?.workspaceId, requireUser(context), 'read')
  const before = typeof args.before === 'string' && args.before ? args.before : null
  return asBranchHttp(async () => {
    const page = await siteCall(ws.logicalSiteId, BRANCH_READ_METHODS.versions, { workspace: ws.ref, limit: VERSIONS_PAGE, before })
    const oldest = page.versions[page.versions.length - 1]
    return { versions: page.versions, hasMore: !!oldest && oldest.number > 1 }
  })
}

/**
 * `main` is read at its tip as a commit, since no read names `main` as a branch, or at one of its versions; a branch
 * by its name.
 */
async function revOf(ws: ReachedWorkspace, ref: BranchRef, at: 'tip' | 'base'): Promise<GitRev> {
  if (ref?.kind === 'main') {
    if (at === 'base') throw new HttpError(400, 'main has no base: only a branch is compared with where it left main.')
    if (ref.version != null) return mainVersionRev(ws, ref.version)
    return { commit: (await listOf(ws, [])).main.head }
  }
  if (ref?.kind !== 'branch') throw new HttpError(400, 'Name main or one of the workspace\'s branches.')
  const b = await branchIn(ws.ref.workspaceId, ref.branchId)
  if (at === 'tip') return { branch: b.name }
  const base = mergeBaseOf(b)
  if (base) return { commit: base.mergedCommit }
  return { commit: (await siteCall(ws.logicalSiteId, BRANCH_READ_METHODS.changes, { workspace: ws.ref, branch: b.name, base: null })).base }
}

export async function getGitTree(args: { workspaceId: string; ref: BranchRef; path: string }, context: Ctx): Promise<GitTreeView> {
  const ws = await reachWorkspace(args?.workspaceId, requireUser(context), 'read')
  const path = typeof args.path === 'string' ? args.path : ''
  if (path !== '' && !isRepoPath(path)) throw new HttpError(400, 'That is not a path in this repository.')
  return asBranchHttp(async () => {
    const tree = await siteCall(ws.logicalSiteId, BRANCH_READ_METHODS.listTree, { workspace: ws.ref, rev: await revOf(ws, args.ref, 'tip'), path })
    return tree.exists ? { exists: true, entries: tree.entries, overflow: tree.overflow } : { exists: false, entries: [], overflow: false }
  })
}

export async function getGitFile(args: { workspaceId: string; ref: BranchRef; at: 'tip' | 'base'; path: string }, context: Ctx): Promise<GitFileView> {
  const ws = await reachWorkspace(args?.workspaceId, requireUser(context), 'read')
  if (!isRepoPath(args.path)) throw new HttpError(400, 'That is not a path in this repository.')
  const at = args.at === 'base' ? 'base' : 'tip'
  return asBranchHttp(async () => {
    const file = await siteCall(ws.logicalSiteId, BRANCH_READ_METHODS.readFile, { workspace: ws.ref, rev: await revOf(ws, args.ref, at), path: args.path })
    if (!file.exists) return { exists: false }
    if (file.binary) return { exists: true, binary: true, bytes: file.bytes }
    return file.tooLarge
      ? { exists: true, binary: false, tooLarge: true, bytes: file.bytes, text: null }
      : { exists: true, binary: false, tooLarge: false, bytes: file.bytes, text: file.text }
  })
}
