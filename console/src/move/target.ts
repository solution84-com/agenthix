/**
 * The machine a site moves to, beyond the code that brings a new one (moves.ts): a machine already connected here
 * with no site can be chosen instead; a move that ends without happening leaves its machine with no site's name; and
 * the fleet says the move to it did not happen until another starts. Also the words for how a move ended.
 */
import { randomUUID } from 'node:crypto'
import type { PinnedHost, PinnedHosts } from '../state/hosts'
import type { Presence } from '../hosts/presence'
import { MoveError, type FleetAdmin, type Move, type Where } from './types'

/**
 * A move to `to`, a machine already connected here that runs no site, from `host`'s site. No code is needed: the
 * fleet admin chose a machine this Fleet Console pinned already, so the move is set up at once, as when a new machine
 * is confirmed. `busy` says whether a machine takes part in a move under way.
 */
export function moveToConnected(
  deps: { hosts: PinnedHosts; presence: Presence }, by: FleetAdmin, host: PinnedHost, to: string, at: string | null,
  busy: (fingerprint: string) => boolean,
): Move {
  const target = deps.hosts.byFingerprint(to)
  if (!target) throw new MoveError(404, 'The machine to move to is not connected to this Fleet Console.')
  const name = target.machineName
  if (target.fingerprint === host.fingerprint) throw new MoveError(409, `The site is already on ${name}.`)
  if (target.hqMachine) throw new MoveError(409, `${name} runs HQ; a site moves only to a machine with no site.`)
  const seen = deps.presence.of(to)
  if (target.executionSiteId || (seen.figures?.installs.length ?? 0) > 0) {
    throw new MoveError(409, `${name} already carries a site; a site moves only to a machine with no site.`)
  }
  if (busy(host.fingerprint)) throw new MoveError(409, `${host.siteName} is already moving.`)
  if (busy(to)) throw new MoveError(409, `${name} is taking part in another move.`)
  if (!seen.online) throw new MoveError(409, `${name} is not answering; a site moves only to a machine that is online.`)
  if (at !== null && !(Date.parse(at) > Date.now())) throw new MoveError(409, 'That time has passed; choose a later one.')
  const admin = { userId: by.userId, name: by.name }
  return {
    moveId: randomUUID(), from: host.fingerprint, siteName: host.siteName, executionSiteId: host.executionSiteId, joinId: null, to,
    transferId: null, at, by: admin, confirmedBy: admin, changeId: null,
    state: 'arranging', reports: { from: null, to: null }, problem: null, createdAt: new Date().toISOString(),
  }
}

/** The newest move to a machine, only when it ended without happening: the machine stays connected with no site. */
export function endedMoveTo(moves: Move[], fingerprint: string): Move | null {
  const last = moves.filter(m => m.to === fingerprint).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  return last && (last.state === 'failed' || last.state === 'cancelled') ? last : null
}

/**
 * The move did not happen: the machine it was to go to carries no site, so its record holds no site's name — the
 * site is never listed on two machines — and it stays connected, to receive the next move or a site of its own.
 */
export function leaveTargetEmpty(hosts: PinnedHosts, move: Move): void {
  const target = move.to ? hosts.byFingerprint(move.to) : null
  if (target && !target.executionSiteId && !target.hqMachine && target.siteName) hosts.update(target.fingerprint, { siteName: '' })
}

/**
 * Where the site is: still on the old machine (it never stopped), running there `again` (the old machine said so),
 * or `starting` there again — the new machine gave up first, and the old one starts it on that word or at its
 * deadline. It keeps the name of the machine it is on.
 */
export function failedText(hosts: PinnedHosts, move: Move, reason: string, where: Where): string {
  // Shown under the title "The move did not complete.", so the text says why, not that again.
  const cause = `${reason.charAt(0).toUpperCase()}${reason.slice(1).replace(/\.$/, '')}.`
  if (move.kind === 'hq') return `${cause} HQ runs where it was.`
  const machine = hosts.byFingerprint(move.from)?.machineName ?? 'the machine it was on'
  const runs = where === 'still' ? `still runs on ${machine}` : where === 'again' ? `runs on ${machine} again` : `starts again on ${machine}`
  return `${cause} The site ${runs}.`
}
