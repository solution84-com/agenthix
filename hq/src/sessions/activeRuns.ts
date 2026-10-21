/**
 * Resolves the active-runs read (person-scoped execution spec §3, ADR-0077)
 * into names hq already holds — the agent, who or what started the run, and
 * where it is working — from hq's own records. The site answers with ids,
 * status and times only (`activeRunsRows.ts` on site); this is the one place
 * that turns those ids into what a person or an agent is shown, so the
 * project's running-now view (`activeRunsQueries.ts`) and the
 * `list_active_runs` platform tool (`server/controlplane/activeRunsOp.ts`)
 * can never diverge on what "the run's boundary" resolves to or what counts
 * as content.
 *
 * Carries no content: no session title, no message text, no run input/output
 * — see ADR-0077's "existence is visible, content is not".
 */
import { HttpError, prisma } from 'wasp/server'
import type { WorkspaceOwnerType } from '@agenthix/core'
import { resolveOwnerSiteId } from '../storage/ownerSite'
import { listActiveRuns as listActiveRunsOnSite } from './siteRuntimeStore'
import { listWorkspacesByOwner } from '../storage/workspaceStore'
import { peopleByIds } from '../server/identity/people'

/** Who or what started the run — a person's chat, or a task run. */
export type ActiveRunStartedBy =
  | { kind: 'person'; userId: string; name: string }
  | { kind: 'task'; taskId: string; title: string }

/** Where the run is working — a workspace, a task's own folder, or the boundary's files. */
export type ActiveRunLocation =
  | { kind: 'workspace'; workspaceId: string; name: string }
  | { kind: 'task'; taskId: string }
  | { kind: 'files' }

export type ActiveRunView = {
  runId: string
  agentId: string
  agentName: string
  status: 'PENDING' | 'RUNNING'
  startedBy: ActiveRunStartedBy
  location: ActiveRunLocation
  /** ISO timestamp — when the run started, or when it was created if still PENDING. */
  since: string
  /** True when another active run in this boundary is working in the same workspace. */
  sharesWorkspace: boolean
}

/**
 * Everything active in one storage boundary, named from hq's own records.
 * Propagates `SiteUnreachableError` (from `siteRuntimeStore`) when the site
 * holding the boundary cannot answer — never an empty list, per spec §3's
 * "cost" — and `HttpError` when the boundary names no site at all.
 */
export async function resolveActiveRuns(ownerType: WorkspaceOwnerType, ownerId: string): Promise<ActiveRunView[]> {
  const siteId = await resolveOwnerSiteId(ownerType, ownerId)
  if (!siteId) throw new HttpError(400, 'No Execution Site available for this owner')

  const { runs } = await listActiveRunsOnSite(siteId, { ownerType, ownerId })
  if (runs.length === 0) return []

  const sessionIds = [...new Set(runs.map((r) => r.sessionId))]
  const agentIds = [...new Set(runs.map((r) => r.agentId))]
  const taskIds = [...new Set(runs.filter((r) => r.taskId).map((r) => r.taskId as string))]

  // `in: []` is a valid, empty-matching filter — Prisma needs no special-casing
  // for an empty id list, so every lookup below runs unconditionally.
  const [sessions, agents, tasks] = await Promise.all([
    prisma.agentSession.findMany({
      where: { id: { in: sessionIds } },
      select: { id: true, userId: true, primaryWorkspaceId: true },
    }),
    prisma.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } }),
    prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, title: true } }),
  ])
  const sessionById = new Map(sessions.map((s) => [s.id, s]))
  const agentById = new Map(agents.map((a) => [a.id, a]))
  const taskById = new Map(tasks.map((t) => [t.id, t]))

  // Chats only — a task run's "started by" is the task itself, resolved above.
  const userIds = [...new Set(
    runs
      .filter((r) => !r.taskId)
      .map((r) => sessionById.get(r.sessionId)?.userId)
      .filter((id): id is string => !!id),
  )]
  const people = await peopleByIds(userIds)
  const nameByUserId = new Map([...people].map(([id, p]): [string, string] => [id, p.name]))

  // One batch read for every workspace name this boundary might need — the
  // same call hq's storage pages already use (`workspaceStore.ts`,
  // `select: 'names'`), so a run's location never triggers a second kind of
  // site read.
  const workspaceIds = [...new Set(sessions.map((s) => s.primaryWorkspaceId).filter((id): id is string => !!id))]
  const workspaceNameById = new Map<string, string>()
  if (workspaceIds.length > 0) {
    const names = await listWorkspacesByOwner(siteId, ownerType, ownerId, 'names')
    for (const w of names) workspaceNameById.set(w.id, w.name)
  }

  // How many active runs share each workspace — the flag task 2.19 asks for.
  const workspaceUseCount = new Map<string, number>()
  for (const r of runs) {
    const wsId = sessionById.get(r.sessionId)?.primaryWorkspaceId ?? null
    if (wsId) workspaceUseCount.set(wsId, (workspaceUseCount.get(wsId) ?? 0) + 1)
  }

  return runs.map((r) => {
    const session = sessionById.get(r.sessionId)
    const workspaceId = session?.primaryWorkspaceId ?? null

    const startedBy: ActiveRunStartedBy = r.taskId
      ? { kind: 'task', taskId: r.taskId, title: taskById.get(r.taskId)?.title ?? 'Unknown task' }
      : {
          kind: 'person',
          userId: session?.userId ?? '',
          name: session ? nameByUserId.get(session.userId) ?? 'Unknown' : 'Unknown',
        }

    const location: ActiveRunLocation = workspaceId
      ? { kind: 'workspace', workspaceId, name: workspaceNameById.get(workspaceId) ?? 'Unknown workspace' }
      : r.taskId
        ? { kind: 'task', taskId: r.taskId }
        : { kind: 'files' }

    return {
      runId: r.runId,
      agentId: r.agentId,
      agentName: agentById.get(r.agentId)?.name ?? 'Unknown agent',
      status: r.status,
      startedBy,
      location,
      since: r.startedAt ?? r.createdAt,
      sharesWorkspace: workspaceId ? (workspaceUseCount.get(workspaceId) ?? 0) > 1 : false,
    }
  })
}
