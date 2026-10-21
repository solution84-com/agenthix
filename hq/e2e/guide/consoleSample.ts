/**
 * The Fleet Console's API, answered for the guide's sample organisation (Fernhill & Co, as in sample.json and
 * seed-guide-data.mjs): Sam Okafor is the fleet admin, and HQ runs on the machine the Fleet Console runs on, with
 * two more machines. Every value is typed with the response types the screens read with (console-web's own, and
 * `@agenthix/core`'s), so an API change this no longer matches fails `npm run typecheck:guide`.
 *
 * Every moment follows the fixed date in sample.json, so two runs draw the same pictures.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AuthenticatorView, CloudView, FleetActivityPage, HostFigures, HostResults, RemoteAccessView, ScheduledChangeNotice } from '@agenthix/core'
import type { ConsoleStatus, FleetAdmin, SessionUser } from '../../../console-web/src/api/session'
import type { OpenedJoin, JoinView } from '../../../console-web/src/pages/add/joinWords'
import type { DisconnectedMachine, FleetHost, FleetResponse } from '../../../console-web/src/pages/dashboard/types'

const here = dirname(fileURLToPath(import.meta.url))
const NOW = Date.parse(JSON.parse(readFileSync(resolve(here, 'sample.json'), 'utf8')).clock.now)
const iso = (ms: number) => new Date(ms).toISOString()
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const ago = (ms: number) => iso(NOW - ms)
const GB = 1000 ** 3
const MEMORY_GB = 1024 ** 3

/** What the Fleet Console's own page address is: the screens are served from here, and every `/api` request is answered. */
export const CONSOLE_ORIGIN = 'http://127.0.0.1:4300'

export const SAM: SessionUser = { id: 'sample-user-sam', name: 'Sam Okafor' }
export const HQ_ADDRESS = 'https://hq.fernhill.example'
export const ORGANISATION = 'Fernhill & Co'

const fingerprint = (seed: string) => seed.repeat(8).slice(0, 64)
export const HQ_MACHINE = fingerprint('f3a91c0e5b72d48a')
export const OFFICE_SERVER = fingerprint('7be20d4c91a63f58')
export const LAPTOP_DANA = fingerprint('2c58e1a97d03b6f4')

const short = (fp: string) => fp.slice(0, 16).toUpperCase().replace(/(.{4})(?=.)/g, '$1 ')

type FiguresOver = { diskUsedPercent: number; memoryUsedGb: number; totalMemoryGb: number; locationSet: boolean; installs: ('hq' | 'site')[]; name: string; upDays: number }

function figures(o: FiguresOver): HostFigures {
  const diskTotal = 500 * GB
  return {
    takenAt: ago(MINUTE),
    machine: { name: o.name, system: 'Ubuntu 24.04', dockerVersion: '27.3.1', hostServiceVersion: '0.2.0', upSince: ago(o.upDays * DAY) },
    resources: {
      cpuLoad: 0.18,
      memory: { usedBytes: o.memoryUsedGb * MEMORY_GB, totalBytes: o.totalMemoryGb * MEMORY_GB },
      disk: { freeBytes: Math.round(diskTotal * (1 - o.diskUsedPercent / 100)), totalBytes: diskTotal },
    },
    ceilings: { memoryBytesPerContainer: 4 * MEMORY_GB, cpusPerContainer: 2, processesPerContainer: 512, containersAtOnce: 5 },
    protections: { holding: true, rules: ['machine-ports', 'published-ports', 'metadata-address'], checkedAt: ago(2 * MINUTE), problem: null },
    installs: o.installs.map(target => ({ target, version: '0.2.0', state: 'running', since: ago(o.upDays * DAY - HOUR), healthy: true, problem: null })),
    backups: {
      lastNightlyAt: iso(Date.parse('2027-04-12T01:00:00Z') + 4 * MINUTE),
      lastNightlyOk: true,
      locationSet: o.locationSet,
      lastCopyAt: o.locationSet ? iso(Date.parse('2027-04-12T01:00:00Z') + 9 * MINUTE) : null,
      lastExportAt: null,
      nightlyAt: '02:00',
    },
    frontDoor: { on: false, certificateExpiresAt: null, renewalProblem: null },
    scheduledChanges: 0,
  }
}

const sam = { kind: 'fleetAdmin', userId: SAM.id, name: SAM.name } as const

const upgradePlanned: ScheduledChangeNotice = {
  update: 'scheduled',
  sentAt: ago(DAY),
  reason: null,
  change: {
    id: 'sample-change-1', kind: 'upgrade', target: 'site', siteName: 'office-server',
    machine: { name: 'office-server', fingerprint: OFFICE_SERVER },
    at: iso(Date.parse('2027-04-14T03:00:00Z')), scheduledBy: sam, scheduledAt: ago(DAY),
    state: 'scheduled', detail: 'to 0.3.0', expectedMinutes: 10,
  },
}

const upgradeDone: ScheduledChangeNotice = {
  update: 'completed',
  sentAt: ago(9 * DAY),
  reason: null,
  change: {
    id: 'sample-change-0', kind: 'upgrade', target: 'hq', siteName: 'fernhill-hq',
    machine: { name: 'fernhill-hq', fingerprint: HQ_MACHINE },
    at: ago(9 * DAY), scheduledBy: sam, scheduledAt: ago(12 * DAY),
    state: 'done', detail: 'to 0.2.0', expectedMinutes: 10,
  },
}

const host = (over: Partial<FleetHost> & Pick<FleetHost, 'fingerprint' | 'machineName'>): FleetHost => ({
  fingerprintShort: short(over.fingerprint), hostId: over.machineName, siteName: over.machineName, hqMachine: false,
  siteRegistered: true, connectedAt: ago(40 * DAY), online: true, since: ago(14 * DAY), leftByItself: false, leftAt: null,
  figures: null, figuresAt: null, agents: null, scheduled: [], move: null, ...over,
})

export const HOSTS: FleetHost[] = [
  host({
    fingerprint: HQ_MACHINE, machineName: 'fernhill-hq', hqMachine: true, connectedAt: ago(60 * DAY),
    figures: figures({ name: 'fernhill-hq', diskUsedPercent: 38, memoryUsedGb: 9, totalMemoryGb: 32, locationSet: true, installs: ['hq', 'site'], upDays: 9 }),
    figuresAt: ago(MINUTE), agents: { running: 2, maxAtOnce: 5, reportedAt: ago(MINUTE) }, scheduled: [upgradeDone],
  }),
  host({
    fingerprint: OFFICE_SERVER, machineName: 'office-server',
    figures: figures({ name: 'office-server', diskUsedPercent: 54, memoryUsedGb: 11, totalMemoryGb: 64, locationSet: false, installs: ['site'], upDays: 14 }),
    figuresAt: ago(MINUTE), agents: { running: 1, maxAtOnce: 5, reportedAt: ago(MINUTE) }, scheduled: [upgradePlanned],
  }),
  host({
    // Often switched off, so its administrators asked not to be told: it shows as "Not heard from".
    fingerprint: LAPTOP_DANA, machineName: 'laptop-dana', connectedAt: ago(21 * DAY), online: false, notifyIfSilent: false, since: ago(5 * HOUR),
    figures: figures({ name: 'laptop-dana', diskUsedPercent: 61, memoryUsedGb: 6, totalMemoryGb: 16, locationSet: false, installs: ['site'], upDays: 3 }),
    figuresAt: ago(5 * HOUR),
  }),
]

const disconnected: DisconnectedMachine[] = []

export const FLEET: FleetResponse = {
  console: { machineName: 'fernhill-hq', version: '0.2.0', fingerprintShort: short(fingerprint('d94b07e3a1c5826f')), hq: 'connected' },
  hq: { organisationName: ORGANISATION, address: HQ_ADDRESS },
  hosts: HOSTS,
  disconnected,
}

export const STATUS: ConsoleStatus = { machineName: 'fernhill-hq', version: '0.2.0', hq: 'connected', fleetAdmins: 'some' }

export const FLEET_ADMINS: FleetAdmin[] = [
  { id: SAM.id, name: SAM.name, username: 'sam', organisationAdmin: true, since: ago(30 * DAY) },
]

// Nothing needs the fleet admin's attention in the sample. (The notice type lives beside screens that import the UI library,
// whose React types would clash with this check's, so an empty list is all that is said here.)
export const NOTICES: never[] = []

/** What the Fleet Console answers about Agenthix Cloud while the organisation is not connected to it, as it does today. */
export const CLOUD_VIEW: CloudView = {
  organisation: null, account: null, place: 'onTheMachine', connecting: null, lastAttempt: null, cloudUrl: null, runByCloud: false,
}
export const REMOTE_ACCESS: RemoteAccessView = { state: { on: false }, organisationConnected: false, place: 'onTheMachine' }
export const AUTHENTICATOR: AuthenticatorView = { code: null, place: 'onTheMachine' }

export const ACTIVITY: FleetActivityPage = {
  next: null,
  entries: [
    { id: 'sample-activity-5', at: ago(DAY), by: { id: SAM.id, name: SAM.name }, action: 'command.schedule', subject: 'Upgrade office-server to 0.3.0, on Wed 14 Apr at 04:00' },
    { id: 'sample-activity-4', at: ago(3 * DAY), by: { id: SAM.id, name: SAM.name }, action: 'command.backup.take', subject: 'fernhill-hq' },
    { id: 'sample-activity-3', at: ago(9 * DAY), by: { id: SAM.id, name: SAM.name }, action: 'command.upgrade', subject: 'fernhill-hq, to 0.2.0' },
    { id: 'sample-activity-2', at: ago(21 * DAY), by: { id: SAM.id, name: SAM.name }, action: 'site.added', subject: 'laptop-dana' },
    { id: 'sample-activity-1', at: ago(40 * DAY), by: null, action: 'site.registered', subject: 'office-server' },
    { id: 'sample-activity-0', at: ago(60 * DAY), by: { id: SAM.id, name: SAM.name }, action: 'fleetAdmin.granted', subject: SAM.name },
  ],
}

/** The nights a machine lists, the newest first: a nightly backup at about 02:00 on each of the last seven nights. */
export function nightsOf(fp: string): HostResults['backup.list'] {
  const hq = fp === HQ_MACHINE
  const backups = [0, 1, 2, 3, 4, 5, 6].map((back): HostResults['backup.list']['backups'][number] => {
    const night = iso(Date.parse('2027-04-12T00:00:00Z') - back * DAY).slice(0, 10)
    return {
      id: `sample-backup-${fp.slice(0, 4)}-${night}`, night, takenAt: `${night}T01:00:00.000Z`, kind: 'nightly',
      holds: hq ? ['hq', 'site'] : ['site'], sizeBytes: (hq ? 412 : 96) * 1000 ** 2 + back * 3_000_000,
      onMachine: true, inLocation: hq,
    }
  })
  return { backups, location: hq ? 'read' : 'none' }
}

const EXPIRES = iso(NOW + HOUR)

/** The join a fleet admin starts with *Continue*; the code is made up, and not one a machine could use. */
export const OPENED_JOIN: OpenedJoin = {
  joinId: 'sample-join-1', state: 'waiting', expiresAt: EXPIRES, machine: null, replaces: null, hqClaim: null,
  siteName: null, problem: null, code: 'K7QM-4XPD-93TB',
}

/** The same join once a new machine used the code and waits to be confirmed. */
export const ARRIVED_JOIN: JoinView = {
  ...OPENED_JOIN, state: 'confirming',
  machine: { name: 'build-box', fingerprint: fingerprint('a06d3b81c9e2475f'), fingerprintShort: short(fingerprint('a06d3b81c9e2475f')) },
}
