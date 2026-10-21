/**
 * AgentSession row access — plan 5d-2 task 3.
 *
 * AgentSession is authored BY HQ: hq mints id/sessionKey/createdAt and sends
 * them in a SessionSeed (core's runtimeData.ts); site upserts the row
 * verbatim rather than generating its own values (D3, schema.prisma's
 * runtime-module comment). `update: {}` on the upsert is deliberate — the
 * seed's creation-time fields never change on a re-dispatch of the same
 * session, so a second seed for an id already on file is a no-op, not an
 * overwrite (idempotent re-dispatch).
 *
 * Unlike 5c's workspaceRows.ts, this layer takes typed params and maps dates
 * explicitly rather than zod-parsing `unknown` — wire validation off the
 * control channel happens at the channel boundary instead (Task 4).
 */
import { Prisma } from '@prisma/client'
import { prisma } from '#db'
import { parseContextUse, type SessionSeed, type SessionRow, type SessionClosedReasonValue } from '@agenthix/core'

export async function getSession(id: string): Promise<SessionRow | null> {
  const session = await prisma.agentSession.findUnique({ where: { id } })
  if (!session) return null
  return {
    id: session.id,
    sessionKey: session.sessionKey,
    agentId: session.agentId,
    userId: session.userId,
    title: session.title,
    status: session.status as SessionRow['status'],
    closedReason: session.closedReason,
    runtime: session.runtime,
    sessionType: session.sessionType,
    model: session.model,
    metadata: session.metadata as SessionRow['metadata'],
    totalInputTokens: session.totalInputTokens,
    totalOutputTokens: session.totalOutputTokens,
    totalCacheReadTokens: session.totalCacheReadTokens,
    totalCacheWriteTokens: session.totalCacheWriteTokens,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    expiresAt: session.expiresAt ? session.expiresAt.toISOString() : null,
    taskId: session.taskId,
    primaryOwnerType: session.primaryOwnerType as SessionRow['primaryOwnerType'],
    primaryOwnerId: session.primaryOwnerId,
    primaryWorkspaceId: session.primaryWorkspaceId,
    contextUse: parseContextUse(session.contextUse),
  }
}

export async function upsertSessionFromSeed(seed: SessionSeed): Promise<void> {
  await prisma.agentSession.upsert({
    where: { id: seed.id },
    update: {},
    create: {
      id: seed.id,
      sessionKey: seed.sessionKey,
      agentId: seed.agentId,
      userId: seed.userId,
      sessionType: seed.sessionType,
      taskId: seed.taskId,
      title: seed.title,
      model: seed.model,
      metadata: seed.metadata as Prisma.InputJsonValue,
      primaryOwnerType: seed.primaryOwnerType,
      primaryOwnerId: seed.primaryOwnerId,
      primaryWorkspaceId: seed.primaryWorkspaceId,
      runtime: seed.runtime,
      createdAt: new Date(seed.createdAt),
    },
  })
}

/** `false` when `id` is absent — same non-exceptional idiom as deleteSession/clearSessionRuns below. */
export async function renameSession(id: string, title: string): Promise<boolean> {
  const { count } = await prisma.agentSession.updateMany({ where: { id }, data: { title } })
  return count > 0
}

/** `false` when `id` is absent. */
export async function archiveSession(id: string): Promise<boolean> {
  const { count } = await prisma.agentSession.updateMany({ where: { id }, data: { status: 'ARCHIVED' } })
  return count > 0
}

/**
 * Closes a conversation for good (adr-0076): the harness can no longer continue
 * it. `false` when `id` is absent. The history stays; only the status changes.
 */
export async function closeSession(id: string, reason: SessionClosedReasonValue): Promise<boolean> {
  const { count } = await prisma.agentSession.updateMany({ where: { id }, data: { status: 'CLOSED', closedReason: reason } })
  return count > 0
}

/** `false` when `id` is absent. Cascades runs, entries and tool calls. */
export async function deleteSession(id: string): Promise<boolean> {
  const { count } = await prisma.agentSession.deleteMany({ where: { id } })
  return count > 0
}

export interface SessionSelector {
  userId?: string
  taskId?: string
  agentId?: string
  ids?: string[]
}

export function sessionSelectorWhere(where: SessionSelector): Prisma.AgentSessionWhereInput {
  return {
    ...(where.userId !== undefined ? { userId: where.userId } : {}),
    ...(where.taskId !== undefined ? { taskId: where.taskId } : {}),
    ...(where.agentId !== undefined ? { agentId: where.agentId } : {}),
    ...(where.ids !== undefined ? { id: { in: where.ids } } : {}),
  }
}

export async function deleteSessionsBy(where: SessionSelector): Promise<number> {
  const { count } = await prisma.agentSession.deleteMany({ where: sessionSelectorWhere(where) })
  return count
}

/** Clears runs (cascading their tool calls). Transcript entries stay — they're the durable record. */
export async function clearSessionRuns(id: string): Promise<number> {
  const { count } = await prisma.agentRun.deleteMany({ where: { sessionId: id } })
  return count
}
