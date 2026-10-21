/**
 * A run paused at the end of its step (host-management spec §14): hq sends `run.cancel` with the
 * reason `'paused'` a few minutes before a scheduled change. The site lets the step going finish, refuses the
 * run's next tool call, and ends the run as cancelled with `runPausedReason` as its error, keeping its
 * conversation. hq reads that error to put the task back to wait for the change, and afterwards starts it again
 * in the same conversation.
 */

/** What a paused run records as its error. */
export const RUN_PAUSED_REASON_PREFIX = 'Paused for '

/** `by` is what hq named as pausing it ("the scheduled upgrade of office-server"). */
export function runPausedReason(by: string | null | undefined): string {
  return `${RUN_PAUSED_REASON_PREFIX}${by ?? 'a scheduled change'}.`
}

/** Is this recorded error the reason a run was paused? */
export function isRunPausedReason(error: string | null | undefined): boolean {
  return typeof error === 'string' && error.startsWith(RUN_PAUSED_REASON_PREFIX)
}
