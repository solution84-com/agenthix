/**
 * A run's own page (RN1): the run as the Runs screen opens it (`screenRun.ts`, which decides who may see it), with
 * its number, where it sits, who started it and for whom, its limits, what it took and cost, and its neighbours. A
 * run named without its session is looked for among the tasks' runs, whose numbers HQ keeps.
 */
import { prisma } from 'wasp/server'
import type { RunRow } from '@agenthix/core'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { needOf } from '../projects/workroom/workroomRules'
import { costOf, dispatchFactsOf, placeRun, runLimitsOf, startedByWords, tookMs, whoseOf } from './historyRules'
import { readRunWithDetail } from './screenRun'
import type { RunNeighbour, RunPageView } from './runPageTypes'

/** How many of a task's runs are read to find the ones either side of this one. */
const NEIGHBOUR_WINDOW = 100

async function sessionOfRun(runId: string): Promise<string | null> {
  const result = await prisma.runResult.findUnique({ where: { runId }, select: { sessionId: true } })
  return result?.sessionId ?? null
}

async function neighbours(siteId: string, run: RunRow, number: number | null): Promise<{ previous: RunNeighbour | null; next: RunNeighbour | null }> {
  if (number === null || !run.taskId) return { previous: null, next: null }
  const results = await prisma.runResult.findMany({
    where: { taskId: run.taskId, number: { in: [number - 1, number + 1] } },
    select: { runId: true, sessionId: true, number: true },
  })
  if (results.length === 0) return { previous: null, next: null }
  const runs = await siteRuntimeStore.listRuns(siteId, { sessionId: run.sessionId, limit: NEIGHBOUR_WINDOW })
  const byId = new Map(runs.map(r => [r.id, r]))
  const one = (n: number): RunNeighbour | null => {
    const result = results.find(r => r.number === n)
    const row = result && byId.get(result.runId)
    // Only a run of this same session: a result naming another is not this task's to show here.
    return result && row && result.sessionId === run.sessionId
      ? { runId: row.id, sessionId: row.sessionId, number: n, status: row.status, endedAt: row.endedAt, at: row.startedAt ?? row.createdAt }
      : null
  }
  return { previous: one(number - 1), next: one(number + 1) }
}

export async function readRunPage(me: string, args: { runId: string; sessionId?: string }, now = new Date()): Promise<RunPageView | null> {
  const sessionId = args.sessionId ?? (await sessionOfRun(args.runId))
  if (!sessionId) return null
  const read = await readRunWithDetail(me, { runId: args.runId, sessionId })
  if (!read) return null
  const { detail, run, session, siteId, names } = read

  const task = session.taskId
    ? await prisma.task.findUnique({
      where: { id: session.taskId },
      select: { id: true, runId: true, state: true, runState: true, runStateReason: true, type: { select: { kind: true } } },
    })
    : null
  const need = task ? needOf({ ...task, typeKind: task.type?.kind ?? null }) : null
  const placed = placeRun(run, task ? { latestRunId: task.runId, need } : null)
  const kind = task ? 'task' as const : 'reply' as const
  const dispatch = dispatchFactsOf(run.metadata)
  const whose = whoseOf(dispatch, session.task?.runOnBehalfOfUserId ?? session.task?.onBehalfOfUserId ?? session.userId)
  const name = (id: string) => (id === me ? 'you' : names.users.get(id) ?? null)
  const result = task ? await prisma.runResult.findUnique({ where: { runId: run.id }, select: { number: true } }) : null
  const number = result?.number ?? null
  const limits = runLimitsOf(run.metadata)
  const near = await neighbours(siteId, run, number)

  return {
    detail, kind, number, taskId: task?.id ?? null,
    group: placed.group, ring: placed.ring, note: placed.note,
    startedBy: startedByWords(whose, kind, me, name, null),
    onBehalfOf: whose.personId ? name(whose.personId) ?? 'someone' : null,
    limits: limits ? { timeLimitMinutes: limits.timeLimitMinutes, turnLimit: whose.starter === 'person' ? null : limits.turnLimit } : null,
    tookMs: tookMs(run, now), cost: costOf(run), tokens: run.usage?.totalTokens ?? null,
    previous: near.previous, next: near.next,
    mayRunAgain: !!task && run.status === 'FAILED' && task.runId === run.id,
  }
}
