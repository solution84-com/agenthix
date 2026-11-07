import { type StopTask } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import type { StopResult, TaskIdArgs } from '@agenthix/core'
import * as dispatchService from '../agents/dispatchService'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { personName } from '../sessions/transcriptAuthors'
import { rethrowSiteUnreachableAsHttp } from '../storage/httpErrors'
import { requireTaskAccess } from './resourceEntitlement'
import { updateTask as updateTaskRecord } from './projectService'
import { recordTaskActivity } from './taskActivity'

/**
 * The task page's Stop. It withdraws the task's pending run — cancelling it on
 * its site if it is going — and leaves the task with no run pending (RUN_NONE),
 * because a person asked for the stop and the run did not fail.
 *
 * The run state goes to RUN_NONE before the cancel is sent: the cancelled run's
 * status frame can reach hq before this action returns, and the status listener
 * then finds the run already settled and only frees the agent's slot
 * (taskStatusListener.ts). If the cancel cannot be delivered the run state is
 * put back as it was, so the page never claims nothing is pending over a run
 * that is still spending.
 *
 * Only a running task has a run to cancel. A queued or throttled one is simply
 * withdrawn, and no site is asked. A failed or blocked run has nothing to stop
 * — a person clears it by running the task again or dismissing it — so it is
 * left as it is; the answer is `cancelled: 0` for all of these.
 */
export const stopTask: StopTask<TaskIdArgs, StopResult> = async ({ taskId }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireTaskAccess(taskId, context.user.id, 'Stopping this task')

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { runState: true, runStateReason: true, runId: true },
  })
  if (!task) throw new HttpError(404, 'Task not found')

  if (task.runState !== 'RUN_QUEUED' && task.runState !== 'RUN_THROTTLED' && task.runState !== 'RUN_ACTIVE') return { cancelled: 0 }
  await updateTaskRecord({ taskId, runState: 'RUN_NONE', runStateReason: null })
  if (task.runState !== 'RUN_ACTIVE') return { cancelled: 0 }
  // Recorded before the cancel is sent, so the stopped run's own end finds its stop already the person's.
  if (task.runId) {
    const run = await prisma.runResult.findUnique({ where: { runId: task.runId }, select: { number: true } })
    await recordTaskActivity({ taskId, kind: 'RUN_STOPPED', actor: { kind: 'person', userId: context.user.id }, runId: task.runId, detail: { number: run?.number ?? null } })
  }

  try {
    const siteId = await dispatchService.resolveSiteIdForTask(taskId)
    const activeRuns = await siteRuntimeStore.listRuns(siteId, { taskId, activeOnly: true })
    const by = await personName(context.user.id)
    for (const run of activeRuns) {
      await siteRuntimeStore.cancelRun(siteId, run.id, undefined, by)
    }
    return { cancelled: activeRuns.length }
  } catch (err) {
    // The run goes on: its stop did not happen.
    if (task.runId) await prisma.taskActivity.deleteMany({ where: { runId: task.runId, kind: 'RUN_STOPPED' } })
    await updateTaskRecord({
      taskId,
      runState: task.runState,
      runStateReason: task.runStateReason,
    })
    rethrowSiteUnreachableAsHttp(err)
  }
}
