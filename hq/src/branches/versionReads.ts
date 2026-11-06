/**
 * An older version of `main`, as the workspace view looks at one (read-only): which commit a version names, the
 * check that a commit a reader names is one of main's versions, and that version's own changes. Read access, as
 * every read in `reads.ts`.
 */
import { HttpError } from 'wasp/server'
import {
  BRANCH_READ_METHODS, GIT_VERSIONS_MAX, isCommitId, type CommitId, type GitRev, type GitVersionsResult, type ProtocolVersion,
} from '@agenthix/core'
import { siteChannelRegistry } from '../sites/channel'
import { siteCall } from './siteCalls'
import { reachWorkspace, requireUser, type ReachedWorkspace } from './workspaceAccess'
import { asBranchHttp } from './refusals'
import type { MainVersionAtView, MainVersionChangesView } from './views'

type Ctx = { user?: { id: string } | null }

const NOT_A_VERSION = "That isn't one of main's versions. Choose one from main's versions. Nothing was changed."

/** `v12` or `12` names a version by its number; a full commit id names it by its commit. Anything else is neither. */
export function versionNamed(version: unknown): { number: number } | { commit: CommitId } | null {
  if (typeof version !== 'string') return null
  const n = /^v?([1-9]\d{0,8})$/.exec(version)
  if (n) return { number: Number(n[1]) }
  return isCommitId(version) ? { commit: version } : null
}

async function mainOf(ws: ReachedWorkspace): Promise<{ head: CommitId; total: number }> {
  const list = await siteCall(ws.logicalSiteId, BRANCH_READ_METHODS.list, { workspace: ws.ref, merged: [] })
  return { head: list.main.head, total: list.main.versions }
}

/**
 * The number of `commit` on main's first-parent line. The site refuses a commit that is not on it (`not_found`), so
 * a commit of a branch, or any other object in the repository, is never read as one of main's versions.
 */
async function numberOf(ws: ReachedWorkspace, commit: CommitId, main: { head: CommitId; total: number }): Promise<number> {
  if (commit === main.head) return main.total
  const older = await siteCall(ws.logicalSiteId, BRANCH_READ_METHODS.versions, { workspace: ws.ref, limit: 1, before: commit })
  return (older.versions[0]?.number ?? 0) + 1
}

async function commitOf(ws: ReachedWorkspace, number: number, main: { head: CommitId; total: number }): Promise<CommitId> {
  if (number > main.total) throw new HttpError(404, NOT_A_VERSION)
  if (number === main.total) return main.head
  let before: CommitId | null = null
  // Newest first, a page at a time, until the page that holds it: at most total / GIT_VERSIONS_MAX reads.
  for (;;) {
    const page: GitVersionsResult = await siteCall(ws.logicalSiteId, BRANCH_READ_METHODS.versions, { workspace: ws.ref, limit: GIT_VERSIONS_MAX, before })
    const found = page.versions.find(v => v.number === number)
    if (found) return found.commit
    const oldest = page.versions[page.versions.length - 1]
    if (!oldest || oldest.number <= number) throw new HttpError(404, NOT_A_VERSION)
    before = oldest.commit
  }
}

/** Which of main's versions `version` names: its number and commit, and whether it is the latest. */
export async function getMainVersionAt(args: { workspaceId: string; version: string }, context: Ctx): Promise<MainVersionAtView> {
  const ws = await reachWorkspace(args?.workspaceId, requireUser(context), 'read')
  const named = versionNamed(args?.version)
  if (!named) throw new HttpError(400, NOT_A_VERSION)
  return asBranchHttp(async () => {
    const main = await mainOf(ws)
    if ('commit' in named) {
      const number = await numberOf(ws, named.commit, main)
      return { number, commit: named.commit, latest: number === main.total }
    }
    const commit = await commitOf(ws, named.number, main)
    return { number: named.number, commit, latest: named.number === main.total }
  })
}

/** `main` at one of its versions, for reading its folders and files; refused when the commit is not one of them. */
export async function mainVersionRev(ws: ReachedWorkspace, version: unknown): Promise<GitRev> {
  if (!isCommitId(version)) throw new HttpError(400, NOT_A_VERSION)
  await numberOf(ws, version, await mainOf(ws))
  return { commit: version }
}

/** `git.versionChanges` came in site protocol 1.13; a site speaking less is never asked. */
const FIRST_WITH_VERSION_CHANGES = { major: 1, minor: 13 }

export function speaksVersionChanges(v: ProtocolVersion): boolean {
  return v.major > FIRST_WITH_VERSION_CHANGES.major || (v.major === FIRST_WITH_VERSION_CHANGES.major && v.minor >= FIRST_WITH_VERSION_CHANGES.minor)
}

/**
 * The files one of main's versions changed against the version before it (the first, against nothing). The site
 * refuses a commit that is not on main's first-parent line. Null when the site is too old to say.
 */
export async function getMainVersionChanges(args: { workspaceId: string; version: string }, context: Ctx): Promise<MainVersionChangesView> {
  const ws = await reachWorkspace(args?.workspaceId, requireUser(context), 'read')
  if (!isCommitId(args?.version)) throw new HttpError(400, NOT_A_VERSION)
  const version = args.version
  const conn = siteChannelRegistry.get(ws.logicalSiteId)
  if (conn && !speaksVersionChanges(conn.protocol)) return null
  return asBranchHttp(() => siteCall(ws.logicalSiteId, BRANCH_READ_METHODS.versionChanges, { workspace: ws.ref, version }))
}
