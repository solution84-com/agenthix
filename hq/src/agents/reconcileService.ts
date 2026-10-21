/**
 * ReconcileService — reconcile-on-reconnect sweep (plan 5d-2 task 6, split out
 * of dispatchService.ts on quality review to keep both files under the repo's
 * 500-line file-size rule). Nothing calls this yet — T9 wires the real
 * reconnect hook.
 *
 * Split from dispatchService.ts rather than merely moved: this module takes
 * its event sink as a parameter (`emitStatus`) instead of importing
 * `handleSiteEvent` from `sites/channel/siteEventHandler` directly.
 * T9's reconnect hook lives on the channel side and will need to CALL
 * `reconcileSite` — making the call edge channel → agents/reconcileService.
 * If this module also imported `handleSiteEvent` (agents → channel), that
 * edge plus T9's call edge would close a cycle the moment T9 lands. Taking
 * the sink as a parameter removes that specific edge, so the event direction
 * cannot close a cycle — T9 passes a `handleSiteEvent`-derived sink in
 * instead of this module importing it.
 *
 * This does NOT make the module import-cycle-free outright: it still reaches
 * `siteChannelRegistry` transitively through `siteRuntimeStore`
 * (`../sessions/siteRuntimeStore` → `../sites/channel`), so once T9's
 * channel side imports `reconcileSite`, a module cycle exists through that
 * path. Benign in practice — every binding across it is resolved at call
 * time (function calls, not top-level values), which is what module cycles
 * actually need to be safe — but it is a real cycle, not an absent one.
 */
import { prisma } from 'wasp/server'
import type { Agent, Task } from '@prisma/client'
import type { RunStatusEvent } from '@agenthix/core'
import { Logger } from '../server/utils/logger'
import { SiteUnreachableError } from '../storage/workspaceStore'
import * as siteRuntimeStore from '../sessions/siteRuntimeStore'
import { tasksRunOnSite } from '../projects/personalProject'
import { notifyBoardsOfTasks } from '../projects/boardNotify'

const logger = new Logger('ReconcileService')

type ReconcileTask = Pick<Task, 'id' | 'runState'> & { assignedAgent: Agent | null }

/** Feeds a synthesized `run.status` frame through the same path a live frame
 *  takes — T9 passes a sink derived from `handleSiteEvent`. */
export type EmitStatus = (siteId: string, event: RunStatusEvent) => Promise<void>

/**
 * Sweeps this site's RUN_ACTIVE tasks on reconnect, since a
 * `run.status` frame that fired while the site was offline is gone — there is
 * no transport-level durability for it (core's RunStatusEvent doc comment).
 * For each task: reads site's newest run (`run.list` limit 1, already newest-
 * first).
 *   - No run at all → site has no record of a run it should be running →
 *     mark the task RUN_FAILED with an explicit reason.
 *   - Newest run PENDING/RUNNING → still live, leave it alone.
 *   - Newest run terminal (COMPLETED/FAILED/CANCELLED) → synthesize a
 *     `RunStatusEvent` from the row and hand it to `emitStatus` so every side
 *     effect a live frame would have triggered fires identically.
 *
 * A queued task was never dispatched, so there is nothing to reconcile for it:
 * a dispatch that never reached the site returned its task to RUN_QUEUED with a
 * held reason, and the reconnect hook drains held tasks back through the
 * normal claim path — not through reconcile.
 *
 * One task's failure is logged and does not stop the sweep. A
 * `SiteUnreachableError` (the site went down again mid-sweep) aborts the rest
 * quietly — the next reconnect retries from scratch.
 *
 * Task selection is the site its runs go to (`tasksRunOnSite`) and nothing else —
 * the same single answer dispatch reaches for a task run, so reconcile and
 * dispatch can never disagree about which site a task belongs to. A task
 * whose project has no site cannot have been dispatched anywhere (the
 * resolution refuses rather than falling back), so there is nothing for any
 * site to reconcile about it.
 */
export async function reconcileSite(siteId: string, emitStatus: EmitStatus): Promise<void> {
  const tasks: ReconcileTask[] = await prisma.task.findMany({
    where: {
      runState: 'RUN_ACTIVE',
      ...tasksRunOnSite(siteId),
    },
    include: { assignedAgent: true },
  })

  for (const task of tasks) {
    if (!task.assignedAgent) {
      logger.warn(`ReconcileService: task ${task.id} is ${task.runState} with no assignedAgent — skipping`)
      continue
    }
    try {
      await reconcileTask(siteId, task, task.assignedAgent, emitStatus)
    } catch (err) {
      if (err instanceof SiteUnreachableError) {
        logger.warn(`ReconcileService: reconcile for site ${siteId} aborted — site went unreachable mid-sweep`)
        return
      }
      logger.error(`ReconcileService: reconcile failed for task ${task.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  // Then what others follow on this site — a conversation's workers and task runs — registered at server setup.
  for (const [name, reconcile] of afterSiteReconciled) {
    try {
      await reconcile(siteId)
    } catch (err) {
      logger.error(`ReconcileService: '${name}' failed after reconciling site ${siteId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

/**
 * What runs after a site's task runs are reconciled, keyed by name so a re-registration replaces. Registered from
 * server setup, as run-status listeners are: a reconcile that reaches the control plane's operations would close an
 * import cycle if this module imported it.
 */
type AfterSiteReconciled = (siteId: string) => Promise<void>
const afterSiteReconciled = new Map<string, AfterSiteReconciled>()
export function onSiteReconciled(name: string, fn: AfterSiteReconciled): void {
  afterSiteReconciled.set(name, fn)
}

async function reconcileTask(siteId: string, task: ReconcileTask, agent: Agent, emitStatus: EmitStatus): Promise<void> {
  const runs = await siteRuntimeStore.listRuns(siteId, { taskId: task.id, limit: 1 })
  const newest = runs[0]

  if (!newest) {
    await prisma.task.update({
      where: { id: task.id },
      data: { runState: 'RUN_FAILED', runStateReason: "site has no record of this task's run" },
    })
    await notifyBoardsOfTasks([task.id])
    return
  }

  if (newest.status === 'PENDING' || newest.status === 'RUNNING') return

  const event: RunStatusEvent = {
    runId: newest.id,
    sessionId: newest.sessionId,
    taskId: newest.taskId,
    agentId: newest.agentId,
    agentHandle: agent.handle,
    status: newest.status,
    error: newest.error,
    sessionPatch: null,
    manifestPending:
      newest.manifestStatus === 'PENDING_APPROVAL'
        ? { runId: newest.id, summary: null, pendingManifest: newest.pendingManifest }
        : null,
  }
  await emitStatus(siteId, event)
}
