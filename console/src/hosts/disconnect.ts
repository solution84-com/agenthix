/**
 * Disconnecting a machine in the Fleet Console (spec §6): hq forgets its site's credential (`site.remove`) and its
 * machine credential (`host.disconnect`, after which hq closes its link with `revoke`), and the console unpins it,
 * so nothing more is sealed to it or accepted from it. The machine's own `console disconnect` works without any of
 * this. Announced. The machine stays listed as disconnected until a fleet admin removes it from the list — unless it
 * had left by itself, when removing it is all that was left to do.
 *
 * Never the machine that carries hq, by this Fleet Console's own mark: hq and its default site move first, and never
 * a machine that takes part in a move under way.
 */
import { formatFingerprint, type HostActor } from '@agenthix/core'
import type { Activity } from '../activity'
import type { HqLink } from '../hq/link'
import { listedAs, type PinnedHosts } from '../state/hosts'
import type { Moves } from '../move/moves'
import type { Presence } from './presence'

export type DisconnectResult = { done: true } | { done: false; status: 404 | 409; message: string }

export async function disconnectHost(
  deps: { link: HqLink; hosts: PinnedHosts; presence: Presence; activity: Activity; moves: Pick<Moves, 'of'> },
  fingerprint: string,
  by: HostActor & { kind: 'fleetAdmin' },
): Promise<DisconnectResult> {
  const host = deps.hosts.byFingerprint(fingerprint)
  if (!host) return { done: false, status: 404, message: 'That machine is not connected to this Fleet Console.' }
  if (host.hqMachine) {
    return {
      done: false, status: 409,
      message: `${host.machineName} carries HQ, so it cannot be disconnected. To retire this machine, move HQ first, with Move HQ… on HQ's page.`,
    }
  }
  if (deps.moves.of(fingerprint)) {
    return {
      done: false, status: 409,
      message: `${host.machineName} takes part in a move that is under way, so it cannot be disconnected. Cancel the move first, or wait for it to end. Nothing was changed.`,
    }
  }
  const leftByItself = deps.presence.of(fingerprint).leftAt !== null
  if (host.executionSiteId) {
    await deps.link.call('site.remove', { executionSiteId: host.executionSiteId })
    deps.hosts.update(fingerprint, { executionSiteId: null })
  }
  await deps.link.call('host.disconnect', { hostId: host.hostId })
  deps.hosts.remove(fingerprint)
  deps.presence.forget(fingerprint)
  if (!leftByItself) {
    deps.hosts.disconnected.add({
      fingerprint, machineName: host.machineName, siteName: host.siteName, by: { userId: by.userId, name: by.name },
    })
  }
  await deps.activity.record(
    by.userId, 'site.disconnected', `${listedAs(host)} (${formatFingerprint(fingerprint)})`, true,
  )
  return { done: true }
}
