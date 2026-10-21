import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostFigures } from '@agenthix/core'
import { App } from '../App'
import { forgetCsrfToken } from '../api/csrf'
import { DashboardPage } from '../pages/dashboard/DashboardPage'
import type { FleetHost, FleetResponse } from '../pages/dashboard/types'
import { fakeServer, SAM, STATUS_OK } from './fakeServer'

// What the Fleet Console hears from HQ (the organisation's name, HQ's address, each site's runs, the person's account)
// drawn where the boards draw it, and left out where HQ has not said.

const NOW = new Date()
const HQ = { organisationName: 'Acme Robotics', address: 'https://hq.acme.example' }

function figures(): HostFigures {
  return {
    takenAt: NOW.toISOString(),
    machine: { name: 'm', system: 'Linux', dockerVersion: '27', hostServiceVersion: '0.2.0', upSince: NOW.toISOString() },
    resources: { cpuLoad: 0.1, memory: { usedBytes: 30, totalBytes: 100 }, disk: { freeBytes: 60, totalBytes: 100 } },
    ceilings: { memoryBytesPerContainer: 1, cpusPerContainer: 1, processesPerContainer: 100, containersAtOnce: 5 },
    protections: { holding: true, rules: [], checkedAt: NOW.toISOString(), problem: null },
    installs: [{ target: 'site', version: '0.2.0', state: 'running', since: NOW.toISOString(), healthy: true, problem: null }],
    backups: { lastNightlyAt: null, lastNightlyOk: null, locationSet: false, lastCopyAt: null, lastExportAt: null, nightlyAt: '02:00' },
    frontDoor: { on: false, certificateExpiresAt: null, renewalProblem: null },
    scheduledChanges: 0,
  }
}

function host(name: string, over: Partial<FleetHost> = {}): FleetHost {
  return {
    fingerprint: name.padEnd(64, '0'), fingerprintShort: name, hostId: name, machineName: name, siteName: name, hqMachine: false,
    siteRegistered: true, connectedAt: NOW.toISOString(), online: true, since: NOW.toISOString(), leftByItself: false, leftAt: null,
    figures: figures(), figuresAt: NOW.toISOString(), agents: null, scheduled: [], move: null, ...over,
  }
}

const runs = (running: number, maxAtOnce: number) => ({ running, maxAtOnce, reportedAt: NOW.toISOString() })
const fleet = (hosts: FleetHost[], hq: FleetResponse['hq'] = HQ): FleetResponse => ({
  console: { machineName: 'hq-box', version: '0.2.0', fingerprintShort: 'abcd', hq: 'connected' }, hq, hosts, disconnected: [],
})
const hqBox = (over: Partial<FleetHost> = {}) => host('hq-box', { hqMachine: true, agents: runs(2, 4), ...over })

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  forgetCsrfToken()
  sessionStorage.clear()
})

describe('HQ’s hub card @SC-896', () => {
  it('is titled with the organisation’s name, gives HQ’s address and opens it in a new tab', async () => {
    fakeServer({ 'GET /fleet': { status: 200, body: fleet([hqBox(), host('office-server')]) } })
    render(<DashboardPage />)
    const hero = await screen.findByRole('region', { name: 'HQ' })
    expect(within(hero).getByRole('heading', { name: "Acme Robotics' HQ" })).toBeTruthy()
    expect(within(hero).getByText(/https:\/\/hq\.acme\.example · on hq-box · 2 of 2 sites connected/)).toBeTruthy()
    const open = within(hero).getByRole('link', { name: 'Open HQ ↗' })
    expect(open.getAttribute('href')).toBe('https://hq.acme.example')
    expect(open.getAttribute('target')).toBe('_blank')
    expect(open.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.getByText('Acme Robotics · HQ and 2 sites · nothing needs you')).toBeTruthy()
  })

  it('goes without the name and the address when HQ has not said', async () => {
    fakeServer({ 'GET /fleet': { status: 200, body: fleet([hqBox({ agents: null })], null) } })
    render(<DashboardPage />)
    const hero = await screen.findByRole('region', { name: 'HQ' })
    expect(within(hero).getByRole('heading', { name: 'HQ' })).toBeTruthy()
    expect(within(hero).queryByRole('link', { name: /Open HQ/ })).toBeNull()
    expect(within(hero).getByText(/^on hq-box · 1 of 1 site connected/)).toBeTruthy()
  })
})

describe('agents running @SC-896', () => {
  it('are counted against capacity across the fleet, and on each site’s line', async () => {
    fakeServer({ 'GET /fleet': { status: 200, body: fleet([hqBox(), host('office-server', { agents: runs(1, 6) }), host('laptop', { online: false })]) } })
    render(<DashboardPage />)
    const tile = (await screen.findByText('Agents running')).parentElement!
    expect(within(tile).getByText('3 of 10')).toBeTruthy()
    expect(within(tile).getByText('Room for 7 more on 2 sites')).toBeTruthy()
    expect(within(screen.getByRole('article', { name: 'hq-box' })).getByText(/^HQ's site · 2 of 4 runs/)).toBeTruthy()
    expect(within(screen.getByRole('article', { name: 'office-server' })).getByText(/^Site · 1 of 6 runs/)).toBeTruthy()
    expect(within(screen.getByRole('article', { name: 'laptop' })).queryByText(/runs/)).toBeNull()
  })

  it('say so when no site’s runs are known', async () => {
    fakeServer({ 'GET /fleet': { status: 200, body: fleet([hqBox({ agents: null })]) } })
    render(<DashboardPage />)
    const tile = (await screen.findByText('Agents running')).parentElement!
    expect(within(tile).getByText('—')).toBeTruthy()
    expect(within(tile).getByText('HQ has not said yet')).toBeTruthy()
  })
})

describe('the person signed in @SC-895', () => {
  const SIGNED_IN = {
    'GET /status': { status: 200, body: STATUS_OK },
    'GET /session': { status: 200, body: { user: SAM, account: { username: 'sam', organisationAdmin: false, since: '2026-10-12T09:00:00.000Z' }, hq: HQ } },
    'GET /fleet': { status: 200, body: fleet([hqBox()]) },
  }

  it('is named by their username in their menu', async () => {
    fakeServer(SIGNED_IN)
    window.history.replaceState(null, '', '/fleet')
    render(<App />)
    const nav = await screen.findByRole('navigation', { name: 'Fleet Console' })
    fireEvent.click(within(nav).getByRole('button', { name: /Sam Rivera/ }))
    expect(await screen.findByText('sam')).toBeTruthy()
    expect(screen.getByText(/Signed in as/)).toBeTruthy()
  })

  it('sees since when they hold the role, and is sent to HQ to change their name and password', async () => {
    fakeServer(SIGNED_IN)
    window.history.replaceState(null, '', '/account')
    render(<App />)
    expect(await screen.findByText(/with the fleet admin role since 12 Oct/)).toBeTruthy()
    const links = screen.getAllByRole('link', { name: 'Change in HQ ↗' })
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link.getAttribute('href')).toBe('https://hq.acme.example/settings')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    }
  })

  it('goes without the date and the links when HQ has not said', async () => {
    fakeServer({ ...SIGNED_IN, 'GET /session': { status: 200, body: { user: SAM, account: null, hq: null } } })
    window.history.replaceState(null, '', '/account')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Your account' })).toBeTruthy()
    expect(await screen.findByText(/An HQ account, with the fleet admin role\./)).toBeTruthy()
    expect(screen.queryByText(/since/)).toBeNull()
    expect(screen.queryByRole('link', { name: /Change in HQ/ })).toBeNull()
  })
})
