/**
 * Shared helpers for the READ surface re-point (plan 5d-2 task 9b) —
 * privacy filtering (ADR-0041: chat runs are owner-only, ADMIN included;
 * task runs are their project's), needed by more than one query in
 * sessions/queries.ts and agents/queries.ts. Split out rather than duplicated
 * inline, and kept out of those files to stay under the repo's 300/500-line
 * file-size rule.
 *
 * It no longer resolves "hq's own site" for a read with no session, task or
 * agent to anchor to. Such a read belongs to no site at all: it asks every one
 * of them and merges the answers (`mergedRunFeed.ts`, `combinedRead.ts`).
 */
import { prisma } from 'wasp/server'
import type { RunRow } from '@agenthix/core'
import { entitledProjectsFilter } from '../projects/membership'
import { personalSessionOwner } from './sessionEntitlement'

export type OwnedSession = {
  id: string
  userId: string
  sessionType: string
  title: string | null
  taskId?: string | null
  task?: { projectId: string } | null
  primaryOwnerType?: string | null
  primaryOwnerId?: string | null
}

/**
 * The same three boundaries `sessions/sessionEntitlement.ts` states for a
 * session's content, applied to a run in a listing: a chat run is visible only
 * to its session's own owner (ADR-0041); a task run is visible to the members
 * of its task's project (ADR-0062); a run in a person's own storage is theirs alone
 * (`personalSessionOwner`); a task run whose task was deleted is nobody's.
 *
 * `entitledProjectIds` is the set of projects the viewer may see, out of the
 * projects these runs' sessions actually belong to — `entitledProjectIdsFor`
 * below builds it in one query rather than a membership check per run.
 */
export function isRunVisible(
  session: OwnedSession | undefined,
  userId: string,
  entitledProjectIds: ReadonlySet<string>,
): boolean {
  if (!session) return false
  if (session.sessionType === 'chat') return session.userId === userId
  const owner = personalSessionOwner(session)
  if (owner !== null) return owner === userId
  const projectId = session.task?.projectId
  return projectId !== undefined && entitledProjectIds.has(projectId)
}

/**
 * hq's own AgentSession copy authors `userId`/`sessionType` (D3) — reading
 * them locally to decide run visibility is safe and avoids a second channel
 * round trip per run. The task's `projectId` comes along for the entitlement
 * half of that decision.
 */
export async function ownedSessionsFor(runs: RunRow[]): Promise<Map<string, OwnedSession>> {
  const sessionIds = [...new Set(runs.map((r) => r.sessionId))]
  if (sessionIds.length === 0) return new Map()
  const sessions = await prisma.agentSession.findMany({
    where: { id: { in: sessionIds } },
    select: {
      id: true, userId: true, sessionType: true, title: true, taskId: true,
      primaryOwnerType: true, primaryOwnerId: true,
      task: { select: { projectId: true } },
    },
  })
  return new Map(sessions.map((s) => [s.id, s]))
}

/**
 * Which of the projects these sessions belong to the viewer is entitled to —
 * one query over only the projects in play, the same rule `getTaskSessions`
 * applies to its own listing (`entitledProjectsFilter`). An empty set when no
 * session here has a project at all, and no query in that case.
 */
export async function entitledProjectIdsFor(
  sessions: Iterable<OwnedSession>,
  userId: string,
): Promise<ReadonlySet<string>> {
  const ids = [...new Set([...sessions].map((s) => s.task?.projectId).filter((id): id is string => !!id))]
  if (ids.length === 0) return new Set()
  const rows = await prisma.project.findMany({
    where: { id: { in: ids }, ...entitledProjectsFilter(userId) },
    select: { id: true },
  })
  return new Set(rows.map((r) => r.id))
}

/**
 * The visibility rule above, packaged for a read that must apply it BEFORE it
 * slices a page — a non-member gets a filtered feed, not a shorter one.
 *
 * `sessionById` fills as the filter runs and is the same map the caller then
 * decorates its rows from, so the session lookup happens once rather than once
 * to decide visibility and again to render a title.
 */
export function runVisibilityFilter(userId: string): {
  visible: (runs: RunRow[]) => Promise<RunRow[]>
  sessionById: Map<string, OwnedSession>
} {
  const sessionById = new Map<string, OwnedSession>()
  return {
    sessionById,
    visible: async (runs: RunRow[]) => {
      const sessions = await ownedSessionsFor(runs)
      for (const [id, session] of sessions) sessionById.set(id, session)
      const entitled = await entitledProjectIdsFor(sessions.values(), userId)
      return runs.filter((run) => isRunVisible(sessions.get(run.sessionId), userId, entitled))
    },
  }
}
