/**
 * A task's runs as hq records them (runResults.ts writes the rows): each run's number, given as it starts and never
 * reused, and a task's result, which is its latest run's, so a run that states none never shows an earlier run's as
 * current. Only the database: imported by the reads and by TaskRunner, it reaches no channel.
 */
import { prisma } from 'wasp/server'

export type TaskRunStart = { runId: string; siteId: string; sessionId: string; taskId: string }

/**
 * Gives a task's run its number as it starts: one more than the task's count, counted in the same transaction, so
 * a number is never reused. A run already numbered keeps its number; a row its end made first is given one.
 */
export async function numberTaskRun(run: TaskRunStart): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.runResult.findUnique({ where: { runId: run.runId }, select: { number: true } })
    if (existing?.number != null) return existing.number
    const { runCount } = await tx.task.update({ where: { id: run.taskId }, data: { runCount: { increment: 1 } }, select: { runCount: true } })
    await tx.runResult.upsert({
      where: { runId: run.runId },
      create: { ...run, number: runCount, result: null, stated: false },
      update: { number: runCount },
    })
    return runCount
  })
}

export type LatestTaskRun = { runId: string; number: number | null; result: string | null; stated: boolean }

/** Each task's latest run, by its number: what its result is now. A task with no run is not in the map. */
export async function latestTaskRuns(taskIds: string[]): Promise<Map<string, LatestTaskRun>> {
  const ids = [...new Set(taskIds)]
  if (ids.length === 0) return new Map()
  const rows = await prisma.runResult.findMany({
    where: { taskId: { in: ids } },
    orderBy: [{ taskId: 'asc' }, { number: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    distinct: ['taskId'],
    select: { taskId: true, runId: true, number: true, result: true, stated: true },
  })
  return new Map(rows.map(r => [r.taskId!, { runId: r.runId, number: r.number, result: r.stated ? r.result : null, stated: r.stated }]))
}

/** Rows with their latest run's result beside them, as the task's wire fields carry it. */
export async function withLatestResults<T extends { id: string }>(rows: T[]): Promise<(T & { result: string | null })[]> {
  const latest = await latestTaskRuns(rows.map(r => r.id))
  return rows.map(r => ({ ...r, result: latest.get(r.id)?.result ?? null }))
}
