/**
 * What a stopped turn records (AgentEngine.processRun): the run's error, the
 * same words `cancelRun` writes, and why it stopped and who stopped it, for
 * the transcript's row that says so (core's `RunStoppedDetail`). Any text the
 * turn had produced is kept as its reply, before that row.
 *
 * A run stopped by a limit records the reason that names the limit
 * (core's `runLimitReason`), which hq reads to block the task rather than fail it.
 */
import { runLimitReason, runPausedReason, type RunLimitKind, type RunLimits, type RunStopCause } from '@agenthix/core'

/** A person hq named stopped the run, or interrupted it with a new message. */
export type PersonStop = { by: string; interrupted: boolean }

/** A scheduled change paused the run at the end of a step; `by` names the change. */
export type PauseStop = { paused: true; by: string | null }

export type StopReason = 'stopped' | 'interrupted' | PersonStop | PauseStop | { limit: RunLimitKind; limits: RunLimits }

export type TurnStop = { error: string; cause: RunStopCause; by: string | null }

export function turnStop(reason: StopReason | undefined): TurnStop {
  if (reason && typeof reason === 'object' && 'paused' in reason) return { error: runPausedReason(reason.by), cause: 'paused', by: reason.by }
  if (reason && typeof reason === 'object' && 'by' in reason) {
    return reason.interrupted
      ? { error: `Interrupted by ${reason.by}`, cause: 'new_message', by: reason.by }
      : { error: `Stopped by ${reason.by}`, cause: 'person', by: reason.by }
  }
  if (reason === 'interrupted') return { error: 'Interrupted by a new message', cause: 'new_message', by: null }
  if (reason === 'stopped') return { error: 'Cancelled by user', cause: 'person', by: null }
  if (reason) return { error: runLimitReason(reason.limit, reason.limits), cause: reason.limit === 'time' ? 'time_limit' : 'turn_limit', by: null }
  // The harness reported the cancel itself, with no Stop from this site.
  return { error: 'Cancelled', cause: 'harness', by: null }
}
