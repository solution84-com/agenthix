/**
 * What a person does to a code workspace's `main` (live preview spec, part 3): turn Git on, and restore an earlier
 * version as a new one. Both by a Member or Admin, both made by that person (*Defaults for review* 1).
 */
import { HttpError } from 'wasp/server'
import { GIT_VERSIONS_MAX, MAIN_WORK_METHODS, BRANCH_READ_METHODS, isCommitId } from '@agenthix/core'
import { siteCall } from './siteCalls'
import { reachWorkspace, requireUser } from './workspaceAccess'
import { gitPersonForUser } from './gitPeople'
import { emitMainChange } from './workspaceEvents'
import { pullMainFirst, pushMainAfter } from './githubMain'
import { asBranchHttp } from './refusals'
import type { RestoreVersionInput, RestoreVersionResult } from './views'

type Ctx = { user?: { id: string } | null }

export async function turnGitOn(args: { workspaceId: string }, context: Ctx): Promise<{ versionNumber: number; leftOut: string[] }> {
  const userId = requireUser(context)
  const ws = await reachWorkspace(args?.workspaceId, userId, 'work')
  return asBranchHttp(async () => {
    const result = await siteCall(ws.logicalSiteId, MAIN_WORK_METHODS.init, { workspace: ws.ref, author: await gitPersonForUser(userId) })
    emitMainChange(ws.ref.workspaceId, 'git_on', result.version.number)
    return { versionNumber: result.version.number, leftOut: result.leftOut.map(f => f.path) }
  })
}

export async function restoreVersion(args: RestoreVersionInput, context: Ctx): Promise<RestoreVersionResult> {
  const userId = requireUser(context)
  const ws = await reachWorkspace(args?.workspaceId, userId, 'work')
  if (!isCommitId(args.versionCommit) || !isCommitId(args.expectedMain)) {
    throw new HttpError(400, 'A restore names the version to restore and the version of main it was shown. Reload and try again. Nothing was changed.')
  }
  return asBranchHttp(async () => {
    await pullMainFirst(ws.logicalSiteId, ws.ref, userId)
    const { versions } = await siteCall(ws.logicalSiteId, BRANCH_READ_METHODS.versions, { workspace: ws.ref, limit: GIT_VERSIONS_MAX, before: null })
    const restoring = versions.find(v => v.commit === args.versionCommit)
    const result = await siteCall(ws.logicalSiteId, MAIN_WORK_METHODS.restore, {
      workspace: ws.ref, version: args.versionCommit, expectedMain: args.expectedMain,
      message: restoring ? `Restored version ${restoring.number}` : 'Restored an earlier version',
      author: await gitPersonForUser(userId),
    })
    if (!result.restored) return { outcome: result.reason }
    emitMainChange(ws.ref.workspaceId, 'restored', result.version.number)
    const github = await pushMainAfter(ws.logicalSiteId, ws.ref, userId)
    return { outcome: 'restored', versionNumber: result.version.number, github }
  })
}
