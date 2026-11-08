/**
 * Stop, on Workrooms (the Workrooms design): the viewer's own runs only — the tasks started by them or on their behalf
 * (adr-0095), and the replies in their own conversations — everywhere, in one project, or for one agent there. It
 * stops as an agent's Stop does (agentStop.ts): every waiting task of theirs goes back to Not started and loses any
 * Run at… time still to come (N4), in one write before any cancel is sent, so a run ending at the same moment finds
 * its task settled; a running task whose run cannot be confirmed stopped is put back as it was.
 *
 * Only where the viewer may work (Member or Admin): a project they only read is left alone and not counted.
 */
import { HttpError, prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { entitledProjectsFilter, mayWorkInProject } from '../membership'
import { restoreRunning, takeOutOfLine, type PendingTask } from '../agentStop'
import { stopRunsOfSessions, RunsNotConfirmedStopped } from '../projectRunStop'
import { notifyBoardsOfTasks } from '../boardNotify'
import { recordTaskActivity } from '../taskActivity'
import { mineTasks } from './workroomTasks'
import type { StopMyRunsResult } from './workroomTypes'

const STOP_TIMEOUT_MS = 10_000

/** The projects where the viewer has something to stop: a task of theirs waiting or running, or a start time to come. */
async function projectsToStop(me: string, scope: { projectId?: string; agentId?: string }, now: Date): Promise<string[]> {
  const rows = await prisma.task.findMany({
    where: {
      AND: [mineTasks(me), { project: entitledProjectsFilter(me) }],
      ...(scope.projectId ? { projectId: scope.projectId } : {}),
      ...(scope.agentId ? { assignedAgentId: scope.agentId } : {}),
      OR: [{ runState: { in: ['RUN_QUEUED', 'RUN_ACTIVE'] } }, { scheduleNextDueAt: { gt: now } }],
    },
    distinct: ['projectId'],
    select: { projectId: true },
  })
  // A reply of theirs going now was asked for within the day; older conversations have nothing running.
  const replies = await prisma.agentSession.findMany({
    where: {
      taskId: null, userId: me, primaryOwnerType: 'project',
      ...(scope.projectId ? { primaryOwnerId: scope.projectId } : {}),
      ...(scope.agentId ? { agentId: scope.agentId } : {}),
      updatedAt: { gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    },
    distinct: ['primaryOwnerId'],
    select: { primaryOwnerId: true },
  })
  return [...new Set([...rows.map(r => r.projectId), ...replies.flatMap(r => (r.primaryOwnerId ? [r.primaryOwnerId] : []))])]
}

async function stopInProject(projectId: string, me: string, by: string | undefined, agentId: string | undefined): Promise<{ withdrawn: number; cancelled: number }> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { executionSite: { select: { siteId: true } } } })
  const where: Prisma.TaskWhereInput = { AND: [mineTasks(me)], projectId, ...(agentId ? { assignedAgentId: agentId } : {}) }
  const { tasks } = await takeOutOfLine(where)
  const running = tasks.filter(t => t.runState === 'RUN_ACTIVE')
  const withRun = running.filter((t): t is PendingTask & { runId: string } => !!t.runId)
  const numbers = new Map((await prisma.runResult.findMany({ where: { runId: { in: withRun.map(t => t.runId) } }, select: { runId: true, number: true } }))
    .map(r => [r.runId, r.number]))
  await recordTaskActivity(withRun.map(t => ({
    taskId: t.id, kind: 'RUN_STOPPED' as const, actor: { kind: 'person' as const, userId: me }, runId: t.runId, detail: { number: numbers.get(t.runId) ?? null },
  })))
  try {
    const sessions: Prisma.AgentSessionWhereInput = {
      OR: [
        ...(running.length > 0 ? [{ taskId: { in: running.map(t => t.id) } }] : []),
        { taskId: null, sessionType: 'chat', userId: me, primaryOwnerType: 'project', primaryOwnerId: projectId, ...(agentId ? { agentId } : {}) },
      ],
    }
    const cancelled = await stopRunsOfSessions(sessions, project.executionSite?.siteId ?? null, { timeoutMs: STOP_TIMEOUT_MS, by })
    return { withdrawn: tasks.length - running.length, cancelled }
  } catch (err) {
    await restoreRunning(tasks)
    const runIds = withRun.map(t => t.runId)
    if (runIds.length > 0) await prisma.taskActivity.deleteMany({ where: { runId: { in: runIds }, kind: 'RUN_STOPPED' } })
    throw err
  } finally {
    await notifyBoardsOfTasks(tasks.map(t => t.id))
  }
}

export async function stopMyRuns(me: string, by: string | undefined, scope: { projectId?: string; agentId?: string }, now: Date = new Date()): Promise<StopMyRunsResult> {
  const projectIds = await projectsToStop(me, scope, now)
  const out: StopMyRunsResult = { withdrawn: 0, cancelled: 0, projects: 0 }
  const unconfirmed: string[] = []
  for (const projectId of projectIds) {
    if (!(await mayWorkInProject(projectId, me))) continue
    try {
      const r = await stopInProject(projectId, me, by, scope.agentId)
      out.withdrawn += r.withdrawn
      out.cancelled += r.cancelled
      out.projects += 1
    } catch (err) {
      if (!(err instanceof RunsNotConfirmedStopped)) throw err
      unconfirmed.push(err.detail)
    }
  }
  if (unconfirmed.length > 0) {
    throw new HttpError(409, `Not every run of yours could be confirmed stopped: ${unconfirmed.join('; ')}. Your waiting tasks were taken out of line. Try again.`)
  }
  return out
}
