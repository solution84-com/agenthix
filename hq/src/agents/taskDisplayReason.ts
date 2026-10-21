import { HELD_FOR_RECONNECT_REASON } from './taskExecutionReasons'

/** What a person is shown for a task held on a site whose protocol version hq refuses. */
export const HELD_FOR_UPGRADE_DISPLAY = 'site needs an upgrade — held until it is upgraded'

/**
 * The reason to SHOW for a task, as opposed to the one stored. The stored
 * `HELD_FOR_RECONNECT_REASON` is matched by the drain, the claim, the re-hold
 * and the revoke sweep, so it stays the same for every held task; but a task
 * held because its site runs a refused protocol version is not waiting for a
 * reconnect — the site is connected and refused until someone upgrades it
 * (ADR-0046) — so what is displayed follows the site's own status instead.
 */
export function displayRunStateReason(
  task: { runState: string; runStateReason: string | null },
  siteStatus: string | null | undefined,
): string | null {
  const held = task.runState === 'RUN_QUEUED' && task.runStateReason === HELD_FOR_RECONNECT_REASON
  if (held && siteStatus === 'VERSION_MISMATCH') return HELD_FOR_UPGRADE_DISPLAY
  return task.runStateReason
}
