/**
 * What every branch method shares: its params checked, its workspace placed on this disk by the site's own records,
 * its copy checked against the site's own `BranchCopy` record (never the copy's `.git`), one Git operation at a time
 * per workspace, and the commit helper's answer turned into the refusal vocabulary hq reads (`RepoWorkError`,
 * `BranchWorkError`). A refusal names the method and the workspace by hq's ids, never a path on this disk or what
 * Git said; that goes to this site's log, with any token taken out.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { ZodError, type ZodType } from 'zod'
import {
  BRANCH_WORK_ERROR_CODES, BranchWorkError, RepoWorkError,
  type BranchWorkErrorCode, type RepoWorkErrorCode, type WorkspaceRepoRef,
} from '@agenthix/core'
import { prisma } from '#db'
import { ownerDir } from '../storage/paths'
import { redactToken } from '../storage/repoWorkRefusals'
import { Logger } from '../utils/logger'
import { runHelper, type HelperAnswer, type HelperSpec } from './helperContainer'

const logger = new Logger('branches')

export const describeWorkspace = (w: WorkspaceRepoRef) => `workspace ${w.workspaceId} of ${w.ownerType} ${w.ownerId}`

export function parse<T>(schema: ZodType<T>, params: unknown, method: string): T {
  try {
    return schema.parse(params)
  } catch (err) {
    const issues = err instanceof ZodError ? err.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.code}`) : []
    logger.error(`${method} was called with parameters it does not accept: ${issues.join(', ') || 'unknown'}`)
    throw new RepoWorkError('invalid', `${method} was called with parameters it does not accept. Nothing was changed.`)
  }
}

export type Placed = { ref: WorkspaceRepoRef; owner: string; ws: string }

/** The workspace's folder, when this site holds that workspace for that owner. */
export async function placeWorkspace(ref: WorkspaceRepoRef, method: string): Promise<Placed> {
  const row = await prisma.workspace.findFirst({ where: { id: ref.workspaceId, ownerType: ref.ownerType, ownerId: ref.ownerId }, select: { id: true } })
  let owner: string | null = null
  try { owner = row ? ownerDir(ref.ownerType, ref.ownerId) : null } catch { owner = null }
  if (!owner || ref.workspaceId.includes('/') || ref.workspaceId.includes('..')) {
    throw new RepoWorkError('outside', `${method}: this site holds no ${describeWorkspace(ref)}. Nothing was changed.`)
  }
  return { ref, owner, ws: path.join(owner, 'workspaces', ref.workspaceId) }
}

export const copyDirOf = (p: Placed, copyId: string) => path.join(p.owner, 'clones', copyId)

/** The site's own record of a copy, which must be of this workspace and, when named, this branch. */
export async function requireCopy(p: Placed, copyId: string, branch: string | null, method: string) {
  const copy = await prisma.branchCopy.findUnique({ where: { id: copyId } })
  if (!copy || copy.workspaceId !== p.ref.workspaceId || copy.ownerType !== p.ref.ownerType || copy.ownerId !== p.ref.ownerId ||
    (branch !== null && copy.branch !== branch)) {
    throw new BranchWorkError('no_copy', `${method}: ${describeWorkspace(p.ref)} has no copy ${copyId}${branch ? ` of branch ${branch}` : ''} on this site. Nothing was changed.`)
  }
  return copy
}

const queues = new Map<string, Promise<unknown>>()

/** One Git operation at a time on a workspace's repository and its copies. */
export function inTurn<T>(workspaceId: string, work: () => Promise<T>): Promise<T> {
  const prev = queues.get(workspaceId) ?? Promise.resolve()
  const next = prev.catch(() => {}).then(work)
  const tail = next.catch(() => {})
  queues.set(workspaceId, tail)
  void tail.then(() => { if (queues.get(workspaceId) === tail) queues.delete(workspaceId) })
  return next
}

const BRANCH_CODES = new Set<string>(BRANCH_WORK_ERROR_CODES)

const BRANCH_WORDS: Record<BranchWorkErrorCode, string> = {
  not_repository: 'is not a Git repository: Git is not on for it',
  already_repository: 'is already a Git repository',
  branch_exists: 'already has a branch of that name',
  not_found: 'has no such branch, commit or version',
  is_main: 'names main where only another branch may be named',
  no_copy: 'has no such copy on this site',
  copy_exists: 'already has a copy with that id',
}

const SPECIAL: Record<string, { code: RepoWorkErrorCode; words: string }> = {
  invalid: { code: 'invalid', words: 'was called with parameters it does not accept' },
  timedOut: { code: 'git_timeout', words: 'ran past this site\'s budget and was stopped' },
  busy: { code: 'git_timeout', words: 'waited past this site\'s budget for a free commit helper, and did not start' },
  protections: { code: 'refused', words: 'needs the machine\'s network protections for agents, which are not in place' },
  folderChanged: { code: 'refused', words: 'found files in the workspace\'s folder changed since main\'s last version; the site\'s administrator can look at the folder' },
  badObjects: { code: 'refused', words: 'found commits in the copy that fail Git\'s checks, so the branch was not brought back' },
}

/** Runs one helper operation; a refusal becomes the error hq reads, and what Git said goes to this site's log. */
export async function helperCall(spec: HelperSpec, request: Record<string, unknown>, method: string, ref: WorkspaceRepoRef, token = ''): Promise<HelperAnswer> {
  const answer = await runHelper(spec, request)
  const code = answer.refused
  if (!code) return answer
  const where = describeWorkspace(ref)
  if (code === 'refConflict' && (method === 'branch.create' || method === 'branch.rename')) {
    throw new BranchWorkError('branch_exists', `${method}: ${where} ${BRANCH_WORDS.branch_exists}. Nothing was changed.`)
  }
  if (BRANCH_CODES.has(code)) {
    throw new BranchWorkError(code as BranchWorkErrorCode, `${method}: ${where} ${BRANCH_WORDS[code as BranchWorkErrorCode]}. Nothing was changed.`)
  }
  logger.error(`${method} for ${where}: ${code} ${redactToken(String(answer.detail ?? ''), token)}`)
  const special = SPECIAL[code]
  if (special) throw new RepoWorkError(special.code, `${method} for ${where} ${special.words}. Nothing was changed.`)
  throw new RepoWorkError('git_failed', `${method} failed for ${where}; the reason is in this site's log. Nothing was changed.`)
}

/** A copy's folder, made empty for the helper to fill; one already there is refused. */
export async function freshCopyDir(dir: string, method: string, ref: WorkspaceRepoRef): Promise<void> {
  await fs.mkdir(path.dirname(dir), { recursive: true })
  try {
    await fs.mkdir(dir)
  } catch {
    throw new BranchWorkError('copy_exists', `${method}: ${describeWorkspace(ref)} ${BRANCH_WORDS.copy_exists}. Nothing was changed.`)
  }
}

/** Removes a copy's folder: the helper empties it inside its container, then the site takes the empty folder away. */
export async function removeCopyDir(p: Placed, copyId: string, method: string, timeoutMs: number): Promise<boolean> {
  const dir = copyDirOf(p, copyId)
  try { await fs.lstat(dir) } catch { return false }
  for (let attempt = 0; attempt < 2; attempt++) {
    await helperCall({ workspaceId: p.ref.workspaceId, copy: { dir, readOnly: false }, network: false, timeoutMs }, { op: 'removeCopy' }, method, p.ref)
    try {
      await fs.rmdir(dir)
      return true
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return true
    }
  }
  throw new RepoWorkError('git_failed', `${method} could not remove copy ${copyId} of ${describeWorkspace(p.ref)}: files kept appearing in it. Nothing else was changed.`)
}
