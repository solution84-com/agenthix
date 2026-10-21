import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostFigures } from '@agenthix/core'
import { forgetCsrfToken } from '../api/csrf'
import { activityLine } from '../pages/activity/words'
import { DisconnectedCard } from '../pages/dashboard/DisconnectedCard'
import type { FleetHost, FleetResponse } from '../pages/dashboard/types'
import { forgetStartedMoves } from '../forms/MoveChange'
import type { Move } from '../pages/site/move/moveWords'
import { SitePage } from '../pages/site/SitePage'
import { fakeServer } from './fakeServer'
import { openAt, panelAddress } from './maintenanceHarness'

// Move site… can go to a machine already connected that runs no site — one a move that did not happen left behind —
// with no code; the screen offers only machines that are online, run no site and take part in no move.

const FP = 'a'.repeat(64)
const B = 'b'.repeat(64)
const NOW = new Date()
const empty = (installs: HostFigures['installs'] = []) => ({
  takenAt: NOW.toISOString(),
  machine: { name: 'm', system: 'Linux', dockerVersion: '27', hostServiceVersion: '0.2.0', upSince: NOW.toISOString() },
  resources: { cpuLoad: 0.1, memory: { usedBytes: 1, totalBytes: 2 }, disk: { freeBytes: 1, totalBytes: 2 } },
  ceilings: { memoryBytesPerContainer: 1, cpusPerContainer: 1, processesPerContainer: 1, containersAtOnce: 1 },
  protections: { holding: true, rules: [], checkedAt: NOW.toISOString(), problem: null },
  installs,
  backups: { lastNightlyAt: null, lastNightlyOk: null, locationSet: false, lastCopyAt: null, lastExportAt: null, nightlyAt: '02:00' },
  frontDoor: { on: false, certificateExpiresAt: null, renewalProblem: null },
  scheduledChanges: 0,
}) satisfies HostFigures
const host = (fingerprint: string, machineName: string, over: Partial<FleetHost> = {}): FleetHost => ({
  fingerprint, fingerprintShort: fingerprint.slice(0, 4), hostId: machineName, machineName, siteName: '', hqMachine: false,
  siteRegistered: false, connectedAt: NOW.toISOString(), online: true, since: NOW.toISOString(), leftByItself: false, leftAt: null,
  figures: empty(), figuresAt: NOW.toISOString(), agents: null, scheduled: [], move: null, ...over,
})
const office = host(FP, 'office-server', {
  siteName: 'office', siteRegistered: true, figures: empty([{ target: 'site', version: '0.2.0', state: 'running', since: NOW.toISOString(), healthy: true, problem: null }]),
})
const machineB = host(B, 'machine-b', { endedMove: { moveId: 'm0', siteName: 'office', state: 'failed' } })
const fleet: FleetResponse = {
  console: { machineName: 'hq-box', version: '0.2.0', fingerprintShort: 'cccc', hq: 'connected' }, hq: null, disconnected: [],
  hosts: [
    office, machineB,
    host('c'.repeat(64), 'asleep-box', { online: false }),
    host('d'.repeat(64), 'receiving-box', { move: { moveId: 'm9', role: 'receiving', siteName: 'lab', state: 'running', at: null } }),
    host('e'.repeat(64), 'lab-server', { siteName: 'lab', siteRegistered: true, figures: office.figures }),
  ],
}
const arranging: Move = {
  moveId: 'm1', from: FP, siteName: 'office', executionSiteId: 's1', joinId: null, to: B, transferId: null, at: null,
  by: { userId: 'u1', name: 'Sam Rivera' }, confirmedBy: { userId: 'u1', name: 'Sam Rivera' }, changeId: null, state: 'arranging',
  reports: { from: null, to: null }, problem: null, createdAt: NOW.toISOString(),
}

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => { cleanup(); forgetStartedMoves(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

describe('Move site… to a machine already connected @SC-912', () => {
  it('offers only connected machines with no site and no move, and sends the one chosen as `to`, with no code to show', async () => {
    const requests = fakeServer({
      [`GET /hosts/${FP}`]: { status: 200, body: { host: office } },
      'GET /fleet': { status: 200, body: fleet },
      [`POST /hosts/${FP}/move`]: { status: 201, body: arranging },
      'GET /moves/m1': { status: 200, body: { move: arranging } },
      [`GET /hosts/${B}`]: { status: 200, body: { host: machineB } },
    })
    openAt(`/sites/${FP}${panelAddress(FP, 'move')}`, 5)
    const b = await screen.findByRole('radio', { name: /^machine-b/ })
    expect(screen.getByRole('radio', { name: /^A new machine/ })).toBeTruthy()
    for (const name of [/^asleep-box/, /^receiving-box/, /^lab-server/, /^office-server/]) expect(screen.queryByRole('radio', { name })).toBeNull()
    fireEvent.click(b)
    fireEvent.click(screen.getByRole('radio', { name: /^Now/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Do it now' }))
    await waitFor(() => expect(requests.some(r => r.path === '/moves/m1')).toBe(true))
    expect(requests.find(r => r.method === 'POST' && r.path === `/hosts/${FP}/move`)!.body).toEqual({ to: B })
    expect(screen.queryByLabelText('One-time code')).toBeNull()
  })

  it('without such a machine, says only that the move gives a code', async () => {
    fakeServer({
      [`GET /hosts/${FP}`]: { status: 200, body: { host: office } },
      'GET /fleet': { status: 200, body: { ...fleet, hosts: [office] } },
    })
    openAt(`/sites/${FP}${panelAddress(FP, 'move')}`)
    expect(await screen.findByText(/gives a one-time code for the new machine's admin/)).toBeTruthy()
    expect(screen.queryByRole('radio', { name: /^A new machine/ })).toBeNull()
  })
})

describe('a machine with no site, elsewhere @SC-899', () => {
  it("its page says how to put a site there: disconnect it, then add it again", async () => {
    fakeServer({ [`GET /hosts/${B}`]: { status: 200, body: { host: machineB } } })
    render(<SitePage fingerprint={B} />)
    expect(await screen.findByText(/disconnect this machine, then add it again/)).toBeTruthy()
  })

  it('disconnected, its card goes by the machine name', () => {
    render(<DisconnectedCard machine={{ id: 'd1', fingerprint: B, machineName: 'machine-b', siteName: '', by: { userId: 'u1', name: 'Dana' }, at: NOW.toISOString() }} now={NOW} onRemoved={() => {}} />)
    expect(screen.getByRole('article', { name: 'machine-b' })).toBeTruthy()
    expect(screen.getByText('A machine with no site')).toBeTruthy()
    expect(screen.queryByText(/Its site no longer takes part/)).toBeNull()
  })

  it("the record says a move's new machine was confirmed, not that a site was added", () => {
    expect(activityLine('site.moveMachineJoined')).toBe('confirmed the machine a site moves to')
  })
})
