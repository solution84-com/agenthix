/**
 * The task-machine's half of the `run.status` frame contract (@SC-339): a run's
 * end settles its task's run state, driven by frames relayed through
 * `siteEventHandler`. TaskRunner registers it once at module scope, so Node's
 * module cache is what makes that "once" (onRunStatus's own Map would replace a
 * second registration under the same name anyway).
 *
 * A task's state (its column) is its agent's; its run state is the system's and
 * says only whether a run is pending or going now (agents own schedule spec §6).
 * So the run's end decides the run state — whatever the agent did to the task
 * during the run — and then always starts the agent's next waiting task in the
 * project:
 *
 *   - finished, or stopped           → RUN_NONE
 *   - failed                         → RUN_FAILED, with the error as its reason —
 *                                      or, for lack of memory, disk or
 *                                      processes, that in a sentence
 *                                      (sites/resources/runResourceWords.ts)
 *   - stopped at a time or turn limit,
 *     or ended on a tool request     → RUN_BLOCKED, with the reason (both, when
 *                                      it was both); its person is told
 *                                      (taskWaitingNotification.ts)
 *   - paused for a scheduled change  → RUN_QUEUED, waiting for the change, its
 *                                      conversation marked to carry on
 *                                      (sites/scheduled/runHold.ts)
 *
 * Only the run the task's run state describes may settle it: the task must
 * still be RUN_ACTIVE, and its recorded run must be this frame's (or not yet
 * recorded, when the frame beats the dispatch's own acknowledgement). A
 * duplicate frame, a reconcile replay, or a frame from an earlier run therefore
 * changes nothing on the task — a person's Stop, a loss of access or a revoked
 * site settled it first — but its agent's slot is still free, so the next
 * waiting task starts. That start is claimed atomically (taskSlotClaim.ts), so
 * a duplicate frame cannot start two.
 *
 * `triggerNext` is handed in rather than imported: it is a method on
 * TaskRunner, and importing it back would make the two files a cycle.
 */
import { prisma } from 'wasp/server'
import type { Agent, Prisma, TaskRunState } from '@prisma/client'
import type { RunStatusEvent } from '@agenthix/core'
import { isRunLimitReason, isRunPausedReason } from '@agenthix/core'
import { Logger } from '../server/utils/logger'
import { createTaskComment } from '../projects/projectService'
import { onRunStatus } from '../sites/channel/siteEventHandler'
import * as dispatchService from './dispatchService'
import { archiveTaskSession } from './taskSessionArchive'
import { enqueueForTask } from './taskFrameChain'
import { MANIFEST_BLOCKED_REASON } from './taskExecutionReasons'
import { nudgeScheduler } from '../automation/schedulerNudge'
import { notifyBoardsOfTasks } from '../projects/boardNotify'
import { notifyApprovalWaiting } from './approvalNotification'
import { notifyTaskWaiting } from './taskWaitingNotification'
import { PAUSED_WAITING_REASON, markTaskConversationPaused, pausedTaskReason } from '../sites/scheduled/runHold'
import { shortRunSentence, siteNameOf } from '../sites/resources/runResourceWords'

const logger = new Logger('TaskRunner')

type TriggerNext = (agent: Agent, projectId: string | null) => Promise<void>

export function registerTaskStatusListener(triggerNext: TriggerNext): void {
  onRunStatus('task-machine', async (e, siteId) => {
    if (!e.taskId) return
    const taskId = e.taskId
    await enqueueForTask(taskId, () => processTaskStatus(e, taskId, siteId, triggerNext))
    // A run that ended may close a pulse's round or free its agent for the next task.
    if (e.manifestPending || isTerminalFrame(e)) nudgeScheduler()
  })
}

function isTerminalFrame(e: RunStatusEvent): boolean {
  return e.status === 'COMPLETED' || e.status === 'FAILED' || e.status === 'CANCELLED'
}

/** What a run's end leaves the task's run state at. */
export function settledRunState(e: RunStatusEvent): { runState: TaskRunState; reason: string | null } {
  // A frame carrying a deferred tool request needs a person's approval, whatever
  // its own status (a run that failed after deferring still has the request).
  // A run that also hit its time or turn limit keeps that reason beside it.
  if (e.manifestPending) {
    const limit = e.status === 'CANCELLED' && isRunLimitReason(e.error) ? e.error : null
    return { runState: 'RUN_BLOCKED', reason: limit ? `${MANIFEST_BLOCKED_REASON} — ${limit}` : MANIFEST_BLOCKED_REASON }
  }
  // Retrying a run stopped at its limit would only reach the limit again.
  if (e.status === 'CANCELLED' && isRunLimitReason(e.error)) return { runState: 'RUN_BLOCKED', reason: e.error }
  // Paused at the end of a step for a scheduled change: it waits, and carries on afterwards.
  if (e.status === 'CANCELLED' && isRunPausedReason(e.error)) return { runState: 'RUN_QUEUED', reason: PAUSED_WAITING_REASON }
  if (e.status === 'FAILED') return { runState: 'RUN_FAILED', reason: e.error ?? 'run failed' }
  return { runState: 'RUN_NONE', reason: null }
}

/** The task's run state still describes this run: RUN_ACTIVE, for this run or one not yet recorded. */
export function thisRunIsCurrent(runId: string): Prisma.TaskWhereInput {
  return { runState: 'RUN_ACTIVE', OR: [{ runId: null }, { runId }] }
}

async function processTaskStatus(e: RunStatusEvent, taskId: string, siteId: string, triggerNext: TriggerNext): Promise<void> {
  // A bare RUNNING frame changes nothing: the task is RUN_ACTIVE from its claim.
  if (!e.manifestPending && !isTerminalFrame(e)) return

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { assignedAgentId: true, projectId: true },
  })
  if (!task) {
    logger.warn(`TaskRunner: status frame for unknown task ${taskId} (run ${e.runId}) — dropped`)
    return
  }

  // Frame↔session ownership check (T9 binding c): a frame must come from the
  // site that actually owns this task. A stray frame from a sibling site (a
  // misconfiguration, or a stale connection outliving a reassignment) must
  // never mutate a task it has no business touching.
  const ownerSiteId = await dispatchService.resolveSiteIdForTask(taskId)
  if (ownerSiteId !== siteId) {
    logger.warn(
      `TaskRunner: status frame for task ${taskId} arrived from site ${siteId}, but the task belongs to ${ownerSiteId} — dropped`,
    )
    return
  }

  const settled = settledRunState(e)
  if (settled.runState === 'RUN_QUEUED') settled.reason = await pausedTaskReason(siteId)
  // A run that stopped for lack of resources says so, with the limit it hit and who was told (spec §10).
  if (settled.runState === 'RUN_FAILED' && e.resource) settled.reason = shortRunSentence(e.resource, await siteNameOf(siteId)) ?? settled.reason
  const { count } = await prisma.task.updateMany({
    where: { id: taskId, ...thisRunIsCurrent(e.runId) },
    data: { runState: settled.runState, runStateReason: settled.reason, runId: e.runId },
  })
  if (count === 1) {
    if (settled.runState === 'RUN_QUEUED') await markTaskConversationPaused(taskId)
    await notifyBoardsOfTasks([taskId])
    await afterSettled(e, taskId, siteId, settled.runState)
    // A tool request is told by its approval notification, in afterSettled.
    if (settled.runState === 'RUN_BLOCKED' && !e.manifestPending) await notifyTaskWaiting(taskId, settled.reason)
  }
  else logger.info(`TaskRunner: run ${e.runId} of task ${taskId} ended after its run state was settled — left as it is`)

  // The run has ended, whatever its agent did to the task meanwhile, so the
  // agent's slot in the project is free and its next waiting task starts.
  await triggerNextFor(task.assignedAgentId, task.projectId, triggerNext)
}

async function afterSettled(e: RunStatusEvent, taskId: string, siteId: string, runState: TaskRunState): Promise<void> {
  if (e.manifestPending) {
    const { runId, summary, pendingManifest } = e.manifestPending
    await createTaskComment({
      taskId,
      authorType: 'AGENT',
      agentId: e.agentId,
      runId,
      content: `__MANIFEST_APPROVAL__:${JSON.stringify({ runId, summary, pendingManifest })}`,
    })
    logger.info(`TaskRunner: deferred tools pending approval — run ${runId} (task: ${taskId})`)
    await notifyApprovalWaiting(taskId, e.agentId, summary)
    return
  }
  // A run that finished or failed closes the task's session; a stopped or
  // blocked one leaves it open for the run that follows.
  if (e.status === 'COMPLETED' || e.status === 'FAILED') {
    await archiveTaskSession(siteId, taskId, e.sessionId, runState)
  }
}

async function triggerNextFor(assignedAgentId: string | null, projectId: string | null, triggerNext: TriggerNext): Promise<void> {
  if (!assignedAgentId) return
  const agent = await prisma.agent.findUnique({ where: { id: assignedAgentId } })
  if (!agent) return
  await triggerNext(agent, projectId)
}
