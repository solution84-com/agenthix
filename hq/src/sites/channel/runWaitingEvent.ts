/**
 * Intake for `run.waiting` (core's RunWaitingEvent): a site's run is waiting
 * for a free slot under the site's limit on runs at once, or has got one. A
 * waiting task shows why it has not started; the reason is cleared when the run
 * gets its slot, and every later write (the run's own end) replaces it anyway.
 * Only the site that owns the task may say so. Frames may be lost, so a wait
 * hq never hears the end of is cleared by the task's next state change.
 *
 * A run on a branch may also wait for the other runs in its container to end
 * (`reason: 'branch'`). A task says so in its own words; a conversation's worker
 * says so as a line on its row in the work bar.
 */
import { prisma } from 'wasp/server'
import { Logger } from '../../server/utils/logger'
import { resolveSiteIdForTask } from '../../agents/dispatchSiteResolution'
import { enqueueForTask } from '../../agents/taskFrameChain'
import { SLOT_TAKEN_REASON } from '../../agents/taskSlotClaim'
import { WAITING_FOR_BRANCH_REASON, WAITING_FOR_SLOT_REASON } from '../../agents/taskExecutionReasons'
import { setRunWaitingLine } from './operationLinesForward'
import { notifyBoardsOfTasks } from '../../projects/boardNotify'

const logger = new Logger('SiteEvents')

type Waiting = { taskId: string | null; runId: string | null; waiting: boolean; reason: 'slot' | 'branch' }

function parse(data: unknown): Waiting | null {
  const e = data as { taskId?: unknown; runId?: unknown; waiting?: unknown; reason?: unknown } | null
  if (typeof e?.waiting !== 'boolean') return null
  const taskId = typeof e.taskId === 'string' && e.taskId.length > 0 ? e.taskId : null
  const runId = typeof e.runId === 'string' && e.runId.length > 0 && e.runId.length <= 200 ? e.runId : null
  return { taskId, runId, waiting: e.waiting, reason: e.reason === 'branch' ? 'branch' : 'slot' }
}

/** What a conversation's worker shows while its run waits to work on its branch. */
export const BRANCH_WAIT_LINE = "Waiting for this project's other runs to finish before working on a branch"

export async function handleRunWaiting(siteId: string, data: unknown): Promise<void> {
  const parsed = parse(data)
  if (!parsed) return
  if (!parsed.taskId) {
    // A chat run's slot wait shows nothing; its branch wait shows on its operation, matched by this site's run.
    if (parsed.reason === 'branch' && parsed.runId) await setRunWaitingLine(siteId, parsed.runId, parsed.waiting ? BRANCH_WAIT_LINE : null)
    return
  }
  const event = { ...parsed, taskId: parsed.taskId }
  const reason = event.reason === 'branch' ? WAITING_FOR_BRANCH_REASON : WAITING_FOR_SLOT_REASON
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
        data: { runStateReason: reason },
      }))
    } else {
      ({ count: changed } = await prisma.task.updateMany({
        where: { id: event.taskId, runState: 'RUN_ACTIVE', runStateReason: reason },
        data: { runStateReason: SLOT_TAKEN_REASON },
      }))
    }
    if (changed === 1) await notifyBoardsOfTasks([event.taskId])
  })
}
