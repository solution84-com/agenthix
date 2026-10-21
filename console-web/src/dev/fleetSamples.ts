import type { HostFigures } from '@agenthix/core'
import type { FleetHost, FleetResponse } from '../pages/dashboard/types'
import type { HqFacts } from '../api/session'

const GB = 1000 ** 3
const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()

function figures(diskUsed: number, target: 'hq' | 'site'): HostFigures {
  return {
    takenAt: at(0),
    machine: { name: 'sample', system: 'Linux', dockerVersion: '27', hostServiceVersion: '0.2.0', upSince: at(60 * 24 * 12) },
    resources: { cpuLoad: 0.2, memory: { usedBytes: 30 * GB, totalBytes: 100 * GB }, disk: { freeBytes: (100 - diskUsed) * GB, totalBytes: 100 * GB } },
    ceilings: { memoryBytesPerContainer: GB, cpusPerContainer: 1, processesPerContainer: 100, containersAtOnce: 6 },
    protections: { holding: true, rules: [], checkedAt: at(1), problem: null },
    installs: [{ target, version: '0.2.0', state: 'running', since: at(60 * 24 * 12), healthy: true, problem: null }],
    backups: { lastNightlyAt: at(600), lastNightlyOk: true, locationSet: true, lastCopyAt: at(590), lastExportAt: null, nightlyAt: '02:00' },
    frontDoor: { on: false, certificateExpiresAt: null, renewalProblem: null },
    scheduledChanges: 0,
  }
}

function sample(name: string, over: Partial<FleetHost>): FleetHost {
  return {
    fingerprint: name.padEnd(64, '0'), fingerprintShort: name, hostId: name, machineName: name, siteName: name, hqMachine: false,
    siteRegistered: true, connectedAt: at(60 * 24 * 30), online: true, since: at(60 * 24 * 12), leftByItself: false, leftAt: null,
    figures: figures(40, 'site'), figuresAt: at(0), agents: null, scheduled: [], move: null, ...over,
  }
}

const runs = (running: number, maxAtOnce: number) => ({ running, maxAtOnce, reportedAt: at(0) })

export const SAMPLE_HQ: HqFacts = { organisationName: 'Acme Robotics', address: 'https://hq.acme.example' }

export const SAMPLE_HOSTS: FleetHost[] = [
  sample('hq-box', { hqMachine: true, figures: figures(30, 'hq'), agents: runs(2, 4) }),
  sample('office-server', { figures: figures(91, 'site'), agents: runs(1, 6) }),
  sample('laptop', { online: false, since: at(60 * 18) }),
  sample('old-box', { online: false, leftByItself: true, leftAt: at(60 * 3) }),
  sample('hel-3', { online: false, move: { moveId: 'm1', role: 'receiving', siteName: 'office-server', state: 'waitingForMachine', at: null } }),
]

export const SAMPLE_FLEET: FleetResponse = {
  console: { machineName: 'hq-box', version: '0.2.0', fingerprintShort: 'hqbx', hq: 'connected' }, hq: SAMPLE_HQ, hosts: SAMPLE_HOSTS, disconnected: [],
}
