/**
 * Removing a workspace that has branches (live preview spec, *Defaults for review* 5): the confirmation lists each
 * open branch, whose it is, how far ahead of `main`, and any agent working on it, which stops. Removing the workspace
 * then stops those agents, closes the branches as deleted and lets their copies go with the workspace.
 */
import { prisma } from 'wasp/server'
import { BRANCH_READ_METHODS, BranchWorkError, type WorkspaceRepoRef } from '@agenthix/core'
import { siteCall } from './siteCalls'
import { mergeBaseOf, openBranches } from './branchRows'
import { reachWorkspace, requireUser } from './workspaceAccess'
import { locateWorkspace } from './workspaceLocation'
import { agentsWorking, runsOnBranches } from './working'
import { whoseOf } from './whose'
import { asBranchHttp } from './refusals'
import { removeCopiesOf } from './copies'
import { emitBranchChange } from './workspaceEvents'
import { cancelRun } from '../sessions/siteRuntimeStore'
import { personById } from '../server/identity/people'
import { Logger } from '../server/utils/logger'
import type { WorkspaceRemovalView } from './views'

const logger = new Logger('WorkspaceRemoval')

type Ctx = { user?: { id: string } | null }

export async function getWorkspaceRemoval(args: { workspaceId: string }, context: Ctx): Promise<WorkspaceRemovalView> {
  const ws = await reachWorkspace(args?.workspaceId, requireUser(context), 'work')
  return asBranchHttp(async () => {
    const rows = await openBranches(ws.ref.workspaceId)
    if (rows.length === 0) return { git: await hasGit(ws.logicalSiteId, ws.ref), branches: [] }
    const merged = rows.flatMap(r => { const base = mergeBaseOf(r); return base ? [{ branch: r.name, base }] : [] })
    const [list, whose, working] = await Promise.all([
      siteCall(ws.logicalSiteId, BRANCH_READ_METHODS.list, { workspace: ws.ref, merged }).catch(() => null),
      whoseOf(rows),
      agentsWorking(ws.logicalSiteId, ws.ref, rows),
    ])
    return {
      git: list !== null,
      branches: rows.flatMap(r => {
        const w = whose.get(r.id)
        if (!w) return []
        const agent = working.get(r.id)
        return [{ id: r.id, name: r.name, whose: w, ahead: list?.branches.find(l => l.name === r.name)?.ahead ?? 0, working: agent ? { agentName: agent } : null }]
      }),
    }
  })
}

async function hasGit(logicalSiteId: string, ref: WorkspaceRepoRef): Promise<boolean> {
  try {
    await siteCall(logicalSiteId, BRANCH_READ_METHODS.list, { workspace: ref, merged: [] })
    return true
  } catch (err) {
    if (err instanceof BranchWorkError && err.code === 'not_repository') return false
    throw err
  }
}

/**
 * Before the workspace goes: the agents on its branches are stopped and its branches closed as deleted, their copies
 * asked to go. Called by the workspace's removal after its own access check; `byUserId` is who removed it.
 */
export async function stopBranchesOfWorkspace(workspaceId: string, byUserId: string): Promise<void> {
  const rows = await openBranches(workspaceId)
  if (rows.length === 0) return
  const ws = await locateWorkspace(workspaceId)
  if (ws) {
    const runs = await runsOnBranches(ws.logicalSiteId, ws.ref, rows).catch(() => new Map<string, { runId: string }>())
    const by = runs.size > 0 ? (await personById(byUserId)).name : undefined
    for (const { runId } of runs.values()) {
      await cancelRun(ws.logicalSiteId, runId, undefined, by)
        .catch(err => logger.warn(`run ${runId} on a removed workspace's branch not stopped: ${err instanceof Error ? err.message : String(err)}`))
    }
  }
  for (const b of rows) {
    await prisma.workspaceBranch.updateMany({ where: { id: b.id, state: 'OPEN' }, data: { state: 'DELETED', deletedAt: new Date() } })
    await removeCopiesOf(b.id)
    emitBranchChange(b, 'deleted')
  }
}
