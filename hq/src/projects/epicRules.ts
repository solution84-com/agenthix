/**
 * An epic is never run (T10): it groups tasks, and is planned in its conversation or its comments; its tasks are
 * what run. So no path starts, queues or claims a run of one, and no agent is assigned to one. The claim paths
 * leave epics out of their queries (agents/taskSlotClaim.ts); the refusals below give the words.
 */
import { HttpError } from 'wasp/server'

export const EPIC_NOT_RUN =
  'An epic is never run: plan it in its conversation or its comments, and run its tasks. Nothing was changed.'

export const EPIC_HAS_NO_AGENT =
  'An epic has no agent: it is planned in its conversation or its comments, and its tasks are run. Assign an agent to one of its tasks instead. Nothing was changed.'

export const AGENT_BEFORE_EPIC =
  'This task has an agent, and an epic has none: an epic is planned in its conversation or its comments, and its tasks are run. Unassign its agent first. Nothing was changed.'

export function refuseRunOfEpic(task: { isEpic: boolean }): void {
  if (task.isEpic) throw new HttpError(400, EPIC_NOT_RUN)
}

/** Refused when the task is (or is becoming) an epic and an agent is being given to it. */
export function refuseAgentOnEpic(task: { isEpic: boolean }, assignedAgentId: string | null | undefined): void {
  if (task.isEpic && assignedAgentId) throw new HttpError(400, EPIC_HAS_NO_AGENT)
}
