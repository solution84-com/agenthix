/** The last step of a move (moves.ts `finish`): hq records where the site runs, and the old machine's copy goes. */
import { nowRunsOn } from '../join/names'
import type { Move, MovesDeps } from './types'

/**
 * The site answers hq from the new machine, and the old one committed: hq records where it runs — and names it after
 * the new machine, as every site is — the old machine removes the copy it kept — the move's last step, not an
 * erase — and leaves the fleet.
 */
export async function finishMove(
  deps: MovesDeps, move: Move, set: (move: Move, patch: Partial<Move>) => void, fail: (move: Move, reason: string) => Promise<void>,
): Promise<void> {
  const from = deps.hosts.byFingerprint(move.from)
  const to = move.to ? deps.hosts.byFingerprint(move.to) : null
  const by = move.confirmedBy ? { kind: 'fleetAdmin' as const, ...move.confirmedBy } : null
  if (!to || !by) return fail(move, 'the new machine is no longer connected to this Fleet Console.')
  set(move, { state: 'finishing', problem: null })
  const hq = move.kind === 'hq'
  try {
    if (hq) {
      // The new machine said, sealed, that hq answers there and the old one committed: by this Fleet Console's own
      // record of the move, it carries hq now, and the old machine no longer does.
      deps.hosts.markHqMachine(to.fingerprint)
      deps.hosts.update(to.fingerprint, { siteName: to.machineName })
    } else {
      await deps.link.call('site.move', { executionSiteId: move.executionSiteId!, toHostId: to.hostId })
      deps.hosts.update(to.fingerprint, { executionSiteId: move.executionSiteId, siteName: to.machineName })
    }
    if (from) {
      deps.hosts.update(from.fingerprint, { executionSiteId: null })
      const removed = await deps.commands.send(from.fingerprint, { op: 'remove', target: hq ? 'hq' : 'site' }, by)
      if (!removed.ok) throw new Error(removed.refusal.message)
      await deps.link.call('host.disconnect', { hostId: from.hostId })
      deps.hosts.remove(from.fingerprint)
      deps.presence.forget(from.fingerprint)
    }
  } catch (err) {
    // It runs on the new machine; only the tidying is left, and finishing again carries it on.
    set(move, { problem: `${hq ? 'HQ' : 'The site'} runs on ${to.machineName}, but the old copy is not removed yet: ${err instanceof Error ? err.message : String(err)}` })
    return
  }
  set(move, { state: 'done' })
  const moved = hq ? `HQ now runs on ${to.machineName}, and its site is named ${to.machineName}` : nowRunsOn(move.siteName, to.machineName)
  await deps.activity.record(by.userId, hq ? 'hq.moved' : 'site.moved', `${moved}${from ? '; the machine it ran on left the fleet' : ''}`, true)
}
