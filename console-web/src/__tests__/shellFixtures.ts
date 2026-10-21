import type { HostFigures } from '@agenthix/core'
import type { FleetHost, FleetResponse } from '../pages/dashboard/types'
import { SAM, STATUS_OK, type Route } from './fakeServer'

const NOW = new Date()

export function figures(installs: HostFigures['installs'] = [{ target: 'site', version: '0.2.0', state: 'running', since: NOW.toISOString(), healthy: true, problem: null }]): HostFigures {
  return {
    takenAt: NOW.toISOString(),
    machine: { name: 'm', system: 'Linux', dockerVersion: '27', hostServiceVersion: '0.2.0', upSince: NOW.toISOString() },
    resources: { cpuLoad: 0.1, memory: { usedBytes: 30, totalBytes: 100 }, disk: { freeBytes: 60, totalBytes: 100 } },
    ceilings: { memoryBytesPerContainer: 1, cpusPerContainer: 1, processesPerContainer: 100, containersAtOnce: 5 },
    protections: { holding: true, rules: [], checkedAt: NOW.toISOString(), problem: null },
    installs,
    backups: { lastNightlyAt: null, lastNightlyOk: null, locationSet: false, lastCopyAt: null, lastExportAt: null, nightlyAt: '02:00' },
    frontDoor: { on: false, certificateExpiresAt: null, renewalProblem: null },
    scheduledChanges: 0,
  }
}

export function host(name: string, over: Partial<FleetHost> = {}): FleetHost {
  return {
    fingerprint: name.padEnd(64, '0'), fingerprintShort: name, hostId: name, machineName: name, siteName: name, hqMachine: false,
    siteRegistered: true, connectedAt: NOW.toISOString(), online: true, since: NOW.toISOString(), leftByItself: false, leftAt: null,
    figures: figures(), figuresAt: NOW.toISOString(), agents: null, scheduled: [], move: null, ...over,
  }
}

export const fleet = (hosts: FleetHost[], hq: FleetResponse['console']['hq'] = 'connected'): FleetResponse => ({
  console: { machineName: 'machine-d', version: '0.2.0', fingerprintShort: 'abcd', hq }, hq: null, hosts, disconnected: [],
})

export const SIGNED_IN: Record<string, Route> = {
  'GET /status': { status: 200, body: STATUS_OK },
  'GET /session': { status: 200, body: { user: SAM, account: { username: 'sam', organisationAdmin: true, since: null }, hq: null } },
  'DELETE /session': { status: 204 },
}
