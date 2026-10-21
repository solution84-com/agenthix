/**
 * One machine carries one site, and the site is always called by its machine's name (spec §6): in the Fleet Console,
 * in HQ, and on the machine itself. A name is a label only — machines are found and trusted by their fingerprints —
 * but two machines of the same name cannot both be sites, or no one could tell them apart.
 */
import { formatFingerprint, type JoinPurpose } from '@agenthix/core'
import type { PinnedHost, PinnedHosts } from '../state/hosts'

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/**
 * The machine in the fleet that already has `name`, other than the one joining (`fingerprint`) and the one it is to
 * take the place of: a move's old machine, or a restore's lost one, which leaves the fleet when it is done.
 */
export function nameTakenBy(hosts: PinnedHosts, purpose: JoinPurpose, fingerprint: string, name: string): PinnedHost | null {
  const leaving = (h: PinnedHost) =>
    purpose.kind === 'moveHq' ? h.hqMachine === true
      : purpose.kind === 'moveSite' || purpose.kind === 'restoreSite' ? h.executionSiteId === purpose.siteId
        : false
  return hosts.list().find(h => h.fingerprint !== fingerprint && same(h.machineName, name) && !leaving(h)) ?? null
}

export const nameTakenText = (h: PinnedHost) =>
  `A machine named ${h.machineName} is already in the fleet (${formatFingerprint(h.fingerprint)}), and two machines of the same name cannot both be sites. Give this machine another name, then add it with a new code.`

/**
 * What a move or restore says of the site's name: it takes the new machine's. "office-server now runs on lab-02, and
 * is named lab-02"; a new machine of the same name is said so.
 */
export function nowRunsOn(siteName: string, machine: string): string {
  return same(siteName, machine) ? `${siteName} now runs on a new machine of the same name` : `${siteName} now runs on ${machine}, and is named ${machine}`
}
