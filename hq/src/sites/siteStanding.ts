/**
 * What a site needs from an admin, and where it is listed (every screen
 * reviewed spec §3, Execution Sites). Pure: the list query and the
 * notifications (`siteNotifications.ts`) read the rows and share this one
 * answer, so the list's Needs you and the notifications never disagree.
 */
import { SITE_PROTOCOL_VERSION, checkProtocolCompatibility, diskNearlyFull, type MachineShortage, type SiteHealth } from '@agenthix/core'

/**
 * How long a site may be away before it counts as not connected. A network
 * blip or a restart of either end reconnects within the site's backoff — at
 * most a minute — so nobody is told about one. hq's own start counts as the
 * last time it heard from every site, because a restart forgets connections.
 */
export const NOT_CONNECTED_GRACE_MS = 90_000

/** Which side must upgrade for a refused site to work with HQ: the one behind, by the compatibility rule. */
export type UpgradeSide = 'site' | 'hq'

/** A site whose recorded version is ahead of HQ's by two majors or more needs a newer HQ; any other refused site, an upgrade of its own. */
export function upgradeSide(protocolVersion: string | null): UpgradeSide {
  const c = checkProtocolCompatibility(SITE_PROTOCOL_VERSION, protocolVersion)
  return !c.ok && c.reason === 'too_far_apart' && c.upgrade === 'own' ? 'hq' : 'site'
}

export type SiteProblem =
  | { kind: 'upgrade'; protocolVersion: string | null; side: UpgradeSide }
  | { kind: 'hqSiteDown'; since: Date }
  | { kind: 'notConnectedWithWork'; since: Date }
  | { kind: 'dockerDown' }
  | { kind: 'diskNearlyFull'; freeBytes?: number; totalBytes?: number }
  | { kind: 'memoryNearlyFull' }
  | { kind: 'removedWithProjects'; projects: number }

/** `notConnected` is a site that has been connected before, is away now, and has nothing waiting on it. */
export type SiteGroup = 'needsYou' | 'running' | 'notConnected' | 'neverConnected' | 'removed'

export type StandingInput = {
  status: string
  isDefault: boolean
  registeredAt: Date
  lastSeenAt: Date | null
  protocolVersion: string | null
  health: SiteHealth | null
  revoked: boolean
  projectCount: number
  /** `atCapacity`: runs started on it that wait for one of its places, at its containers-at-once ceiling. */
  waiting: { runs: number; changes: number; atCapacity?: number }
}

export type Standing = { group: SiteGroup; problems: SiteProblem[] }

function awayFor(site: StandingInput, now: Date, hqStartedAt: Date): { since: Date; past: boolean } {
  const since = site.lastSeenAt ?? site.registeredAt
  return { since, past: now.getTime() - Math.max(since.getTime(), hqStartedAt.getTime()) >= NOT_CONNECTED_GRACE_MS }
}

/**
 * Away, but not yet for the grace: whether it is coming back is not known yet.
 * A notification already open about it being away stays as it is, neither
 * cleared nor raised, so a restart of hq or a site that drops again moments
 * after it was heard from never turns one problem into two notifications.
 */
export function awayWithinGrace(site: StandingInput, now: Date, hqStartedAt: Date): boolean {
  if (site.revoked || site.status === 'ONLINE' || site.status === 'VERSION_MISMATCH') return false
  return !awayFor(site, now, hqStartedAt).past
}

/** What a connected site's machine is nearly out of, from its last health report: the one rule for it. */
export function healthShortages(health: SiteHealth): MachineShortage[] {
  const out: MachineShortage[] = []
  if (health.disk && diskNearlyFull(health.disk)) out.push('disk')
  if (health.memoryNearlyFull) out.push('memory')
  return out
}

export function siteStanding(site: StandingInput, now: Date, hqStartedAt: Date): Standing {
  if (site.revoked) {
    return site.projectCount > 0
      ? { group: 'needsYou', problems: [{ kind: 'removedWithProjects', projects: site.projectCount }] }
      : { group: 'removed', problems: [] }
  }
  const problems: SiteProblem[] = []
  const connected = site.status === 'ONLINE'
  const neverConnected = site.lastSeenAt === null && site.status === 'REGISTERED'

  if (site.status === 'VERSION_MISMATCH') {
    problems.push({ kind: 'upgrade', protocolVersion: site.protocolVersion, side: upgradeSide(site.protocolVersion) })
  } else if (!connected) {
    const { since, past: away } = awayFor(site, now, hqStartedAt)
    const work = site.waiting.runs + site.waiting.changes > 0
    if (away && site.isDefault) problems.push({ kind: 'hqSiteDown', since })
    else if (away && work) problems.push({ kind: 'notConnectedWithWork', since })
  }

  // A report from a site that is away says how it was, not how it is: only a connected site's counts.
  if (connected && site.health) {
    if (!site.health.docker.running) problems.push({ kind: 'dockerDown' })
    const short = healthShortages(site.health)
    if (short.includes('disk') && site.health.disk) problems.push({ kind: 'diskNearlyFull', ...site.health.disk })
    if (short.includes('memory')) problems.push({ kind: 'memoryNearlyFull' })
  }

  if (problems.length > 0) return { group: 'needsYou', problems }
  if (connected) return { group: 'running', problems }
  return { group: neverConnected ? 'neverConnected' : 'notConnected', problems }
}
