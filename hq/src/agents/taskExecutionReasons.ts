/** dispatchClaimed's reason string when a dispatch attempt found the site
 *  unreachable (SC-340) — also drainHeldTasks' own filter value, so the two
 *  stay in lockstep by construction rather than by two separately-typed
 *  string literals. */
export const HELD_FOR_RECONNECT_REASON = 'site unreachable — held for reconnect'

/** The RUN_FAILED reason for a task whose site was revoked while it held or ran it. */
export const SITE_REVOKED_REASON = 'Execution Site revoked'

/** A task whose project names no Execution Site can never dispatch; it says so rather than holding its slot. */
export const UNPLACEABLE_REASON = "no Execution Site holds this task's project"

/** The RUN_BLOCKED reason a run ending on a deferred tool request sets. */
export const MANIFEST_BLOCKED_REASON = 'Awaiting tool approval'

/** RUN_QUEUED, asked to start, behind the agent's running task in the same project (the agent's slot in the project): it goes next. */
export const WAITING_FOR_AGENT_REASON = "waiting for this agent's running task in this project to finish"

/** RUN_ACTIVE, but its run is waiting for a free run slot on its Execution Site (the site's limit on runs at once). */
export const WAITING_FOR_SLOT_REASON = 'waiting for a free run slot on its Execution Site'

/** A scheduled task that fell due while its project's automation was off (spec §3). */
export const AUTOMATION_OFF_REASON = "scheduled time reached while this project's automation is off — waiting for a person or the pulse"

/** A scheduled task that fell due with no agent to run it. */
export const NO_AGENT_REASON = 'scheduled time reached, but no agent is assigned'

/** A dispatch that found nothing to run (its task gone, or no admin to record the session under): back in the queue. */
export const DISPATCH_DECLINED_REASON = 'the dispatch found nothing to run — left queued'

/**
 * The stored RUN_BLOCKED reason when the person a task is done for can no longer
 * reach its project. One fixed string, matched exactly, like the other stored
 * reasons: the status listener and reassignment both recognise it.
 */
export const LOST_ACCESS_REASON =
  'the person this task is done on behalf of can no longer work in its project — a project admin must choose someone else'

/** Why Run is unavailable on a task blocked for lost access: running it again would only be blocked again. */
export const LOST_ACCESS_RUN_REFUSAL =
  'This task cannot be run: the person it is done on behalf of can no longer work in its project. A project admin must choose someone else for it first.'

/** The RUN_FAILED reason when the person who started a run can no longer reach the task's project; anyone on it may run it again. */
export const RUN_PERSON_LOST_ACCESS_REASON = 'the person who started this run can no longer work in its project'

/** Thrown at dispatch for a run its starter can no longer start; the task's own person is unaffected. */
export class RunPersonLostAccessError extends Error {
  constructor(public readonly taskId: string) {
    super(RUN_PERSON_LOST_ACCESS_REASON)
    this.name = 'RunPersonLostAccessError'
  }
}
