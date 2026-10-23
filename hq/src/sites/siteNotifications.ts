/**
 * The persistent notifications Execution Sites raises to organisation admins
 * (every screen reviewed spec §3): machines asking to connect, a request whose
 * code expired, a site that needs upgrading, one not connected while work
 * waits on it, HQ's own site ("hq-box · HQ's site") not running, and Docker not running or a disk
 * nearly full. Each clears itself when its problem is fixed.
 *
 * Every pass works out the whole state from the database and makes the open
 * notifications match it (`syncPersistentNotifications`), so a missed event
 * cannot leave one stuck. A pass runs where a state changes — a site
 * connecting, refused for its version, reporting its health or removed; a
 * request made or decided — and every `RECONCILE_INTERVAL_MS`, which is what
 * notices a site that has been away for longer than the grace, a request
 * that expired, and work newly held for a site that is down.
 *
 * For one site and one problem there is only ever one notification. A site
 * away for less than the grace — hq has just restarted, or it dropped again
 * moments after it was last heard from — keeps the not-connected one it has
 * open rather than having it cleared and raised again, and a problem that
 * returns after it was fixed reopens the same one (`persistent.ts`).
 *
 * A machine asking to connect is no longer news here: a site is added in the Fleet Console (host-management spec §10).
 * A pass still closes the "asking to connect" notifications an earlier version raised.
 */
import { prisma } from 'wasp/server'
import { SITE_NOTIFICATION_TYPES as T } from '../notifications/notificationKinds'
import {
  syncPersistentNotifications,
  type PersistentNotice,
} from '../notifications/persistent'
import { Logger } from '../server/utils/logger'
import { readSiteFacts, type SiteFacts } from './siteFacts'
import { awayWithinGrace, siteStanding, type SiteProblem } from './siteStanding'
import { recordSiteProblems } from '../diagnostics/siteConditions'
import { displaySiteName } from '../shared/siteName'
import { BRANDING, type MachineShortage } from '@agenthix/core'
import { fleetAdminRecipients } from './fleetAdmins'
import { syncNearlyOutNotices, type NearlyOut } from './resources/nearlyOutNotices'
import { registerRunResourceNotices } from './resources/runResourceNotice'

const logger = new Logger('SiteNotifications')

export const SITES_PAGE_URL = '/admin/where-work-runs'

/** Twice a minute: a request's code or a site's grace runs out at most this long before an admin is told. */
export const RECONCILE_INTERVAL_MS = 30_000

/** A machine names itself, so its name is clipped before it reaches anyone's notifications. */
const LABEL_MAX = 40

function name(label: string): string {
  return label.length > LABEL_MAX ? `${label.slice(0, LABEL_MAX - 1)}…` : label
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** What a machine is nearly out of, among a site's problems. */
export function machineShortages(problems: SiteProblem[]): MachineShortage[] {
  return [
    problems.some(p => p.kind === 'diskNearlyFull') ? 'disk' as const : null,
    problems.some(p => p.kind === 'memoryNearlyFull') ? 'memory' as const : null,
  ].filter((s): s is MachineShortage => s !== null)
}

const WHAT_TO_DO: Record<MachineShortage, string> = {
  disk: "Free space on that machine's disk, or give it a larger one; runs there may fail once it is full.",
  memory: `Give each run less memory or run fewer at once ("${BRANDING.cliCommand} capacity set" on that machine), or give the machine more; runs there may be stopped when it runs out.`,
}

/**
 * Docker down, or the machine nearly out of disk or memory, for the people who look after machines, with what to
 * do. In words only: until the fleet admin role arrives, organisation admins read it, and they never see a
 * machine's figures (host-management spec §10).
 */
export function healthNotice(siteId: string, label: string, dockerDown: boolean, short: MachineShortage[]): PersistentNotice {
  const nearly = short.length > 0 ? `nearly out of ${short.join(' and ')}` : ''
  if (dockerDown) {
    return open(T.health, siteId, `Docker is not running on ${label}`,
      `Every run there fails until Docker is started on that machine.${nearly ? ` It is also ${nearly}.` : ''}`)
  }
  return open(T.health, siteId, `${label} is ${nearly}`, short.map(s => WHAT_TO_DO[s]).join(' '))
}

async function orgAdmins(): Promise<string[]> {
  const rows = await prisma.userSettings.findMany({
    where: { role: 'ADMIN', user: { deactivatedAt: null, erasedAt: null } },
    select: { userId: true },
  })
  return rows.map(r => r.userId)
}

const open = (type: string, subjectKey: string, title: string, body: string): PersistentNotice => ({
  type, subjectKey, title, body, actionLabel: 'Open Execution Sites', actionUrl: SITES_PAGE_URL,
})

function noticesFor(site: SiteFacts, problems: SiteProblem[]): Record<string, PersistentNotice | undefined> {
  const label = name(displaySiteName(site))
  const out: Record<string, PersistentNotice | undefined> = {}
  const dockerDown = problems.some(p => p.kind === 'dockerDown')
  for (const p of problems) {
    if (p.kind === 'upgrade') {
      // A sentence, never the versions: those are for fleet admins (host-management spec §10).
      const hq = p.side === 'hq'
      const runs = hq ? "Whoever runs HQ's machine upgrades HQ." : 'A fleet admin upgrades it in the Fleet Console.'
      const stopped = site.projectCount > 0
        ? ` ${plural(site.projectCount, 'project')} ${site.projectCount === 1 ? 'stops' : 'stop'} until ${hq ? 'HQ' : 'it'} is upgraded.`
        : ''
      out[T.upgrade] = open(T.upgrade, site.siteId, hq ? `${label} needs a newer HQ` : `${label} needs upgrading`, `${runs}${stopped}`)
    }
    if (p.kind === 'hqSiteDown') {
      out[T.hqSiteDown] = open(T.hqSiteDown, site.siteId, `${label} is not running`,
        "Projects on it can't run or open files until it is back. Whoever runs HQ's machine restarts it; it reconnects by itself.")
    }
    if (p.kind === 'notConnectedWithWork') {
      const waits = [
        site.waiting.runs > 0 ? plural(site.waiting.runs, 'run') : null,
        site.waiting.changes > 0 ? plural(site.waiting.changes, 'change') : null,
      ].filter(Boolean).join(' and ')
      const verb = site.waiting.runs + site.waiting.changes === 1 ? 'is' : 'are'
      out[T.offlineWithWork] = open(T.offlineWithWork, site.siteId, `${label} is not connected`, `${waits} ${verb} waiting for it.`)
    }
  }
  const short = machineShortages(problems)
  if (dockerDown || short.length > 0) out[T.health] = healthNotice(site.siteId, label, dockerDown, short)
  return out
}

async function pass(): Promise<void> {
  const now = new Date()
  const [admins, fleet, sites] = await Promise.all([orgAdmins(), fleetAdminRecipients(), readSiteFacts()])
  const byType = new Map<string, PersistentNotice[]>(
    [T.upgrade, T.hqSiteDown, T.offlineWithWork, T.health, T.requests, T.requestExpired].map(t => [t, [] as PersistentNotice[]]))
  // Sites away for less than the grace: their not-connected notifications, if open, stay as they are.
  const undecided: string[] = []
  const nearlyOut: NearlyOut[] = []
  for (const site of sites) {
    const { problems } = siteStanding(site, now, hqStartedAt)
    for (const [type, notice] of Object.entries(noticesFor(site, problems))) if (notice) byType.get(type)!.push(notice)
    for (const shortage of machineShortages(problems)) nearlyOut.push({ siteId: site.siteId, siteName: name(displaySiteName(site)), shortage })
    if (awayWithinGrace(site, now, hqStartedAt)) undecided.push(site.siteId)
    await recordSiteProblems(site, problems, now)
  }
  for (const [type, notices] of byType) {
    const keep = type === T.hqSiteDown || type === T.offlineWithWork ? undecided : []
    await syncPersistentNotifications(type, notices, type === T.health ? fleet : admins, { keep })
  }
  await syncNearlyOutNotices(nearlyOut)
}

let hqStartedAt = new Date()
let running: Promise<void> | null = null
let again = false

/**
 * Brings the site notifications up to date. Never throws and never waits on
 * the caller: a pass already running runs once more when it ends, so a burst
 * of changes costs at most two passes.
 */
export function reconcileSiteNotifications(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    do {
      again = false
      try {
        await pass()
      } catch (err) {
        logger.error('could not bring the site notifications up to date', err)
      }
    } while (again)
  })().finally(() => { running = null })
  return running
}

let timer: ReturnType<typeof setInterval> | null = null

/** Once, when hq starts listening for sites. hq's start is when every site's grace begins. */
export function startSiteNotifications(): void {
  hqStartedAt = new Date()
  if (timer) return
  void registerRunResourceNotices().catch(err => logger.error('could not listen for runs that stop for lack of resources', err))
  timer = setInterval(() => void reconcileSiteNotifications(), RECONCILE_INTERVAL_MS)
  timer.unref?.()
}

/** When hq started listening for sites: the earliest a site's grace can begin (`siteStanding`). */
export function hqStartedListeningAt(): Date {
  return hqStartedAt
}

/** Test-only. */
export function __setHqStartedAtForTests(at: Date): void {
  hqStartedAt = at
}
