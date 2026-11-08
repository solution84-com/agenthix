/**
 * An agent's Stop (spec D17, RU4): its line in the project is emptied and its running work there stopped. Every task
 * of the agent's that waits — in its line, or for a Run at… time — goes back to Not started, and nothing more starts
 * for it until someone starts it (N4, as Stop every run does for the whole project, placeRunStop.ts).
 *
 * The order is what keeps it safe against a run ending at the same moment: the waiting and the running tasks are
 * settled to RUN_NONE in one write before any cancel is sent. A run's end that arrives after it finds its task
 * settled and changes nothing, and the next claim it triggers finds the line empty. A task claimed between the read
 * and that write is settled by it too, and the run its dispatch then starts is cancelled (TaskRunner
 * `stoppedDuringDispatch`). If a running task's run cannot be confirmed stopped, that task is put back as it was, so it
 * is never shown stopped while it still runs; a waiting task stays withdrawn.
 */
import { HttpError, prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { withExecutionState } from './executionState'
import { notifyBoardsOfTasks } from './boardNotify'
import { stopRunsOfSessions, RunsNotConfirmedStopped } from './projectRunStop'
import { recordTaskActivity } from './taskActivity'

/** A person waits on this, as on Stop every run. */
const STOP_TIMEOUT_MS = 10_000

const PENDING: Prisma.TaskWhereInput = { runState: { in: ['RUN_QUEUED', 'RUN_ACTIVE'] } }

export type PendingTask = { id: string; runState: string; runStateReason: string | null; runId: string | null }

/** No start time is left on a task taken out of line: a Run at… is a wait like any other (N4). */
export const CLEARED_START_TIME = {
  scheduleAt: null, scheduleNextDueAt: null,
  scheduleSetByUserId: null, scheduleSetByAgentId: null, scheduleSetBySessionId: null, scheduleSetByConnectionId: null,
} as const

/**
 * Settles every pending task `where` selects to Not started, in one write, and clears every start time still to come
 * there. Returns the tasks it settled, as they were.
 */
export async function takeOutOfLine(where: Prisma.TaskWhereInput, now: Date = new Date()): Promise<{ tasks: PendingTask[]; startTimes: number }> {
  const tasks = await prisma.task.findMany({ where: { ...where, ...PENDING }, select: { id: true, runState: true, runStateReason: true, runId: true } })
  if (tasks.length > 0) {
    await prisma.task.updateMany({
      where: { id: { in: tasks.map(t => t.id) }, ...PENDING },
      data: { ...withExecutionState({ runState: 'RUN_NONE', runStateReason: null }), runStartedBy: null },
    })
  }
  const { count: startTimes } = await prisma.task.updateMany({
    where: { ...where, scheduleNextDueAt: { gt: now } },
    data: CLEARED_START_TIME,
  })
  return { tasks, startTimes }
}

/**
 * A running task whose run may not have stopped is put back as it was, so it is never shown as stopped while it
 * still runs; its run's end settles it as usual. A queued task stays withdrawn: it had not started.
 */
export async function restoreRunning(tasks: PendingTask[]): Promise<void> {
  for (const task of tasks.filter(t => t.runState === 'RUN_ACTIVE')) {
    await prisma.task.updateMany({
      where: { id: task.id, runState: 'RUN_NONE' },
      data: { ...withExecutionState({ runState: 'RUN_ACTIVE' as const, runStateReason: task.runStateReason }), runId: task.runId },
    })
  }
}

export type StopAgentResult = { withdrawn: number; cancelled: number }

export async function stopAgent(projectId: string, agentId: string, userId: string, by?: string): Promise<StopAgentResult> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { executionSite: { select: { siteId: true } } } })
  const { tasks } = await takeOutOfLine({ projectId, assignedAgentId: agentId })
  const running = tasks.filter(t => t.runState === 'RUN_ACTIVE')
  // Recorded before the cancels are sent, so a stopped run's own end finds its stop already the person's.
  const withRun = running.filter((t): t is PendingTask & { runId: string } => !!t.runId)
  const numbers = new Map((await prisma.runResult.findMany({ where: { runId: { in: withRun.map(t => t.runId) } }, select: { runId: true, number: true } }))
    .map(r => [r.runId, r.number]))
  await recordTaskActivity(withRun.map(t => ({
    taskId: t.id, kind: 'RUN_STOPPED' as const, actor: { kind: 'person' as const, userId }, runId: t.runId, detail: { number: numbers.get(t.runId) ?? null },
  })))
  try {
    const cancelled = running.length === 0 ? 0 : await stopRunsOfSessions(
      { taskId: { in: running.map(t => t.id) } },
      project.executionSite?.siteId ?? null,
      { timeoutMs: STOP_TIMEOUT_MS, by },
    )
    return { withdrawn: tasks.length - running.length, cancelled }
  } catch (err) {
    await restoreRunning(tasks)
    const runIds = running.map(t => t.runId).filter((id): id is string => !!id)
    if (runIds.length > 0) await prisma.taskActivity.deleteMany({ where: { runId: { in: runIds }, kind: 'RUN_STOPPED' } })
    if (err instanceof RunsNotConfirmedStopped) {
      throw new HttpError(err.status, `Not every run of this agent could be confirmed stopped: ${err.detail}. Its waiting tasks were taken out of line. Try again.`)
    }
    throw err
  } finally {
    await notifyBoardsOfTasks(tasks.map(t => t.id))
  }
}
