import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostFigures, HqRelay } from '@agenthix/core'
import { forgetCsrfToken } from '../api/csrf'
import { forgetHqSuspended } from '../forms/hqSuspend'
import { needsYou } from '../pages/dashboard/dashboardWords'
import type { FleetHost, FleetResponse } from '../pages/dashboard/types'
import { HqRoute } from '../pages/hq/HqRoute'
import { trafficOf } from '../pages/hq/relayWords'
import { fakeServer } from './fakeServer'

// HQ's relay on HQ's page, and a relay that is not answering on the Dashboard's Needs you (board R1).

const GB = 1000 ** 3
const NOW = new Date()
const FP = 'c'.repeat(64)
const ADDRESS = 'https://hq.acme.example'

const figures = (): HostFigures => ({
  takenAt: NOW.toISOString(),
  machine: { name: 'hq-box', system: 'Ubuntu 24.04', dockerVersion: '27.3', hostServiceVersion: '0.2.0', upSince: NOW.toISOString() },
  resources: { cpuLoad: 0.2, memory: { usedBytes: 9 * GB, totalBytes: 16 * GB }, disk: { freeBytes: 120 * GB, totalBytes: 200 * GB } },
  ceilings: { memoryBytesPerContainer: 4 * GB, cpusPerContainer: 2, processesPerContainer: 512, containersAtOnce: 6 },
  protections: { holding: true, rules: ['machine-ports'], checkedAt: NOW.toISOString(), problem: null },
  installs: [{ target: 'hq', version: '0.2.0', state: 'running', since: NOW.toISOString(), healthy: true, problem: null }],
  backups: { lastNightlyAt: NOW.toISOString(), lastNightlyOk: true, locationSet: true, lastCopyAt: null, lastExportAt: null, nightlyAt: '02:00' },
  frontDoor: { on: false, certificateExpiresAt: null, renewalProblem: null },
  scheduledChanges: 0,
})
const host: FleetHost = {
  fingerprint: FP, fingerprintShort: 'cccc', hostId: 'h', machineName: 'hq-box', siteName: 'hq-box', hqMachine: true, siteRegistered: false,
  connectedAt: NOW.toISOString(), online: true, since: NOW.toISOString(), leftByItself: false, leftAt: null,
  figures: figures(), figuresAt: NOW.toISOString(), agents: null, scheduled: [], move: null,
}
const RELAY: HqRelay = {
  name: 'hq-box', filesAddress: 'https://files.acme.example', answering: true, lastSeenAt: NOW.toISOString(),
  sites: 2, openStreams: 3, bytesCarried: 38_000_000,
}
const fleet = (hqRelay: HqRelay | null | undefined, link: FleetResponse['console']['hq'] = 'connected'): FleetResponse => ({
  console: { machineName: 'hq-box', version: '0.2.0', fingerprintShort: 'cccc', hq: link },
  hq: { organisationName: 'Acme Robotics', address: ADDRESS }, ...(hqRelay === undefined ? {} : { hqRelay }), hosts: [host], disconnected: [],
})
const serve = (f: FleetResponse) => fakeServer({
  'GET /session': { status: 200, body: { user: { id: 'u1', name: 'Sam Rivera' }, hq: f.hq } },
  'GET /status': { status: 200, body: { machineName: 'hq-box', version: '0.2.0', hq: 'connected', fleetAdmins: 'some' } },
  [`GET /hosts/${FP}`]: { status: 200, body: { host } },
  'GET /fleet': { status: 200, body: f },
})
const card = async () => screen.findByRole('region', { name: "HQ's relay" })

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => { cleanup(); forgetHqSuspended(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

describe("HQ's relay card @SC-1592", () => {
  it('shows the address, the sites it serves, its traffic and its open streams', async () => {
    serve(fleet(RELAY))
    render(<HqRoute part={null} />)
    const c = within(await card())
    expect(c.getByText('https://files.acme.example')).toBeTruthy()
    expect(c.getByText('2 sites')).toBeTruthy()
    expect(c.getByText('38 MB since it started')).toBeTruthy()
    expect(c.getByText('3 open now')).toBeTruthy()
    expect(c.getByText('Running')).toBeTruthy()
    expect(c.queryByText(/PDF preview is off/)).toBeNull()
  })

  it('says it answers on HQ’s own address with no files address, and links to the guide', async () => {
    serve(fleet({ ...RELAY, filesAddress: null }))
    render(<HqRoute part={null} />)
    const c = within(await card())
    expect(c.getByText(/Answering on hq's own address: PDF preview is off\./)).toBeTruthy()
    expect(c.getByRole('link', { name: /Set a files address/ }).getAttribute('href')).toBe('/help?topic=domain-and-https')
  })

  it('says what is not reported yet, and warns when the relay is not answering', async () => {
    serve(fleet({ ...RELAY, answering: false, sites: null, openStreams: null, bytesCarried: null }))
    render(<HqRoute part={null} />)
    const c = within(await card())
    expect(c.getAllByText('Not reported yet')).toHaveLength(3)
    expect(c.getByText('Not answering')).toBeTruthy()
    expect(c.getByText(/Files in HQ can't be opened until it answers/)).toBeTruthy()
  })

  it('is left out when HQ has no relay, has not said, or is an older HQ', async () => {
    for (const f of [fleet(null), fleet(undefined)]) {
      cleanup()
      serve(f)
      render(<HqRoute part={null} />)
      await screen.findByRole('region', { name: 'How people reach it' })
      expect(screen.queryByRole('region', { name: "HQ's relay" })).toBeNull()
    }
  })

  it('writes traffic as people read it', () => {
    expect([trafficOf(0), trafficOf(400_000), trafficOf(38_400_000), trafficOf(1_240_000_000)]).toEqual(['none', 'under 1 MB', '38 MB', '1.2 GB'])
  })
})

describe('a relay not answering, on Needs you @SC-1593', () => {
  const keys = (f: FleetResponse) => needsYou(f, NOW).map(i => i.key)

  it('is listed with the words people see, and opens HQ', () => {
    const items = needsYou(fleet({ ...RELAY, answering: false }), NOW).filter(i => i.key === 'hq-relay')
    expect(items).toEqual([expect.objectContaining({ title: "HQ's relay isn't answering", to: '/hq', action: 'Open HQ' })])
    expect(items[0].text).toMatch(/Files in HQ can't be opened/)
  })

  it('is not listed while it answers, when HQ has none, or when HQ itself is not answering', () => {
    expect(keys(fleet(RELAY))).not.toContain('hq-relay')
    expect(keys(fleet(null))).not.toContain('hq-relay')
    expect(keys(fleet(undefined))).not.toContain('hq-relay')
    expect(keys(fleet({ ...RELAY, answering: false }, 'disconnected'))).not.toContain('hq-relay')
  })
})
