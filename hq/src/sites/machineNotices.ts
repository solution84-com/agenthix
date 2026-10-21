/**
 * What fleet admins are asked about the machines in the fleet (host-management spec §6, §10), as sticky *Needs you*
 * items that clear themselves:
 *
 * - a machine that **left by itself** — disconnected on the machine, which told hq so — until a fleet admin removes
 *   it in the Fleet Console;
 * - a machine whose host service has **not been heard from for 10 minutes**, whether or not work waits on it, until
 *   it connects again. Based on the machine's host link, not its site's channel. Organisation admins keep their own
 *   item for a site that work waits on (`siteNotifications.ts`).
 *
 * Like the site notifications, each pass works out the whole state and makes the open notifications match it. The
 * time in a title is in each reader's own zone.
 */
import { prisma } from 'wasp/server'
import { FLEET_MACHINE_NOTIFICATION_TYPES as T, OPEN_STATUSES } from '../notifications/notificationKinds'
import {
  clearPersistentNotification, raisePersistentNotification, type PersistentNotice,
} from '../notifications/persistent'
import { Logger } from '../server/utils/logger'
import { connectedHosts, type FleetHost } from '../fleet/hosts'
import { fleetAdminRecipients } from './fleetAdmins'
import { SITES_PAGE_URL } from './siteNotifications'
import { leftNotice, machineStanding, notHeardFromNotice, type HostPresence } from './machineStanding'

const logger = new Logger('MachineNotices')

const RECONCILE_INTERVAL_MS = 30_000

const actionUrl = (host: FleetHost) => (host.site ? `${SITES_PAGE_URL}/${host.site.id}` : SITES_PAGE_URL)

type Reader = { userId: string; zone: string }
type Wanted = { subjectKey: string; noticeIn: (zone: string) => PersistentNotice }

async function readers(): Promise<Reader[]> {
  const ids = await fleetAdminRecipients()
  const zones = new Map((await prisma.userSettings.findMany({
    where: { userId: { in: ids } }, select: { userId: true, timezone: true },
  })).map(s => [s.userId, s.timezone ?? 'UTC']))
  return ids.map(userId => ({ userId, zone: zones.get(userId) ?? 'UTC' }))
}

/** As `syncPersistentNotifications`, with each reader given the notice in their own zone. */
async function syncInZones(type: string, wanted: Wanted[], to: Reader[], keep: string[]): Promise<void> {
  const subjects = new Set([...wanted.map(w => w.subjectKey), ...keep])
  const open = await prisma.notification.findMany({
    where: { type, status: { in: [...OPEN_STATUSES] }, subjectKey: { not: null } },
    select: { subjectKey: true }, distinct: ['subjectKey'],
  })
  for (const { subjectKey } of open) {
    if (subjectKey && !subjects.has(subjectKey)) await clearPersistentNotification(type, subjectKey)
  }
  const byZone = new Map<string, string[]>()
  for (const r of to) byZone.set(r.zone, [...(byZone.get(r.zone) ?? []), r.userId])
  for (const w of wanted) {
    await clearPersistentNotification(type, w.subjectKey, { exceptUserIds: to.map(r => r.userId) })
    for (const [zone, userIds] of byZone) await raisePersistentNotification(userIds, w.noticeIn(zone))
  }
}

async function pass(): Promise<void> {
  const now = new Date()
  const [to, hosts] = await Promise.all([readers(), connectedHosts()])
  const left: Wanted[] = []
  const silent: Wanted[] = []
  const undecided: string[] = []
  for (const host of hosts) {
    const s = machineStanding(host, presence?.onlineSince(host.hostId) != null, now, hqStartedAt)
    if (s.kind === 'left') left.push({ subjectKey: host.hostId, noticeIn: () => leftNotice(host, actionUrl(host)) })
    if (s.kind === 'notHeardFrom') silent.push({ subjectKey: host.hostId, noticeIn: zone => notHeardFromNotice(host, s.since, now, zone, actionUrl(host)) })
    if (s.kind === 'undecided') undecided.push(host.hostId)
  }
  await syncInZones(T.left, left, to, [])
  await syncInZones(T.notHeardFrom, silent, to, undecided)
}

let presence: HostPresence | null = null
let hqStartedAt = new Date()
let running: Promise<void> | null = null
let again = false

/** Brings the machine notices up to date; never throws, and a burst of changes costs at most two passes. */
export function reconcileMachineNotices(): Promise<void> {
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
        logger.error('could not bring the machine notices up to date', err)
      }
    } while (again)
  })().finally(() => { running = null })
  return running
}

let timer: ReturnType<typeof setInterval> | null = null

/** Once, when hq starts its host link. hq's start is when every machine's grace begins. */
export function startMachineNotices(hub: HostPresence): void {
  presence = hub
  hqStartedAt = new Date()
  if (timer) return
  timer = setInterval(() => void reconcileMachineNotices(), RECONCILE_INTERVAL_MS)
  timer.unref?.()
}

/** Test-only. */
export function __setMachinePresenceForTests(hub: HostPresence | null, startedAt: Date): void {
  presence = hub
  hqStartedAt = startedAt
}
