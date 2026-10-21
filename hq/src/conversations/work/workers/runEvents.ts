/**
 * The `run.status` listener for runs on conversations' standing workers. Runs that are not a worker operation's are
 * ignored (applyWorkerFrame finds no operation for them); when a worker's brief ends, its next brief starts.
 */
import { onRunStatus } from '../../../sites/channel/siteEventHandler'
import { Logger } from '../../../server/utils/logger'
import { applyWorkerFrame } from './frames'
import { schedulePump } from './queue'

const logger = new Logger('WorkerRunEvents')

/** `moveOn` starts the worker's next brief; not waited for by the listener, so a frame's handling is not held by a dispatch. */
export async function handleWorkerRunStatus(
  e: Parameters<typeof applyWorkerFrame>[0],
  siteId: string,
  moveOn: (workerSessionId: string | null) => unknown = schedulePump,
): Promise<void> {
  const outcome = await applyWorkerFrame(e, siteId)
  if (outcome && e.status !== 'RUNNING' && !e.manifestPending) await moveOn(outcome.workerSessionId)
}

export function registerWorkerRunListener(): void {
  onRunStatus('conversation-workers', async (e, siteId) => {
    try {
      await handleWorkerRunStatus(e, siteId)
    } catch (err) {
      logger.error(`could not apply run ${e.runId} (${e.status}) to its operation`, err)
    }
  })
}
