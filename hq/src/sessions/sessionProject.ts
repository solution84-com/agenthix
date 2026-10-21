/**
 * The project a session works in, if any — a task session's task's project, or
 * a session whose primary location is a project. The dashboard's activity feed
 * records it on run and session entries so that an entry about a private
 * project is filtered like every other entry naming one (spec §6.4): that a run
 * happened there is itself something a non-member is not told.
 */
import { prisma } from 'wasp/server'
import { projectOfTaskOrNull } from '../projects/resourceEntitlement'

export type SessionProjectFields = {
  taskId: string | null
  primaryOwnerType: string | null
  primaryOwnerId: string | null
}

export async function projectIdOfSessionRow(row: SessionProjectFields): Promise<string | undefined> {
  if (row.taskId) return (await projectOfTaskOrNull(row.taskId)) ?? undefined
  if (row.primaryOwnerType === 'project' && row.primaryOwnerId) return row.primaryOwnerId
  return undefined
}

export async function projectIdOfSession(sessionId: string): Promise<string | undefined> {
  const row = await prisma.agentSession.findUnique({
    where: { id: sessionId },
    select: { taskId: true, primaryOwnerType: true, primaryOwnerId: true },
  })
  return row ? projectIdOfSessionRow(row) : undefined
}
