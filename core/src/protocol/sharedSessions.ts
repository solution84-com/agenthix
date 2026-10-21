/**
 * A task's session is shared on equal footing (every-screen-reviewed spec §3,
 * §9): every message records who sent it, a run is on behalf of whoever
 * started it, a stop or an interruption records who did it, and a task run is
 * given the comments written since its agent's last run on the task: the run
 * dispatch's `onBehalfOfUserId`, the run cancel's `by`, a task run's
 * `context.task.comments` and a transcript row's `authorId`.
 */

/** One comment on a task, as a task run is given it. */
export type TaskCommentForRun = {
  /** A person's name, or an agent's `@handle`. */
  author: string
  /** ISO time it was written. */
  at: string
  text: string
}

/** At most this many comments ride on a dispatch; the agent fetches the rest with `get_task_details`. */
export const TASK_COMMENTS_FOR_RUN_MAX = 20
/** Each comment's text is clipped to this many characters on a dispatch. */
export const TASK_COMMENT_TEXT_MAX = 2000

/**
 * The person a run is on behalf of, as the site recorded it in the run's
 * dispatch blob (`metadata.dispatch.onBehalfOfUserId`), or null when it has none.
 */
export function runOnBehalfOf(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const dispatch = (metadata as { dispatch?: unknown }).dispatch
  if (!dispatch || typeof dispatch !== 'object') return null
  const id = (dispatch as { onBehalfOfUserId?: unknown }).onBehalfOfUserId
  return typeof id === 'string' && id.length > 0 ? id : null
}
