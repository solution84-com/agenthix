import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostFigures } from '@agenthix/core'
import { forgetCsrfToken } from '../api/csrf'
import { BackupsPage } from '../pages/backups/BackupsPage'
import { DashboardPage } from '../pages/dashboard/DashboardPage'
import { overviewOf } from '../pages/dashboard/overview'
import type { FleetHost, FleetResponse } from '../pages/dashboard/types'
import { describeHost, runsSite } from '../pages/dashboard/words'
import { SitePage } from '../pages/site/SitePage'
import { fakeServer } from './fakeServer'

// Whether a machine runs a site comes from what the machine says, never from a name a move gave it: a machine with
// no site reads as such, and no card or tile counts it as a site.

const GB = 1000 ** 3
const NOW = new Date()
const SITE = { target: 'site' as const, version: '0.2.0', state: 'running' as const, since: NOW.toISOString(), healthy: true, problem: null }

function figures(installs: HostFigures['installs']): HostFigures {
  return {
    takenAt: NOW.toISOString(),
    machine: { name: 'm', system: 'Linux', dockerVersion: '27', hostServiceVersion: '0.2.0', upSince: NOW.toISOString() },
    resources: { cpuLoad: 0.1, memory: { usedBytes: 30 * GB, totalBytes: 100 * GB }, disk: { freeBytes: 60 * GB, totalBytes: 100 * GB } },
    ceilings: { memoryBytesPerContainer: GB, cpusPerContainer: 1, processesPerContainer: 100, containersAtOnce: 6 },
    protections: { holding: true, rules: [], checkedAt: NOW.toISOString(), problem: null },
    installs,
    backups: { lastNightlyAt: NOW.toISOString(), lastNightlyOk: true, locationSet: false, lastCopyAt: null, lastExportAt: null, nightlyAt: '02:00' },
    frontDoor: { on: false, certificateExpiresAt: null, renewalProblem: null },
    scheduledChanges: 0,
  }
}

function host(name: string, over: Partial<FleetHost> = {}): FleetHost {
  return {
    fingerprint: name.padEnd(64, '0'), fingerprintShort: name, hostId: name, machineName: name, siteName: name, hqMachine: false,
    siteRegistered: true, connectedAt: NOW.toISOString(), online: true, since: NOW.toISOString(), leftByItself: false, leftAt: null,
    figures: figures([SITE]), figuresAt: NOW.toISOString(), agents: null, scheduled: [], move: null, ...over,
  }
}

const hqBox = host('hq-box', { hqMachine: true, figures: figures([{ ...SITE, target: 'hq' }]) })
const machineA = host('machine-a')
/** machine-b after a move of machine-a to it that did not happen: connected, running only its host service. */
const machineB = host('machine-b', {
  siteName: '', siteRegistered: false, figures: figures([]), endedMove: { moveId: 'm1', siteName: 'machine-a', state: 'failed' },
})
const fleet = (hosts: FleetHost[]): FleetResponse => ({
  console: { machineName: 'hq-box', version: '0.2.0', fingerprintShort: 'abcd', hq: 'connected' }, hq: null, hosts, disconnected: [],
})

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear() })

describe('a machine with no site @SC-899', () => {
  it('runs a site only by what its figures say, whatever name its record holds', () => {
    expect(runsSite(machineA)).toBe(true)
    expect(runsSite(hqBox)).toBe(true)
    expect(runsSite(host('named', { figures: figures([]) }))).toBe(false)
    expect(runsSite(machineB)).toBe(false)
    // Before its first figures, what HQ registered is all there is to go on.
    expect(runsSite(host('new', { figures: null }))).toBe(true)
    expect(runsSite(host('new', { figures: null, siteRegistered: false }))).toBe(false)
  })

  it('reads "No site", says the move to it did not happen, and never Healthy', () => {
    expect(describeHost(machineB, NOW)).toMatchObject({
      state: 'empty', label: 'No site', tone: 'neutral', attention: null,
      sentence: 'The move of machine-a to it did not happen. Nothing runs here but its host service.',
    })
    expect(describeHost(host('spare', { siteName: '', figures: figures([]) }), NOW)).toMatchObject({
      state: 'empty', label: 'No site', sentence: 'Nothing runs here but its host service.',
    })
  })

  it('while a move to it waits: Waiting to receive the site', () => {
    const waiting = host('machine-b', { siteName: '', figures: figures([]), move: { moveId: 'm2', role: 'receiving', siteName: 'machine-a', state: 'waitingForMachine', at: null } })
    expect(describeHost(waiting, NOW)).toMatchObject({ state: 'moving', label: 'Waiting to receive machine-a' })
    expect(runsSite(waiting)).toBe(false)
  })

  it('is not counted as a site in the tiles, and neither is a machine receiving one', () => {
    const receiving = host('machine-c', { siteName: '', move: { moveId: 'm3', role: 'receiving', siteName: 'machine-d', state: 'running', at: null } })
    const sending = host('machine-d', { move: { moveId: 'm3', role: 'sending', siteName: 'machine-d', state: 'running', at: null } })
    const o = overviewOf([hqBox, machineA, machineB, receiving, sending], NOW)
    expect(o.sites).toEqual({ total: 3, breakdown: '2 healthy · 1 moving · 2 machines with no site' })
  })

  it('on the dashboard: under HQ by the machine\'s own name, saying it has no site, and not counted as one', async () => {
    fakeServer({ 'GET /fleet': { status: 200, body: fleet([hqBox, machineA, machineB]) } })
    render(<DashboardPage />)
    const b = await screen.findByRole('article', { name: 'machine-b' })
    expect(within(b).getAllByText('No site').length).toBeGreaterThan(0)
    expect(within(b).queryByText('Healthy')).toBeNull()
    expect(within(b).queryByText(/runs/)).toBeNull()
    expect(screen.getAllByRole('article', { name: 'machine-a' })).toHaveLength(1)
    expect(screen.getByText('HQ and 2 sites · nothing needs you')).toBeTruthy()
  })

  it("its page is the machine's, with no action on a site", async () => {
    fakeServer({ [`GET /hosts/${machineB.fingerprint}`]: { status: 200, body: { host: machineB } } })
    render(<SitePage fingerprint={machineB.fingerprint} />)
    expect(await screen.findByRole('heading', { name: 'machine-b', level: 1 })).toBeTruthy()
    expect(screen.getByText('No site')).toBeTruthy()
    expect(screen.getByText('The move of machine-a to it did not happen. Nothing runs here but its host service.')).toBeTruthy()
    for (const name of ['Change capacity…', 'Upgrade…', 'Move…', 'Back up now', 'Logs']) expect(screen.queryByRole('button', { name })).toBeNull()
    expect(screen.getByRole('button', { name: 'Disconnect…' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'The site' })).toBeNull()
    expect(screen.getByRole('region', { name: 'The machine' })).toBeTruthy()
  })

  it('is not listed on the Backups screen', async () => {
    fakeServer({ 'GET /fleet': { status: 200, body: fleet([hqBox, machineA, machineB]) } })
    render(<BackupsPage />)
    expect(await screen.findByRole('article', { name: 'machine-a' })).toBeTruthy()
    expect(screen.queryByRole('article', { name: /machine-b/ })).toBeNull()
    expect(screen.getByText(/of 2 keep their backups/)).toBeTruthy()
  })
})
