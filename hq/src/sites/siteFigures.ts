/**
 * Who sees a site's figures, versions and logs (host-management spec §10): the accounts holding the fleet admin role,
 * and for a site that is not Cloud's. Everyone else gets the cause as a sentence. The queries apply this on the server
 * before anything is sent, so a screen never has anything to hide.
 */
import type { SiteHealth } from '@agenthix/core'
import type { SiteListEntry } from './siteViews'
import type { SiteProblem } from './siteStanding'

/** Cloud's sites show the sentence only, to everyone (spec §10): a site Agenthix Cloud added (fleet/cloudSites.ts). */
export function siteIsCloud(site: { cloudMachineId: string | null }): boolean {
  return site.cloudMachineId !== null
}

export function canSeeFigures(fleetAdmin: boolean, site: { cloudMachineId: string | null }): boolean {
  return fleetAdmin && !siteIsCloud(site)
}

export function loadOf(health: SiteHealth | null): SiteListEntry['load'] {
  return health ? { running: health.runs.running, maxAtOnce: health.runs.maxAtOnce, ...(health.ceilings ? { ceilings: health.ceilings } : {}) } : null
}

/** A problem without the machine's numbers or versions in it. */
export function problemForPeople(problem: SiteProblem): SiteProblem {
  switch (problem.kind) {
    case 'upgrade': return { kind: 'upgrade', protocolVersion: null, side: problem.side }
    case 'diskNearlyFull': return { kind: 'diskNearlyFull' }
    default: return problem
  }
}

/** What a person who may not see figures is given in place of the whole entry. */
export function withoutFigures<T extends SiteListEntry>(entry: T): T {
  return {
    ...entry,
    figures: false,
    health: null,
    protocolVersion: null,
    hqProtocol: '',
    problems: entry.problems.map(problemForPeople),
  }
}
