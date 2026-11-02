/**
 * The reads the workspace view is drawn from (site protocol 1.12, `core/src/protocol/branchReads.ts`), each from the
 * workspace's own repository, mounted read-only into the commit helper. Reads take no turn: they change nothing, so
 * they never wait behind a merge.
 */
import {
  BRANCH_CHANGES_MAX, BRANCH_LIST_MAX, BRANCH_READ_METHODS, BRANCH_READ_SITE_BUDGET_MS, GIT_FILE_TEXT_MAX_BYTES,
  GIT_TREE_MAX, GIT_VERSIONS_MAX,
  type BranchChangesResult, type BranchCommitsResult, type BranchListResult, type GitListTreeResult,
  type GitReadFileResult, type GitVersionsResult, type WorkspaceRepoRef,
} from '@agenthix/core'
import { helperCall, parse, placeWorkspace } from './branchCalls'
import { changesParams, commitsParams, listParams, listTreeParams, readFileParams, versionsParams } from './branchSchemas'

const M = BRANCH_READ_METHODS

async function read(ref: WorkspaceRepoRef, method: string, request: Record<string, unknown>): Promise<Record<string, unknown>> {
  const p = await placeWorkspace(ref, method)
  return helperCall({ workspaceId: p.ref.workspaceId, ws: { dir: p.ws, readOnly: true }, network: false, timeoutMs: BRANCH_READ_SITE_BUDGET_MS }, request, method, p.ref)
}

export async function branchList(params: unknown): Promise<BranchListResult> {
  const q = parse(listParams, params, M.list)
  return await read(q.workspace, M.list, { op: 'list', merged: q.merged, max: BRANCH_LIST_MAX }) as BranchListResult
}

export async function branchChanges(params: unknown): Promise<BranchChangesResult> {
  const q = parse(changesParams, params, M.changes)
  return await read(q.workspace, M.changes, { op: 'changes', branch: q.branch, base: q.base, max: BRANCH_CHANGES_MAX }) as BranchChangesResult
}

export async function branchCommits(params: unknown): Promise<BranchCommitsResult> {
  const q = parse(commitsParams, params, M.commits)
  return await read(q.workspace, M.commits, { op: 'commits', branch: q.branch, base: q.base, limit: q.limit }) as BranchCommitsResult
}

export async function gitReadFile(params: unknown): Promise<GitReadFileResult> {
  const q = parse(readFileParams, params, M.readFile)
  return await read(q.workspace, M.readFile, { op: 'readFile', rev: q.rev, path: q.path, max: GIT_FILE_TEXT_MAX_BYTES }) as GitReadFileResult
}

export async function gitListTree(params: unknown): Promise<GitListTreeResult> {
  const q = parse(listTreeParams, params, M.listTree)
  return await read(q.workspace, M.listTree, { op: 'listTree', rev: q.rev, path: q.path, max: GIT_TREE_MAX }) as GitListTreeResult
}

export async function gitVersions(params: unknown): Promise<GitVersionsResult> {
  const q = parse(versionsParams, params, M.versions)
  return await read(q.workspace, M.versions, { op: 'versions', limit: Math.min(q.limit, GIT_VERSIONS_MAX), before: q.before }) as GitVersionsResult
}
