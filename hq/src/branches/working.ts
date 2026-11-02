/**
 * Which branches have an agent working on them now (live preview spec, the branch select's *Kernel is working here*):
 * a run going on the branch's work, read from the site that holds the workspace, or a run hq is starting on it this
 * moment. A branch's work is its task (its task's session, a run of it or a message in its thread) or its
 * conversation's worker in that workspace.
 *
 * `starting` is this process's own: hq runs as one process per organisation, and it covers the moment between a
 * dispatch making a branch's copy ready and the site recording the run, so a merge that closes branches, or a delete,
 * never removes a copy a run is about to use.
 */
import { prisma } from 'wasp/server'
import type { WorkspaceBranch } from '@prisma/client'
import type { WorkspaceRepoRef } from '@agenthix/core'
import { listActiveRuns } from '../sessions/siteRuntimeStore'

const starting = new Map<string, number>()

export function markStarting(branchId: string): void {
  starting.set(branchId, (starting.get(branchId) ?? 0) + 1)
}

export function doneStarting(branchId: string): void {
  const n = (starting.get(branchId) ?? 1) - 1
  if (n <= 0) starting.delete(branchId)
  else starting.set(branchId, n)
}

export function isStarting(branchId: string): boolean {
  return starting.has(branchId)
}

export function __resetStartingForTests(): void {
  starting.clear()
}

type BranchWork = Pick<WorkspaceBranch, 'id' | 'taskId' | 'conversationId' | 'workspaceId'>

/** The run going on each branch now, and its agent's name; a branch with none is absent. */
export async function runsOnBranches(
  logicalSiteId: string,
  ref: Pick<WorkspaceRepoRef, 'ownerType' | 'ownerId'>,
  branches: readonly BranchWork[],
): Promise<Map<string, { runId: string; agentName: string }>> {
  const out = new Map<string, { runId: string; agentName: string }>()
  if (branches.length === 0) return out
  const { runs } = await listActiveRuns(logicalSiteId, { ownerType: ref.ownerType, ownerId: ref.ownerId })
  if (runs.length === 0) return out
  const sessions = await prisma.agentSession.findMany({
    where: { id: { in: [...new Set(runs.map(r => r.sessionId))] } },
    select: { id: true, taskId: true, conversationId: true, primaryWorkspaceId: true },
  })
  const sessionById = new Map(sessions.map(s => [s.id, s]))
  const agents = await prisma.agent.findMany({ where: { id: { in: [...new Set(runs.map(r => r.agentId))] } }, select: { id: true, name: true } })
  const agentName = new Map(agents.map(a => [a.id, a.name]))
  for (const b of branches) {
    const run = runs.find(r => {
      const s = sessionById.get(r.sessionId)
      const taskId = r.taskId ?? s?.taskId ?? null
      if (b.taskId) return taskId === b.taskId
      return !!b.conversationId && !taskId && s?.conversationId === b.conversationId && s.primaryWorkspaceId === b.workspaceId
    })
    if (run) out.set(b.id, { runId: run.runId, agentName: agentName.get(run.agentId) ?? 'An agent' })
  }
  return out
}

/** The agent working on each branch now, by name, a run hq is starting included; a branch with none is absent. */
export async function agentsWorking(
  logicalSiteId: string,
  ref: Pick<WorkspaceRepoRef, 'ownerType' | 'ownerId'>,
  branches: readonly BranchWork[],
): Promise<Map<string, string>> {
  const runs = await runsOnBranches(logicalSiteId, ref, branches)
  const out = new Map([...runs].map(([id, r]) => [id, r.agentName]))
  for (const b of branches) if (!out.has(b.id) && isStarting(b.id)) out.set(b.id, 'An agent')
  return out
}

/** Whether an agent works on this one branch now. */
export async function isWorking(logicalSiteId: string, branch: BranchWork & Pick<WorkspaceBranch, 'ownerType' | 'ownerId'>): Promise<boolean> {
  if (isStarting(branch.id)) return true
  return (await agentsWorking(logicalSiteId, branch, [branch])).has(branch.id)
}
