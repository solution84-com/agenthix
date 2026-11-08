import { withExecutionState } from './executionState'
import { type DismissTaskRun } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { requireTaskAccess } from './resourceEntitlement'
import { LOST_ACCESS_REASON } from './taskOnBehalfOf'
import { notifyBoardsOfTasks } from './boardNotify'
import { replaceTaskRequests } from '../agents/manifestRequests'

/**
 * Clears a failed or blocked run back to no run pending (spec §6), the other way
 * a person answers one besides running it again; a tool request it left
 * unanswered is replaced. Same permission as Run. A task
 * blocked because its person lost access is not cleared here: only reassigning
 * it, which a project admin does, releases that (adr-0089).
 */
export const dismissTaskRun: DismissTaskRun<{ taskId: string }, void> = async ({ taskId }, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  await requireTaskAccess(taskId, context.user.id, "Dismissing this task's run")
  const { count } = await context.entities.Task.updateMany({
    where: {
      id: taskId,
      OR: [
        { runState: 'RUN_FAILED' },
        { runState: 'RUN_BLOCKED', NOT: { runStateReason: LOST_ACCESS_REASON } },
      ],
    },
    data: withExecutionState({ runState: 'RUN_NONE', runStateReason: null }),
  })
  if (count === 0) {
    throw new HttpError(409, 'Only a failed or blocked run can be dismissed — and a task blocked because its person lost access is released by reassigning it')
  }
  await notifyBoardsOfTasks([taskId])
  // A request the run left unanswered is replaced, and leaves every list.
  await replaceTaskRequests(taskId)
}
