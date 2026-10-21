/**
 * TaskRunner
 * ==========
 * Task dispatcher (plan 5d-2 task 9a — the dispatch flip). Claiming
 * (RUN_QUEUED → RUN_ACTIVE), per-(agent, project) serialisation and
 * trigger-next live here. `dispatchClaimed()` dispatches to site via
 * `dispatchService.dispatchTaskRun` and returns as soon as the dispatch is
 * acknowledged — it does not wait for the run to finish. The run's end, which
 * settles the run state, arrives in the status listener
 * (`taskStatusListener.ts`), driven by `run.status` frames relayed through
 * `siteEventHandler`. Every run this module dispatches executes on site;
 * nothing here runs a turn in-process.
 *
 * The run state is the system's alone (agents own schedule spec §6): nothing
 * an agent does to its task — moving it, finishing it — changes it.
 *
 * Concurrency model (see docs/domains/agents/task-execution-concurrency.md):
 *   - Atomic claim: RUN_QUEUED → RUN_ACTIVE under a database lock on the
 *     (agent, project) pair (taskSlotClaim.ts): one RUN_ACTIVE task at a
 *     time per pair; a start asked for while the slot is held stays RUN_QUEUED,
 *     marked as asked for
 *   - Trigger-next: when a run ends, the agent's next task asked to start in
 *     the project goes ahead; the rest of its line is the pulse's, which the
 *     scheduler is nudged to start (automation/pulse.ts)
 *
 * Called by:
 *   - runTask action (manual run from UI)
 *   - the run_task MCP tool (an agent starting a task in its own project)
 *   - runBoard / runProject actions (user-triggered from board/project view)
 *   - the automation scheduler (a boundary's pulse, a task's schedule)
 *   - drainHeldTasks (this module), on site reconnect
 */
import { prisma } from 'wasp/server'
import type { Agent } from '@prisma/client'
import { parseRunStartedBy, type RunStartedBy } from '@agenthix/core'
import { Logger } from '../server/utils/logger'
import { SiteUnreachableError } from '../storage/workspaceStore'
import * as dispatchService from './dispatchService'
import { DISPATCH_DECLINED_REASON, HELD_FOR_RECONNECT_REASON, RunPersonLostAccessError } from './taskExecutionReasons'
import { OnBehalfOfLostAccessError, LOST_ACCESS_REASON } from '../projects/taskOnBehalfOf'
import { registerTaskStatusListener } from './taskStatusListener'
import { registerTaskSessionApprovalListener } from './taskSessionApproval'
import { failTasksForRevokedSite } from './revokedSiteSweep'
import { tasksRunOnSite } from '../projects/personalProject'
import { registerActiveRunTracker } from '../sites/activeRunTracker'
import { claimNext, claimTask, type NextClaim } from './taskSlotClaim'
import { markTaskNotificationsHandled } from '../notifications/handled'
import { nudgeScheduler } from '../automation/schedulerNudge'
import { notifyBoardsOfTasks } from '../projects/boardNotify'
import { scheduledChangeHold } from '../sites/scheduled/runHold'

export {
  HELD_FOR_RECONNECT_REASON,
  SITE_REVOKED_REASON,
  UNPLACEABLE_REASON,
  MANIFEST_BLOCKED_REASON,
} from './taskExecutionReasons'

const logger = new Logger('TaskRunner')

function holdsForReconnect(err: unknown): boolean {
  return err instanceof SiteUnreachableError && !err.revoked
}

/**
 * What `runTask` did: dispatched it, left it queued behind the agent's running
 * task (it goes next), found it not pending, or could not start it (the run
 * state then says why: failed, blocked, or held for its site's reconnect).
 */
export type RunTaskOutcome = 'started' | 'waiting' | 'skipped' | 'failed'

export type RunTaskResult = { outcome: RunTaskOutcome; reason?: string }

/** A task held for its site records what started it; a value it cannot read is never taken for a person. */
function storedStartedBy(value: string | null): RunStartedBy {
  return parseRunStartedBy(value) ?? 'pulse'
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** The task is still the claim this dispatch made: RUN_ACTIVE, with no run recorded yet. */
const STILL_CLAIMED = { runState: 'RUN_ACTIVE', runId: null } as const

export class TaskRunner {
  /**
   * Start this task now, for whoever asked (a person, a schedule, an agent's
   * `run_task`, or the reconnect drain with its stored starter). `personId` is
   * the person a person's start is on behalf of.
   *
   * Claims it under the (agent, project) lock (`taskSlotClaim.ts`):
   * free, the task steps to RUN_ACTIVE and is dispatched; held, it stays
   * RUN_QUEUED, asked to start, and goes ahead with the same `startedBy` when
   * the agent's running task ends. A queued or throttled task may be started;
   * anything else is skipped. Fire-and-forget safe — callers may void this.
   */
  async runTask(taskId: string, agent: Agent, startedBy: RunStartedBy = 'person', personId?: string | null): Promise<RunTaskResult> {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true, queuedByUserId: true } })
    if (!task) {
      logger.warn(`TaskRunner: task ${taskId} not found — skipping`)
      return { outcome: 'skipped' }
    }
    // A person's start is on their behalf. Unnamed, it is whoever just queued it —
    // the Run action queues it as them before it calls this; null names nobody.
    const person = personId === undefined ? task.queuedByUserId : personId
    const claim = await claimTask(taskId, agent.id, task.projectId, startedBy, person)
    if (claim === 'skipped') {
      logger.info(`TaskRunner: task ${taskId} has no run pending — skipping (already started, or withdrawn)`)
      return { outcome: 'skipped' }
    }
    if (claim === 'waiting') {
      logger.info(`TaskRunner: agent ${agent.handle} already running a task in project ${task.projectId} — task ${taskId} goes next`)
      return { outcome: 'waiting' }
    }
    return this.dispatchClaimed(taskId, agent, startedBy)
  }

  /**
   * Start the first task in the agent's line in the project, if its slot is
   * free: a start someone asked for first, then — with `includePulse`, which
   * only the pulse passes — the rest of the line, as the pulse. Waits for the
   * dispatch, so the pulse can record how each start went.
   */
  async startNext(agent: Agent, projectId: string, includePulse: boolean): Promise<(NextClaim & RunTaskResult) | null> {
    const next = await claimNext(agent.id, projectId, includePulse)
    if (!next) return null
    logger.info(`TaskRunner: starting task ${next.id} for agent ${agent.handle} (${next.startedBy})`)
    return { ...next, ...(await this.dispatchClaimed(next.id, agent, next.startedBy)) }
  }

  /**
   * Dispatch a task already stepped to RUN_ACTIVE (by `claimTask` or `claimNext`, from runTask
   * or trigger-next), and record the run it was given — the run whose end may
   * settle its run state (taskStatusListener.ts).
   *
   * The catch below distinguishes two failure shapes (SC-340): a
   * `SiteUnreachableError` (the dispatch itself never reached site) returns
   * the task to RUN_QUEUED with a held-for-reconnect reason rather than
   * RUN_FAILED — `drainHeldTasks` re-runs it once the site reconnects, through
   * the ordinary claim path so serialisation still applies. A revoked site's
   * error is not held — that site never reconnects — so it takes the same
   * path as every other error: RUN_FAILED + reason, then trigger-next (a
   * dispatch that failed for a reason unrelated to reachability leaves
   * nothing to wait for). The held branch does NOT call triggerNext — the
   * next waiting task for this (agent, project) pair would almost certainly
   * hit the same unreachable site, so the project's queue stays paused until
   * the reconnect hook resumes it, rather than cascading through the same
   * failure task-by-task.
   *
   * Every write is conditional on the claim still standing, so a Stop or a
   * loss of access that landed during the dispatch is never overwritten.
   */
  private async dispatchClaimed(taskId: string, agent: Agent, startedBy: RunStartedBy): Promise<RunTaskResult> {
    // No new run starts on what a scheduled change is about to affect; it waits, and starts when the change is done.
    const hold = await this.scheduledHold(taskId)
    if (hold) {
      await this.settleClaim(taskId, 'RUN_QUEUED', hold)
      return { outcome: 'failed', reason: hold }
    }
    let dispatched: { runId: string } | null
    try {
      dispatched = await dispatchService.dispatchTaskRun(taskId, agent, startedBy)
    } catch (err: unknown) {
      if (err instanceof OnBehalfOfLostAccessError) {
        logger.warn(`TaskRunner: task ${taskId} is on behalf of someone without access to its project — blocked`)
        await this.settleClaim(taskId, 'RUN_BLOCKED', LOST_ACCESS_REASON)
        await this.triggerNext(agent, await this.getProjectId(taskId))
        return { outcome: 'failed', reason: LOST_ACCESS_REASON }
      }
      if (err instanceof RunPersonLostAccessError) {
        logger.warn(`TaskRunner: the person who started task ${taskId} has lost access to its project — not run`)
        await this.settleClaim(taskId, 'RUN_FAILED', err.message)
        await this.triggerNext(agent, await this.getProjectId(taskId))
        return { outcome: 'failed', reason: err.message }
      }
      if (holdsForReconnect(err)) {
        logger.warn(`TaskRunner: site unreachable dispatching task ${taskId} — held for reconnect`)
        await this.settleClaim(taskId, 'RUN_QUEUED', HELD_FOR_RECONNECT_REASON)
        return { outcome: 'failed', reason: HELD_FOR_RECONNECT_REASON }
      }
      logger.error(`TaskRunner: error dispatching task ${taskId}: ${messageOf(err)}`)
      await this.settleClaim(taskId, 'RUN_FAILED', messageOf(err))
      await this.triggerNext(agent, await this.getProjectId(taskId))
      return { outcome: 'failed', reason: messageOf(err) }
    }

    if (!dispatched) {
      await this.settleClaim(taskId, 'RUN_QUEUED', null)
      return { outcome: 'failed', reason: DISPATCH_DECLINED_REASON }
    }

    // Dispatched — the task stays RUN_ACTIVE until its run's end arrives as a
    // run.status frame (taskStatusListener.ts), which also starts the next one.
    // A frame that beat this acknowledgement has already settled it, and the
    // write below then matches nothing.
    await prisma.task.updateMany({ where: { id: taskId, ...STILL_CLAIMED }, data: { runId: dispatched.runId } })
    // The task's run has moved on: what it waited on a person for is no longer waiting.
    await markTaskNotificationsHandled(taskId)
    return { outcome: 'started' }
  }

  private async scheduledHold(taskId: string): Promise<string | null> {
    try {
      return (await scheduledChangeHold(await dispatchService.resolveSiteIdForTask(taskId)))?.reason ?? null
    } catch {
      // No site to resolve: dispatch itself says why, below.
      return null
    }
  }

  private async settleClaim(taskId: string, runState: 'RUN_QUEUED' | 'RUN_BLOCKED' | 'RUN_FAILED', reason: string | null): Promise<void> {
    const { count } = await prisma.task.updateMany({ where: { id: taskId, ...STILL_CLAIMED }, data: { runState, runStateReason: reason } })
    if (count === 1) await notifyBoardsOfTasks([taskId])
  }

  /**
   * After a task's run ends, the agent's slot in the project is free: its next
   * task someone asked to start goes ahead at once, with what asked for it.
   * The rest of its line is the pulse's — the scheduler is nudged so a
   * boundary with automation on starts it now and records it. Not `private` —
   * the status listener and the revoked-site sweep call it once a task's
   * terminal state lands, and they live outside this class.
   */
  async triggerNext(agent: Agent, projectId: string | null): Promise<void> {
    if (!projectId) return

    const next = await claimNext(agent.id, projectId, false)
    if (next) {
      logger.info(`TaskRunner: trigger-next — starting task ${next.id} for agent ${agent.handle}`)
      void this.dispatchClaimed(next.id, agent, next.startedBy)
    }
    nudgeScheduler()
  }

  private async getProjectId(taskId: string): Promise<string | null> {
    const t = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } })
    return t?.projectId ?? null
  }

  /**
   * Re-runs tasks left RUN_QUEUED with `HELD_FOR_RECONNECT_REASON` after a prior
   * dispatch found the site unreachable (dispatchClaimed's catch above) —
   * fired once that site reconnects (`sites/channel/index.ts`'s
   * `onSiteConnected`, after `reconcileService.reconcileSite`'s own sweep).
   * Selection mirrors reconcileService's own — the task's project's
   * executionSite, which is the one answer dispatch itself reaches, so this
   * drain and dispatch can never disagree about which site a held task
   * belongs to. Re-runs each through the ordinary `runTask` claim path,
   * not a direct dispatch, so per-(agent, project) serialisation still
   * governs which of several held tasks actually goes first.
   */
  async drainHeldTasks(siteId: string): Promise<void> {
    const held = await prisma.task.findMany({
      where: {
        runState: 'RUN_QUEUED',
        runStateReason: HELD_FOR_RECONNECT_REASON,
        ...tasksRunOnSite(siteId),
      },
      include: { assignedAgent: true },
    })
    for (const task of held) {
      if (!task.assignedAgent) {
        logger.warn(`TaskRunner: held task ${task.id} has no assignedAgent — skipping drain`)
        continue
      }
      void this.runTask(task.id, task.assignedAgent, storedStartedBy(task.runStartedBy), task.runOnBehalfOfUserId)
    }
  }

  /**
   * Fails every task held for, or running on, a site that was just revoked —
   * see `revokedSiteSweep.ts`. Frees each failed running task's slot through
   * `triggerNext`.
   */
  async failTasksForRevokedSite(siteId: string): Promise<void> {
    await failTasksForRevokedSite(siteId, (agent, projectId) => this.triggerNext(agent, projectId))
  }
}

export const taskRunner = new TaskRunner()

registerTaskStatusListener((agent, projectId) => taskRunner.triggerNext(agent, projectId))
registerTaskSessionApprovalListener()
registerActiveRunTracker()
