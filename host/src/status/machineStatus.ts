/**
 * Everything on the machine, as `agenthix status` puts it into sentences (host-management spec §9): hq and
 * its site, from what the host service installed, what Docker says runs, and what hq answers through its control
 * socket. Structured here; the words are the CLI's (cli/statusText.ts).
 */
import type { ProtectionFigures, ScheduledChange } from '@agenthix/core'
import type { Docker, ServiceState } from '../docker/docker'
import type { HqControl } from '../hq/control'
import type { HqSettings, SiteSettings } from '../compose/projects'
import type { BlockedPart } from './portsBlocked'
import { readSiteReport, siteContainerOf, type SiteCause, type SiteMove, type SiteReport } from './siteControl'
import { hqServicesOf } from '../images/partsOfVersion'

/** How a compose project's containers are: all running, some, none, or not there at all. */
export type PartState = 'running' | 'starting' | 'stopped' | 'missing'

export type SiteConnection = 'connected' | 'notConnected' | 'upgrade' | 'unpaired' | 'unknown'

export type MachineStatus = {
  machine: { name: string; hostServiceVersion: string }
  hq: null | {
    address: string
    version: string
    /** `port`: null only when installation.json does not record it. */
    listen: { bind: string; port: number | null }
    containers: PartState
    /** What hq answered through its control socket; null when it does not answer. */
    answer: null | { users: number; runningAgents: number | null }
  }
  site: null | {
    name: string
    version: string
    /** On hq's machine, the default site carries hq. */
    carriesHq: boolean
    containers: PartState
    connection: SiteConnection
    /** Why it is not connected, in the site's own terms; null when connected or not known. */
    cause: SiteCause | null
    /** hq told the site it moves, and the new address has not passed the site's check yet (spec §13). */
    moving?: SiteMove | null
    /** HQ refuses this copy: a restore of the site onto another machine replaced it then (adr-0119). */
    replacedAt?: string | null
  }
  /** The agent protections, as the host service last checked them (spec §8); the owner socket adds them. */
  protections?: ProtectionFigures
  /** Whether the host service runs the front door, and for which host names (spec §6). */
  frontDoor?: { on: boolean; hosts: string[] }
  /** The changes scheduled on this machine, soonest first (spec §14); the owner socket adds them. */
  scheduled?: ScheduledChange[]
  /** The release each part's image was first built for, when earlier than the one it runs (`upgrades/unchangedSince.ts`); the owner socket adds it. */
  unchangedSince?: { hq?: string; site?: string }
  /** Parts that are not running because another holds their published port (`portsBlocked.ts`); the owner socket adds them. */
  blocked?: BlockedPart[]
}

export function partState(services: ServiceState[], expected: number): PartState {
  if (services.length === 0) return 'missing'
  const running = services.filter(s => s.state === 'running' && s.health !== 'unhealthy').length
  if (running >= expected) return 'running'
  return running === 0 ? 'stopped' : 'starting'
}

export type Installed = {
  /** `port`: hq-web's published port, from `installation.json`; null when it is not recorded. */
  hq: { settings: HqSettings & { installedAt: string }; file: string; project: string; port: number | null } | null
  site: { settings: SiteSettings & { installedAt: string }; file: string; project: string } | null
}

/** hq-db, hq-server, the relay where its version has one, and hq-web; site-db and site. */
export const hqServiceCount = (version: string) => hqServicesOf(version).length
export const SITE_SERVICES = 2

export async function machineStatus(
  machine: MachineStatus['machine'],
  installed: Installed,
  docker: Docker,
  hqControl: HqControl,
): Promise<MachineStatus> {
  const out: MachineStatus = { machine, hq: null, site: null }
  let siteConnection: SiteConnection = 'unknown'
  let hqCause: SiteCause | null = null
  let hqAnswers = false
  if (installed.hq) {
    const { settings, file, project, port } = installed.hq
    const containers = partState(await docker.composePs(project, file), hqServiceCount(settings.version))
    const answer = containers === 'missing' || containers === 'stopped' ? null : await hqControl.status()
    if (answer) {
      hqAnswers = true
      siteConnection = answer.hqSite.state
      hqCause = answer.hqSite.cause ?? null
    }
    out.hq = {
      address: settings.address,
      version: answer?.version && answer.version !== 'dev' ? answer.version : settings.version,
      listen: { bind: settings.bind, port },
      containers,
      answer: answer ? { users: answer.users, runningAgents: answer.runningAgents ?? null } : null,
    }
  }
  if (installed.site) {
    const { settings, file, project } = installed.site
    const containers = partState(await docker.composePs(project, file), SITE_SERVICES)
    const report = siteConnection === 'connected' || containers === 'missing' || containers === 'stopped'
      ? null
      : await siteReport(docker, file)
    const cause = report?.cause ?? null
    // Where hq does not run, nothing but the site itself knows whether it is connected to hq.
    if (!installed.hq && report) siteConnection = report.connected ? 'connected' : 'notConnected'
    // hq cannot hear why its own site is not connected; the host service passes it on (spec §10).
    if (cause && hqAnswers && installed.hq && siteConnection === 'notConnected' && cause !== hqCause) {
      await hqControl.reportDefaultSiteCause(cause)
    }
    out.site = {
      name: settings.name,
      version: settings.version,
      carriesHq: installed.hq !== null,
      containers,
      connection: siteConnection,
      cause: cause ?? (siteConnection === 'notConnected' ? hqCause : null),
      moving: report?.moving ?? null,
      replacedAt: report?.replacedAt ?? null,
    }
  }
  return out
}

async function siteReport(docker: Docker, composeFile: string): Promise<SiteReport | null> {
  const container = siteContainerOf(composeFile)
  return container ? await readSiteReport(docker, container).catch(() => null) : null
}
