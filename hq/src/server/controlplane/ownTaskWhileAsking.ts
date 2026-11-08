/**
 * A run that has asked for something a person must approve has not done its work yet, so it may not change its own
 * task's state, column or type, which would show the work as further on than it is. Its site says so with each data
 * call (`RUN_WAITING_APPROVAL_HEADER`, dataApi.ts) and refuses the same call itself; here the task is the one hq
 * resolved, from its id or its key. A run's own task is its capability's: a task's run's, or the task whose
 * conversation the turn is in.
 */
import { ControlPlaneError, type CallerContext } from './types'

export const OWN_TASK_HELD_WHILE_ASKING =
  "This run is waiting for a person's approval, so its own task stays where it is until what was asked for has run: " +
  'its state, column and type cannot change now. Ask again once the approval has been given. Nothing was changed.'

/** Refuses the call when it would change the waiting run's own task's place; `taskIds` are the ids hq resolved. */
export function refuseOwnTaskMoveWhileAsking(ctx: CallerContext, taskIds: readonly string[], changesPlace: boolean): void {
  if (!changesPlace || ctx.kind !== 'run' || !ctx.waitingForApproval) return
  const own = ctx.claims.taskId
  if (own && taskIds.includes(own)) throw new ControlPlaneError('conflict', OWN_TASK_HELD_WHILE_ASKING)
}
