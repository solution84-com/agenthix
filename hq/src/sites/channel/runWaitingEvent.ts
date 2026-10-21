/**
 * Intake for `run.waiting` (core's RunWaitingEvent): a site's run is waiting
 * for a free slot under the site's limit on runs at once, or has got one. A
 * waiting task shows why it has not started; the reason is cleared when the run
 * gets its slot, and every later write (the run's own end) replaces it anyway.
 * Only the site that owns the task may say so. Frames may be lost, so a wait
 * hq never hears the end of is cleared by the task's next state change.
 */
import { prisma } from 'wasp/server'
import { Logger } from '../../server/utils/logger'
import { resolveSiteIdForTask } from '../../agents/dispatchSiteResolution'
import { enqueueForTask } from '../../agents/taskFrameChain'
import { SLOT_TAKEN_REASON } from '../../agents/taskSlotClaim'
import { WAITING_FOR_SLOT_REASON } from '../../agents/taskExecutionReasons'
import { notifyBoardsOfTasks } from '../../projects/boardNotify'

const logger = new Logger('SiteEvents')

function parse(data: unknown): { taskId: string; waiting: boolean } | null {
  const e = data as { taskId?: unknown; waiting?: unknown } | null
  if (typeof e?.waiting !== 'boolean') return null
  // A chat run has no task: nothing to show, and not a malformed frame.
  if (typeof e.taskId !== 'string' || e.taskId.length === 0) return null
  return { taskId: e.taskId, waiting: e.waiting }
}

export async function handleRunWaiting(siteId: string, data: unknown): Promise<void> {
  const event = parse(data)
  if (!event) return
  await enqueueForTask(event.taskId, async () => {
    if ((await resolveSiteIdForTask(event.taskId)) !== siteId) {
      logger.warn(`run.waiting for task ${event.taskId} from site ${siteId}, which does not own it — dropped`)
      return
    }
    // Conditional on the state and reason it expects, so a late frame cannot touch a task that has moved on.
    let changed = 0
    if (event.waiting) {
      ({ count: changed } = await prisma.task.updateMany({
        where: { id: event.taskId, runState: 'RUN_ACTIVE' },
        data: { runStateReason: WAITING_FOR_SLOT_REASON },
      }))
    } else {
      ({ count: changed } = await prisma.task.updateMany({
        where: { id: event.taskId, runState: 'RUN_ACTIVE', runStateReason: WAITING_FOR_SLOT_REASON },
        data: { runStateReason: SLOT_TAKEN_REASON },
      }))
    }
    if (changed === 1) await notifyBoardsOfTasks([event.taskId])
  })
}
