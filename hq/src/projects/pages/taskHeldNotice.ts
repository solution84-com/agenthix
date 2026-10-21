import {
  AUTOMATION_OFF_REASON, LOST_ACCESS_REASON, LOST_ACCESS_RUN_REFUSAL, HELD_FOR_RECONNECT_REASON, NO_AGENT_REASON,
} from '../../agents/taskExecutionReasons'
import { HELD_FOR_UPGRADE_DISPLAY } from '../../agents/taskDisplayReason'

/** What a member reads of a run no site can take: who can see why, in words, never a link to a page they may not open. */
export const NO_SITE_AVAILABLE_NOTICE =
  'Waiting: no site is available. Your run starts as soon as a site can take it. Your fleet admins can see why in the Fleet Console.'

/**
 * The reason to tell a person about a task that is waiting for something real,
 * or null when it is not: queued but held back because its Execution Site
 * cannot take it yet, or scheduled but not started (automation off, no agent).
 * A task waiting its turn in its agent's line, or running but waiting for a
 * place on a site at capacity, says so through its wait note (`runWait`),
 * which names the site. Other
 * reasons ("queued by user") describe nothing a person needs to act on, so they
 * are not surfaced.
 */
export function heldTaskNotice(task: { runState: string; runStateReason?: string | null }): string | null {
  const reason = task.runStateReason
  if (task.runState === 'RUN_QUEUED') {
    if (reason === HELD_FOR_RECONNECT_REASON || reason === HELD_FOR_UPGRADE_DISPLAY) return NO_SITE_AVAILABLE_NOTICE
    return reason === AUTOMATION_OFF_REASON ? reason : null
  }
  if (task.runState === 'RUN_NONE') return reason === NO_AGENT_REASON ? reason : null
  return null
}

/** Why Run (and Dismiss) are not offered on a task blocked because its person lost access, or null on any other task. */
export function lostAccessRunNotice(task: { runState: string; runStateReason?: string | null }): string | null {
  return task.runState === 'RUN_BLOCKED' && task.runStateReason === LOST_ACCESS_REASON ? LOST_ACCESS_RUN_REFUSAL : null
}
