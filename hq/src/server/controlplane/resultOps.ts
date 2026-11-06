/**
 * set_result — a run states what it achieved (workers and results spec, Results). Data-path-only, like
 * memoryOps.ts: only a run calls it, through its site, which fills in the calling run's id; a person's connection
 * and a conversation's turn have no run to state a result for, so it is in no connection group and no turn's tool.
 *
 * The result goes to the run (a `RunResult` row); a task's result is its latest run's, read from those rows. A run
 * that ends without stating one is marked so by runResults.ts.
 */
import { ControlPlaneError, type CallerContext } from './types'
import { runOfCapability } from './capabilityRun'
import { recordStatedResult } from './runResults'

export async function setResultOp(ctx: CallerContext, args: { result: string; runId?: string }) {
  if (ctx.kind !== 'run') throw new ControlPlaneError('forbidden', 'set_result is for a run, which states its own result')
  if (!args.runId) throw new ControlPlaneError('invalid', 'set_result needs the run it is called from, which this site did not say')
  const result = args.result.trim()
  if (!result) throw new ControlPlaneError('invalid', 'The result is empty')

  const { claims } = ctx
  // The site names the run; it must be one of this capability's session, still going, and of its task if any.
  const run = await runOfCapability(claims, args.runId)
  if (!run) {
    throw new ControlPlaneError('forbidden', 'set_result names a run that is not this one')
  }
  if (run.status !== 'RUNNING' && run.status !== 'PENDING') {
    throw new ControlPlaneError('invalid', 'This run has already ended, so its result can no longer be stated')
  }

  await recordStatedResult({ runId: run.id, siteId: claims.siteId, sessionId: claims.sessionId, taskId: claims.taskId, result })
  return { success: true, runId: run.id, ...(claims.taskId ? { taskId: claims.taskId } : {}) }
}
