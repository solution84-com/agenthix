import { recordUse } from '../secrets/store'
import { Logger } from '../server/utils/logger'
import type { WorkflowPlace } from './placeAccess'

const logger = new Logger('WorkflowRuns')

/**
 * Records the secrets a run was given once the site has accepted it. The run is running by then, so a failure to
 * record is logged and the run is still answered with its id; answering an error would have the caller start it again.
 */
export async function recordUseOfAcceptedRun(
  place: WorkflowPlace, runId: string, names: readonly string[], byUserId: string, record: typeof recordUse = recordUse,
): Promise<void> {
  try {
    await record(place, runId, names, byUserId)
  } catch (err) {
    logger.error(`run ${runId}: started, but the secrets it was given could not be recorded`, err)
  }
}
