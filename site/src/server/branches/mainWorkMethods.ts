/**
 * What moves a code workspace's `main` (site protocol 1.12, `core/src/protocol/mainWork.ts`): turning Git on, a
 * squashed merge with the stored merge base, a restore, and pushing to and taking in from the workspace's GitHub
 * repository. Each runs in the commit helper in the workspace's own repository, one at a time per workspace.
 *
 * The GitHub remote is the one the workspace's attachment on this site names, never one the repository's own
 * settings name; hq's token is used for that one call and goes nowhere else.
 */
import {
  GIT_INIT_IGNORED, GIT_INIT_LARGE_FILE_BYTES, MAIN_WORK_METHODS, MAIN_WORK_SITE_BUDGET_MS, RepoWorkError,
  type GitInitResult, type GitMergeResult, type GitPullMainResult, type GitPushMainResult, type GitRestoreResult,
  type MainVersion, type MergeClash,
} from '@agenthix/core'
import { prisma } from '#db'
import { describeWorkspace, helperCall, inTurn, parse, placeWorkspace, type Placed } from './branchCalls'
import { initParams, mergeParams, pullMainParams, pushMainParams, restoreParams } from './branchSchemas'

const M = MAIN_WORK_METHODS
const budget = MAIN_WORK_SITE_BUDGET_MS
const now = () => new Date().toISOString()

const writing = (p: Placed, network = false, readOnly = false) =>
  ({ workspaceId: p.ref.workspaceId, ws: { dir: p.ws, readOnly }, network, timeoutMs: budget })

export async function gitInit(params: unknown): Promise<GitInitResult> {
  const q = parse(initParams, params, M.init)
  const p = await placeWorkspace(q.workspace, M.init)
  return inTurn(p.ref.workspaceId, async () => {
    const a = await helperCall(writing(p), {
      op: 'init', author: q.author, at: now(), message: 'First version\n', large: GIT_INIT_LARGE_FILE_BYTES, ignored: [...GIT_INIT_IGNORED],
    }, M.init, p.ref)
    return { main: String(a.main), version: a.version as MainVersion, gitignoreAdded: a.gitignoreAdded === true, leftOut: a.leftOut as GitInitResult['leftOut'] }
  })
}

export async function gitMerge(params: unknown): Promise<GitMergeResult> {
  const q = parse(mergeParams, params, M.merge)
  const p = await placeWorkspace(q.workspace, M.merge)
  return inTurn(p.ref.workspaceId, async () => {
    const a = await helperCall(writing(p), {
      op: 'merge', branch: q.branch, base: q.base, expectedMain: q.expectedMain, message: `${q.message.trimEnd()}\n`, author: q.author, at: now(),
    }, M.merge, p.ref)
    if (typeof a.moved === 'string') return { merged: false, reason: 'main_moved', main: a.moved }
    if (a.nothing) return { merged: false, reason: 'nothing_to_merge' }
    if (Array.isArray(a.clashes)) return { merged: false, reason: 'clash', clashes: a.clashes as MergeClash[] }
    return { merged: true, version: a.version as MainVersion, mergedCommit: String(a.mergedCommit) }
  })
}

export async function gitRestore(params: unknown): Promise<GitRestoreResult> {
  const q = parse(restoreParams, params, M.restore)
  const p = await placeWorkspace(q.workspace, M.restore)
  return inTurn(p.ref.workspaceId, async () => {
    const a = await helperCall(writing(p), {
      op: 'restore', version: q.version, expectedMain: q.expectedMain, message: `${q.message.trimEnd()}\n`, author: q.author, at: now(),
    }, M.restore, p.ref)
    if (typeof a.moved === 'string') return { restored: false, reason: 'main_moved', main: a.moved }
    if (a.same) return { restored: false, reason: 'same_files' }
    return { restored: true, version: a.version as MainVersion }
  })
}

/** The workspace's GitHub repository, as its attachment on this site names it. */
async function remoteOf(p: Placed, method: string): Promise<string> {
  const attachment = await prisma.repoAttachment.findUnique({ where: { workspaceId: p.ref.workspaceId }, select: { repoUrl: true } })
  const url = attachment?.repoUrl ?? ''
  if (!/^https:\/\/[A-Za-z0-9.-]+\/[!-~]+$/.test(url) || url.includes('@')) {
    throw new RepoWorkError('invalid', `${method}: ${describeWorkspace(p.ref)} is not connected to a GitHub repository. Nothing was changed.`)
  }
  return url
}

export async function gitPushMain(params: unknown): Promise<GitPushMainResult> {
  const q = parse(pushMainParams, params, M.pushMain)
  const p = await placeWorkspace(q.workspace, M.pushMain)
  return inTurn(p.ref.workspaceId, async () => {
    const url = await remoteOf(p, M.pushMain)
    const a = await helperCall(writing(p, true, true), { op: 'pushMain', url, token: q.token }, M.pushMain, p.ref, q.token)
    return a.pushed ? { pushed: true, head: String(a.head) } : { pushed: false, reason: 'remote_ahead' }
  })
}

export async function gitPullMain(params: unknown): Promise<GitPullMainResult> {
  const q = parse(pullMainParams, params, M.pullMain)
  const p = await placeWorkspace(q.workspace, M.pullMain)
  return inTurn(p.ref.workspaceId, async () => {
    const url = await remoteOf(p, M.pullMain)
    const a = await helperCall(writing(p, true), { op: 'pullMain', url, token: q.token }, M.pullMain, p.ref, q.token)
    if (a.diverged) return { pulled: false, reason: 'diverged' }
    return { pulled: true, head: String(a.head), versions: a.versions as MainVersion[] }
  })
}
