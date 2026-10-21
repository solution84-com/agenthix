/**
 * The active-runs read (person-scoped execution spec §3, task 2.18) —
 * `run.listActive`. Site's own AgentRun rows, joined to their AgentSession by
 * the session's primary owner, so hq can ask "what is running in this
 * boundary" without fetching every run on the site and filtering client-side.
 *
 * Ids, status and times only — never `inputText`/`outputText`/`title` or
 * anything else a run or session carries. hq resolves the ids to names from
 * its own records (spec §3, "Where the data comes from").
 */
import { prisma } from '#db'
import type { ActiveRunRow, ActiveRunsParams, ActiveRunsResult } from '@agenthix/core'

export async function listActiveRuns(params: ActiveRunsParams): Promise<ActiveRunsResult> {
  const runs = await prisma.agentRun.findMany({
    where: {
      status: { in: ['PENDING', 'RUNNING'] },
      session: { primaryOwnerType: params.ownerType, primaryOwnerId: params.ownerId },
    },
    select: { id: true, sessionId: true, agentId: true, taskId: true, status: true, startedAt: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  const rows: ActiveRunRow[] = runs.map((r) => ({
    runId: r.id,
    sessionId: r.sessionId,
    agentId: r.agentId,
    taskId: r.taskId,
    status: r.status as ActiveRunRow['status'],
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }))
  return { runs: rows }
}
