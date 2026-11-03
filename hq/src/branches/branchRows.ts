/**
 * hq's records of a code workspace's branches (`WorkspaceBranch`) and their working copies (`BranchCopy`). Git holds
 * the branches and their commits; these hold whose work each is, its last merge, and where its copy is. At most one
 * OPEN branch per piece of work and per workspace and name: every write that could break that holds the work's lock.
 */
import type { Prisma, WorkspaceBranch, BranchCopy } from '@prisma/client'
import { prisma } from 'wasp/server'
import type { BranchMergeBase, WorkspaceRepoRef } from '@agenthix/core'

export type Tx = Prisma.TransactionClient

/** Whose work a branch is: a task's, or a conversation's in one workspace. */
export type WorkOf = { taskId: string } | { conversationId: string }

export const LIVE_COPY_STATES = ['MAKING', 'READY'] as const

/**
 * Serialises everything that makes, closes or deletes a branch for one piece of work, and everything that names a
 * branch in one workspace, until the transaction ends.
 */
export async function lockWork(tx: Tx, work: WorkOf): Promise<void> {
  const key = 'taskId' in work ? `branch-work:task:${work.taskId}` : `branch-work:conversation:${work.conversationId}`
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`
}

export async function lockWorkspaceNames(tx: Tx, workspaceId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`branch-names:${workspaceId}`}, 0))`
}

export function workOfBranch(b: Pick<WorkspaceBranch, 'taskId' | 'conversationId'>): WorkOf | null {
  if (b.taskId) return { taskId: b.taskId }
  if (b.conversationId) return { conversationId: b.conversationId }
  return null
}

export function openBranchOfWork(db: Tx | typeof prisma, workspaceId: string, work: WorkOf) {
  return db.workspaceBranch.findFirst({
    where: { workspaceId, state: 'OPEN', ...work },
    include: { copies: { where: { state: { in: [...LIVE_COPY_STATES] } }, orderBy: { createdAt: 'desc' } } },
  })
}

export function openBranches(workspaceId: string) {
  return prisma.workspaceBranch.findMany({
    where: { workspaceId, state: 'OPEN' },
    include: { copies: { where: { state: { in: [...LIVE_COPY_STATES] } }, orderBy: { createdAt: 'desc' } } },
    orderBy: { createdAt: 'asc' },
  })
}

export type BranchWithCopies = WorkspaceBranch & { copies: BranchCopy[] }

/** A branch of this workspace by hq's id, OPEN; null for any other. */
export async function openBranchById(workspaceId: string | null, branchId: unknown): Promise<BranchWithCopies | null> {
  if (typeof branchId !== 'string' || branchId.length === 0 || branchId.length > 200) return null
  const row = await prisma.workspaceBranch.findFirst({
    where: { id: branchId, state: 'OPEN', ...(workspaceId ? { workspaceId } : {}) },
    include: { copies: { where: { state: { in: [...LIVE_COPY_STATES] } }, orderBy: { createdAt: 'desc' } } },
  })
  return row
}

export function refOfBranch(b: Pick<WorkspaceBranch, 'ownerType' | 'ownerId' | 'workspaceId'>): WorkspaceRepoRef {
  return { ownerType: b.ownerType, ownerId: b.ownerId, workspaceId: b.workspaceId }
}

/** The branch's last merge, as the site counts from it; null before its first. */
export function mergeBaseOf(b: Pick<WorkspaceBranch, 'lastMergedCommit' | 'lastMergedVersion'>): BranchMergeBase | null {
  return b.lastMergedCommit && b.lastMergedVersion ? { mergedCommit: b.lastMergedCommit, mergedVersion: b.lastMergedVersion } : null
}

/** The copy a branch's work uses now: its newest that is made, or being made. */
export function liveCopyOf(b: { copies: BranchCopy[] }): BranchCopy | null {
  return b.copies.find(c => c.state === 'READY') ?? b.copies.find(c => c.state === 'MAKING') ?? null
}

/** The open branch a run's session works on, with its copies; null when it works on none. */
export async function branchOfSession(sessionId: string): Promise<BranchWithCopies | null> {
  const session = await prisma.agentSession.findUnique({
    where: { id: sessionId },
    select: { taskId: true, conversationId: true, primaryWorkspaceId: true },
  })
  if (!session) return null
  const include = { copies: { where: { state: { in: [...LIVE_COPY_STATES] } }, orderBy: { createdAt: 'desc' as const } } }
  if (session.taskId) return prisma.workspaceBranch.findFirst({ where: { taskId: session.taskId, state: 'OPEN' }, include })
  if (session.conversationId && session.primaryWorkspaceId) {
    return prisma.workspaceBranch.findFirst({
      where: { conversationId: session.conversationId, workspaceId: session.primaryWorkspaceId, state: 'OPEN' }, include,
    })
  }
  return null
}
