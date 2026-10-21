/** What the screens are shown of a join (joins.ts), and the words that go with it. */
import { formatFingerprint } from '@agenthix/core'
import { listedAs, type PinnedHost, type PinnedHosts } from '../state/hosts'
import type { Presence } from '../hosts/presence'
import type { Join, JoinState } from './joins'

export type JoinView = {
  joinId: string
  state: JoinState
  expiresAt: string
  machine: { name: string; fingerprint: string; fingerprintShort: string } | null
  /** Shown before the fleet admin confirms: the machine is already in the fleet, and confirming replaces it. */
  replaces: { siteName: string; machineName: string; warning: string } | null
  /** Shown before the fleet admin confirms: the machine says it runs HQ, and whether confirming marks it so. */
  hqClaim: { text: string; marks: boolean } | null
  siteName: string | null
  /**
   * A code for restoring a lost site (adr-0119): the site, the machine it ran on and when that was last heard from, and
   * — once a machine answered — when the backup it says it restores was taken, under its binding.
   */
  restore: { siteName: string; lostMachine: string | null; lastHeardAt: string | null; backupTakenAt: string | null } | null
  problem: string | null
}

export const inFleetOnline = (h: PinnedHost) =>
  `This machine is already in the fleet as ${listedAs(h)}, and it is online, so a join cannot take its place. If it is the same machine, disconnect it in the Fleet Console first.`

/** The machine other than `fingerprint` that holds the mark of HQ's machine; null when none does. */
export function hqClaimHolder(hosts: PinnedHosts, fingerprint: string): PinnedHost | null {
  return hosts.list().find(h => h.hqMachine === true && h.fingerprint !== fingerprint) ?? null
}

function hqClaim(join: Join, hosts: PinnedHosts): JoinView['hqClaim'] {
  if (!join.claimsHq || join.local || join.purpose.kind !== 'add' || join.state !== 'confirming' || !join.machine) return null
  const holder = hqClaimHolder(hosts, join.machine.fingerprint)
  return holder
    ? { text: `This machine says it runs HQ, but ${holder.machineName} is already marked as HQ's machine, so confirming does not mark this one.`, marks: false }
    : { text: 'This machine says it runs HQ.', marks: true }
}

function restore(join: Join, hosts: PinnedHosts, presence?: Presence): JoinView['restore'] {
  if (join.purpose.kind !== 'restoreSite') return null
  const siteId = join.purpose.siteId
  const lost = hosts.list().find(h => h.executionSiteId === siteId && h.fingerprint !== join.machine?.fingerprint) ?? null
  const heard = lost && presence ? presence.of(lost.fingerprint) : null
  return {
    siteName: join.siteName ?? lost?.siteName ?? '',
    lostMachine: lost?.machineName ?? null,
    lastHeardAt: heard && !heard.online ? heard.since : null,
    backupTakenAt: join.restores?.takenAt ?? null,
  }
}

export function view(join: Join, hosts: PinnedHosts, presence?: Presence): JoinView {
  return {
    joinId: join.joinId,
    state: join.state,
    expiresAt: new Date(join.expiresAt).toISOString(),
    machine: join.machine
      ? { name: join.machine.name, fingerprint: join.machine.fingerprint, fingerprintShort: formatFingerprint(join.machine.fingerprint) }
      : null,
    replaces: join.replaces && join.state === 'confirming'
      ? {
          siteName: join.replaces.siteName, machineName: join.replaces.machineName,
          warning: `This machine is already in the fleet as ${listedAs(join.replaces)}; confirming replaces it.`,
        }
      : null,
    hqClaim: hqClaim(join, hosts),
    siteName: join.siteName,
    restore: restore(join, hosts, presence),
    problem: join.problem,
  }
}
