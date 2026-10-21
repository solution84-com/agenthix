/**
 * What the Execution Sites list and a site's page are given (every screen
 * reviewed spec §3). Types only, so the pages can import them.
 */
import type { EffectiveCeilings, ScheduledChangeKind, SiteCause, SiteHealth } from '@agenthix/core'
import type { PersonSummary } from '../server/identity/personSummary'
import type { SiteGroup, SiteProblem } from './siteStanding'

export type { SiteGroup, SiteProblem }

export type SiteListEntry = {
  /** `ExecutionSite.id`: what the actions and the site's page take. */
  id: string
  siteId: string
  /** As shown (`displaySiteName`): HQ's own site is "hq-box · HQ's site". */
  label: string
  /** REGISTERED | ONLINE | OFFLINE | VERSION_MISMATCH | REVOKED */
  status: string
  connected: boolean
  isDefault: boolean
  registeredAt: Date
  /** The last time hq heard from it: "not connected since". */
  lastSeenAt: Date | null
  protocolVersion: string | null
  /** The site protocol HQ speaks, as "1.0"; empty for a person who may not see versions. */
  hqProtocol: string
  projectCount: number
  /** Tasks held until it reconnects, and instructions it has not yet received. */
  waiting: { runs: number; changes: number; atCapacity?: number }
  /**
   * Whether the caller sees the machine's figures and versions: a fleet admin does, for a site that is not Cloud's
   * (host-management spec §10). Everyone else gets the cause sentence and `load` only; the server leaves the rest out.
   */
  figures: boolean
  /** Runs going against its capacity and the limits each run gets: what every person may see. Null before it has reported. */
  load: { running: number; maxAtOnce: number; ceilings?: EffectiveCeilings } | null
  /** Its last report (disk, Docker, images, versions), only when `figures`; null for a site that has never sent one. */
  health: SiteHealth | null
  healthReportedAt: Date | null
  /** Null while it is not removed. `by` is null when it left by itself. */
  removal: { at: Date | null; by: PersonSummary | null; leftByItself: boolean } | null
  group: SiteGroup
  /** Why it is under Needs you; empty otherwise. */
  problems: SiteProblem[]
  /** Where it runs: only Cloud's sites are Cloud's (`siteIsCloud`). */
  hosting: 'self-hosted' | 'cloud'
  /** The next scheduled change on its machine that is still ahead or going, never who scheduled it; null when none. */
  scheduled: ScheduledOnSite | null
  /** Why hq's own site is not connected, when hq's machine reported it since; null for any other site. */
  cause: SiteCause | null
}

export type ScheduledOnSite = { kind: ScheduledChangeKind; at: Date; expectedMinutes: number | null; detail: string | null }

export type SiteDetail = SiteListEntry & {
  siteUrl: string | null
  /** The person who added it in the Fleet Console, and `registeredAt` is when. Null for HQ's own site. */
  approvedBy: PersonSummary | null
  createdById: string | null
  /** The projects whose files and runs are here that the caller may see; the rest are only counted. */
  projects: { id: string; name: string; key: string }[]
  hiddenProjects: number
  workspaces: {
    count: number
    /** Asked of the site, so null while it is not connected. Only those in projects the caller may see. */
    named: { id: string; name: string; projectName: string | null }[] | null
  }
  /** People whose own files are kept here. */
  peopleWithFiles: number
  /** Tasks running here now, in projects the caller may see; `health.runs.running` counts every run. */
  runningTasks: { key: string; title: string; agentName: string | null }[]
}
