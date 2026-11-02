/**
 * The branch methods (site protocol 1.12, `core/src/protocol/branchWork.ts`): making a branch and its copy, a copy of
 * a branch that exists, the `commit` tool's commit, bringing a branch back, renaming, deleting, removing a copy.
 * Every call naming a copy is checked against the site's own `BranchCopy` record first.
 */
import fs from 'node:fs/promises'
import {
  BRANCH_WORK_METHODS, BRANCH_WORK_SITE_BUDGET_MS, BranchWorkError, isCommitMessage, RepoWorkError, UPDATE_CLASH_PATHS_MAX,
  type BranchBackResult, type BranchCommitResult, type BranchCopyResult, type BranchDeleteResult,
  type BranchRemoveCopyResult, type BranchRenameResult, type BranchUpdateFromMainResult, type GitPerson,
} from '@agenthix/core'
import { prisma } from '#db'
import { PLURAL_OWNER } from '../../agents/runtime/locationResolver'
import {
  copyDirOf, describeWorkspace, freshCopyDir, helperCall, inTurn, parse, placeWorkspace, removeCopyDir, requireCopy,
  type Placed,
} from './branchCalls'
import {
  bringBackParams, commitParams, copyParams, createParams, deleteParams, removeCopyParams, renameParams, updateFromMainParams,
} from './branchSchemas'

const M = BRANCH_WORK_METHODS
const budget = BRANCH_WORK_SITE_BUDGET_MS

const today = () => new Date().toISOString().slice(0, 10)

/** Where the workspace's folder is inside a run's container: the copy's `origin`, for the agent's own `git fetch`. */
const originUrl = (p: Placed) => `/${PLURAL_OWNER[p.ref.ownerType]}/${p.ref.ownerId}/workspaces/${p.ref.workspaceId}`

async function makeCopy(p: Placed, copyId: string, branch: string, op: 'create' | 'copy', method: string): Promise<BranchCopyResult> {
  if (await prisma.branchCopy.findUnique({ where: { id: copyId }, select: { id: true } })) {
    throw new BranchWorkError('copy_exists', `${method}: copy ${copyId} is already in use on this site. Nothing was changed.`)
  }
  const dir = copyDirOf(p, copyId)
  await freshCopyDir(dir, method, p.ref)
  try {
    const answer = await helperCall(
      { workspaceId: p.ref.workspaceId, ws: { dir: p.ws, readOnly: op === 'copy' }, copy: { dir, readOnly: false }, network: false, timeoutMs: budget },
      { op, branch, originUrl: originUrl(p) }, method, p.ref,
    )
    await prisma.branchCopy.create({ data: { id: copyId, ownerType: p.ref.ownerType, ownerId: p.ref.ownerId, workspaceId: p.ref.workspaceId, branch } })
    return { branch, copyId, head: String(answer.head), base: String(answer.base) }
  } catch (err) {
    await removeCopyDir(p, copyId, method, budget).catch(() => false)
    throw err
  }
}

export async function branchCreate(params: unknown): Promise<BranchCopyResult> {
  const q = parse(createParams, params, M.create)
  const p = await placeWorkspace(q.workspace, M.create)
  return inTurn(p.ref.workspaceId, () => makeCopy(p, q.copyId, q.branch, 'create', M.create))
}

export async function branchCopy(params: unknown): Promise<BranchCopyResult> {
  const q = parse(copyParams, params, M.copy)
  const p = await placeWorkspace(q.workspace, M.copy)
  return inTurn(p.ref.workspaceId, () => makeCopy(p, q.copyId, q.branch, 'copy', M.copy))
}

/**
 * Brings a copy's branch back to the workspace's repository, by the site's record of which branch the copy is for.
 * Clears the record's `backPending` once it is back. For the sweep, a run's end and a restart too.
 */
export async function bringBackCopy(p: Placed, copyId: string, branch: string, method: string = M.bringBack): Promise<BranchBackResult> {
  const answer = await helperCall(
    { workspaceId: p.ref.workspaceId, ws: { dir: p.ws, readOnly: false }, copy: { dir: copyDirOf(p, copyId), readOnly: true }, network: false, timeoutMs: budget },
    { op: 'bringBack', branch, date: today() }, method, p.ref,
  )
  return {
    head: String(answer.head),
    previous: typeof answer.previous === 'string' ? answer.previous : null,
    moved: answer.moved === true,
    backup: typeof answer.backup === 'string' ? answer.backup : null,
  }
}

export type CopyCommit =
  | { made: true; commit: string; files: number }
  | { made: false; clashesLeft: string[] | null }

/**
 * Commits everything changed in a copy onto its branch. Not made when nothing had changed, or when a merge from
 * `main` under way still has files with conflict markers (`clashesLeft`).
 */
export async function commitInCopy(
  p: Placed, copyId: string, branch: string, message: string, author: GitPerson, method: string,
): Promise<CopyCommit> {
  const answer = await helperCall(
    { workspaceId: p.ref.workspaceId, ws: { dir: p.ws, readOnly: true }, copy: { dir: copyDirOf(p, copyId), readOnly: false }, network: false, timeoutMs: budget },
    { op: 'commit', branch, message, author, at: new Date().toISOString() }, method, p.ref,
  )
  if (Array.isArray(answer.clashesLeft)) return { made: false, clashesLeft: answer.clashesLeft.map(String) }
  return answer.nothing ? { made: false, clashesLeft: null } : { made: true, commit: String(answer.commit), files: Number(answer.files) }
}

/** The message with the person the work is for at its end, as Git trailers are written. */
export function withOnBehalfOf(message: string, person: GitPerson | null): string {
  const trimmed = message.trimEnd()
  return person ? `${trimmed}\n\nOn-behalf-of: ${person.name} <${person.email}>\n` : `${trimmed}\n`
}

export async function branchCommit(params: unknown): Promise<BranchCommitResult> {
  const q = parse(commitParams, params, M.commit)
  const p = await placeWorkspace(q.workspace, M.commit)
  const message = withOnBehalfOf(q.message, q.onBehalfOf)
  if (!isCommitMessage(message)) throw new RepoWorkError('invalid', `${M.commit}: the message is too long. Nothing was changed.`)
  return inTurn(p.ref.workspaceId, async () => {
    await requireCopy(p, q.copyId, q.branch, M.commit)
    const made = await commitInCopy(p, q.copyId, q.branch, message, q.author, M.commit)
    if (!made.made) {
      return made.clashesLeft
        ? { committed: false, reason: 'clashes_left', paths: made.clashesLeft.slice(0, UPDATE_CLASH_PATHS_MAX) }
        : { committed: false, reason: 'nothing_to_commit' }
    }
    const back = await bringBackCopy(p, q.copyId, q.branch, M.commit)
    return { committed: true, commit: made.commit, files: made.files, back }
  })
}

/** The merge commit's message when nothing clashes, and the start of `MERGE_MSG` when files do. */
export const mergeFromMainMessage = (branch: string) => `Merge main into ${branch}`

export async function branchUpdateFromMain(params: unknown): Promise<BranchUpdateFromMainResult> {
  const q = parse(updateFromMainParams, params, M.updateFromMain)
  const p = await placeWorkspace(q.workspace, M.updateFromMain)
  const message = withOnBehalfOf(mergeFromMainMessage(q.branch), q.onBehalfOf)
  return inTurn(p.ref.workspaceId, async () => {
    await requireCopy(p, q.copyId, q.branch, M.updateFromMain)
    const answer = await helperCall(
      { workspaceId: p.ref.workspaceId, ws: { dir: p.ws, readOnly: true }, copy: { dir: copyDirOf(p, q.copyId), readOnly: false }, network: false, timeoutMs: budget },
      { op: 'updateFromMain', branch: q.branch, message, author: q.author, at: new Date().toISOString() }, M.updateFromMain, p.ref,
    )
    const paths = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, UPDATE_CLASH_PATHS_MAX) : [])
    if (answer.uncommitted) return { outcome: 'uncommitted' }
    if (answer.mergeUnderWay) return { outcome: 'merge_under_way', paths: paths(answer.mergeUnderWay) }
    if (typeof answer.upToDate === 'string') return { outcome: 'up_to_date', head: answer.upToDate }
    if (Array.isArray(answer.clashes)) return { outcome: 'clashes', paths: paths(answer.clashes), mainTip: String(answer.mainTip) }
    const back = await bringBackCopy(p, q.copyId, q.branch, M.updateFromMain)
    return { outcome: 'updated', commit: String(answer.commit), fastForward: answer.fastForward === true, back }
  })
}

export async function branchBringBack(params: unknown): Promise<BranchBackResult> {
  const q = parse(bringBackParams, params, M.bringBack)
  const p = await placeWorkspace(q.workspace, M.bringBack)
  return inTurn(p.ref.workspaceId, async () => {
    await requireCopy(p, q.copyId, q.branch, M.bringBack)
    return bringBackCopy(p, q.copyId, q.branch)
  })
}

export async function branchRename(params: unknown): Promise<BranchRenameResult> {
  const q = parse(renameParams, params, M.rename)
  const p = await placeWorkspace(q.workspace, M.rename)
  return inTurn(p.ref.workspaceId, async () => {
    if (q.copyId) {
      await requireCopy(p, q.copyId, q.from, M.rename)
      await bringBackCopy(p, q.copyId, q.from, M.rename)
    }
    await helperCall(
      { workspaceId: p.ref.workspaceId, ws: { dir: p.ws, readOnly: false }, ...(q.copyId ? { copy: { dir: copyDirOf(p, q.copyId), readOnly: false } } : {}), network: false, timeoutMs: budget },
      { op: 'rename', from: q.from, to: q.to }, M.rename, p.ref,
    )
    await prisma.branchCopy.updateMany({ where: { workspaceId: p.ref.workspaceId, branch: q.from }, data: { branch: q.to } })
    return { renamed: true, name: q.to }
  })
}

export async function branchDelete(params: unknown): Promise<BranchDeleteResult> {
  const q = parse(deleteParams, params, M.delete)
  const p = await placeWorkspace(q.workspace, M.delete)
  return inTurn(p.ref.workspaceId, async () => {
    if (q.copyId) await requireCopy(p, q.copyId, q.branch, M.delete)
    const answer = await helperCall(
      { workspaceId: p.ref.workspaceId, ws: { dir: p.ws, readOnly: false }, network: false, timeoutMs: budget },
      { op: 'delete', branch: q.branch }, M.delete, p.ref,
    )
    if (q.copyId) {
      await removeCopyDir(p, q.copyId, M.delete, budget)
      await prisma.branchCopy.deleteMany({ where: { id: q.copyId } })
    }
    return { deleted: true, lostCommits: Number(answer.lostCommits) }
  })
}

export async function branchRemoveCopy(params: unknown): Promise<BranchRemoveCopyResult> {
  const q = parse(removeCopyParams, params, M.removeCopy)
  const p = await placeWorkspace(q.workspace, M.removeCopy)
  return inTurn(p.ref.workspaceId, async () => {
    const record = await prisma.branchCopy.findUnique({ where: { id: q.copyId } })
    if (record && record.workspaceId !== p.ref.workspaceId) {
      throw new RepoWorkError('invalid', `${M.removeCopy}: copy ${q.copyId} is not one of ${describeWorkspace(p.ref)}. Nothing was changed.`)
    }
    // Commits made with the agent's own git that are not back yet go back first: removing a copy never loses one.
    const present = await fs.lstat(copyDirOf(p, q.copyId)).then(() => true, () => false)
    if (record && present) await bringBackCopy(p, q.copyId, record.branch, M.removeCopy).catch(err => {
      if (!(err instanceof BranchWorkError && (err.code === 'not_found' || err.code === 'no_copy'))) throw err
    })
    const removed = await removeCopyDir(p, q.copyId, M.removeCopy, budget)
    if (record) await prisma.branchCopy.delete({ where: { id: q.copyId } })
    return { removed: removed || Boolean(record) }
  })
}
