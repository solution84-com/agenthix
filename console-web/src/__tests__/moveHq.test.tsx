import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetCsrfToken } from '../api/csrf'
import type { JoinView } from '../pages/add/joinWords'
import type { FleetHost, FleetResponse } from '../pages/dashboard/types'
import { forgetStartedMoves } from '../forms/MoveChange'
import type { Move } from '../pages/site/move/moveWords'
import { fakeServer, type Route } from './fakeServer'
import { openAt, panelAddress } from './maintenanceHarness'

const FP = 'c'.repeat(64)
const TO = 'd'.repeat(64)
const host = (name: string, over: Partial<FleetHost> = {}): FleetHost => ({
  fingerprint: name, fingerprintShort: name, hostId: name, machineName: name, siteName: name, hqMachine: false, siteRegistered: true,
  connectedAt: new Date().toISOString(), online: true, since: null, leftByItself: false, leftAt: null, figures: null, figuresAt: null,
  agents: null, scheduled: [], move: null, ...over,
})
const hqBox = (over: Partial<FleetHost> = {}) => host('hq-box', { fingerprint: FP, hqMachine: true, ...over })
const fleet = (address: string, hqOver: Partial<FleetHost> = {}): FleetResponse => ({
  console: { machineName: 'hq-box', version: '0.2.0', fingerprintShort: 'mm', hq: 'connected' },
  hq: { organisationName: 'Acme Robotics', address },
  hosts: [hqBox(hqOver), host('office-server'), host('laptop', { online: false, since: new Date().toISOString() })],
  disconnected: [],
})
const move = (over: Partial<Move> = {}): Move => ({
  moveId: 'm1', kind: 'hq', hqAddress: 'http://192.168.1.30:4100', from: FP, siteName: 'hq-box', executionSiteId: null, joinId: 'j1', to: null,
  transferId: null, at: null, by: { userId: 'u1', name: 'Sam Rivera' }, confirmedBy: null, changeId: null, state: 'waitingForMachine',
  reports: { from: null, to: null }, problem: null, createdAt: new Date().toISOString(), ...over,
})
const join = (over: Partial<JoinView> = {}): JoinView => ({
  joinId: 'j1', state: 'waiting', expiresAt: new Date(Date.now() + 3600_000).toISOString(), machine: null, replaces: null, hqClaim: null,
  siteName: 'hq-box', problem: null, ...over,
})
const BARE = 'http://192.168.1.20:4100'
const base = (address: string, hqOver: Partial<FleetHost> = {}): Record<string, Route> => ({
  'GET /session': { status: 200, body: { user: { id: 'u1', name: 'Sam Rivera' }, hq: { organisationName: null, address } } },
  [`GET /hosts/${FP}`]: { status: 200, body: { host: hqBox(hqOver) } },
  'GET /fleet': { status: 200, body: fleet(address, hqOver) },
})

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => { cleanup(); forgetStartedMoves(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

describe('Move HQ… @SC-913', () => {
  it("to a new machine and a new address: what follows HQ, then the new machine's code", async () => {
    const requests = fakeServer({
      ...base(BARE),
      'POST /hq/move': { status: 201, body: { ...move({ at: '2030-10-18T20:00:00.000Z' }), code: 'H4XT-7PQM-2WRD', expiresAt: join().expiresAt } },
      'GET /moves/m1': { status: 200, body: { move: move({ at: '2030-10-18T20:00:00.000Z' }) } },
      'GET /joins/j1': { status: 200, body: join() },
    })
    openAt(`/hq${panelAddress(FP, 'move')}`, 5)
    expect(await screen.findByRole('dialog', { name: 'Plan maintenance' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Which: HQ' })).toBeTruthy()
    expect(screen.getByRole('form', { name: 'Move HQ' })).toBeTruthy()
    expect(screen.getByText(/HQ has no domain of its own/)).toBeTruthy()
    const follows = screen.getByRole('region', { name: 'What follows HQ' })
    expect(within(follows).getByText('hq-box · HQ and its site')).toBeTruthy()
    expect(within(follows).getByText('Will need pointing')).toBeTruthy()
    expect(within(follows).getByText(/It runs on hq-box, so it is restored with HQ/)).toBeTruthy()

    fireEvent.click(screen.getByLabelText('At a time…'))
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2030-10-18T22:00' } })
    fireEvent.click(screen.getByRole('button', { name: /^Schedule/ }))
    expect(await screen.findByText(/Give the address as a scheme and a host/)).toBeTruthy()
    expect(requests.some(r => r.path === '/hq/move')).toBe(false)

    fireEvent.change(screen.getByLabelText('New address'), { target: { value: 'http://192.168.1.30:4100' } })
    fireEvent.click(screen.getByRole('button', { name: /^Schedule/ }))
    expect(await screen.findByLabelText('One-time code')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Move HQ to a new machine' })).toBeTruthy()
    const sent = requests.find(r => r.method === 'POST' && r.path === '/hq/move')!
    expect(sent.body).toEqual({ at: new Date('2030-10-18T22:00').toISOString(), hqAddress: 'http://192.168.1.30:4100' })
  })

  it('an HQ with its own domain keeps it: no address is asked for or sent', async () => {
    const requests = fakeServer({
      ...base('https://hq.acme.example'),
      'POST /hq/move': { status: 201, body: { ...move({ hqAddress: null }), code: 'H4XT-7PQM-2WRD', expiresAt: join().expiresAt } },
      'GET /moves/m1': { status: 200, body: { move: move({ hqAddress: null }) } },
      'GET /joins/j1': { status: 200, body: join() },
    })
    openAt(`/hq${panelAddress(FP, 'move')}`, 5)
    expect(await screen.findByText(/HQ keeps its own domain/)).toBeTruthy()
    expect(screen.queryByLabelText('New address')).toBeNull()
    expect((screen.getByLabelText('Now') as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Do it now' }))
    await waitFor(() => expect(requests.some(r => r.path === '/hq/move')).toBe(true))
    expect(requests.find(r => r.path === '/hq/move')!.body).toEqual({})
  })

  it('a new address on the same machine is changed now, by the host service', async () => {
    const requests = fakeServer({
      ...base(BARE),
      [`POST /hosts/${FP}/commands`]: { status: 200, body: { command: { id: 'c1', state: 'done', result: { ok: true, op: 'address.set', result: { address: 'http://192.168.1.21:4100' } }, problem: null } } },
    })
    openAt(`/hq${panelAddress(FP, 'move')}`, 5)
    fireEvent.click(await screen.findByLabelText(/A new address on hq-box/))
    expect(screen.getByText(/cannot be scheduled/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('New address'), { target: { value: 'http://192.168.1.21:4100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Do it now' }))
    await waitFor(() => expect(requests.some(r => r.path === `/hosts/${FP}/commands`)).toBe(true))
    const sent = requests.find(r => r.path === `/hosts/${FP}/commands`)!
    expect(sent.body).toEqual({ request: { op: 'address.set', target: 'hq', address: 'http://192.168.1.21:4100' } })
  })

  it('a move under way opens on its steps; once done, the offline machines get their commands', async () => {
    const underWay = { moveId: 'm1', role: 'sending' as const, siteName: 'hq-box', state: 'running', at: null }
    fakeServer({
      ...base(BARE, { move: underWay }),
      'GET /moves/m1': { status: 200, body: { move: move({ state: 'done', to: TO }) } },
      [`GET /hosts/${TO}`]: { status: 200, body: { host: host('new-server', { fingerprint: TO }) } },
    })
    openAt('/hq/move', 5)
    expect(await screen.findByText('Moved.')).toBeTruthy()
    expect(await screen.findByText(/HQ now runs on new-server, and hq-box has left the fleet\. The Fleet Console came with it/)).toBeTruthy()
    expect(screen.getByText('laptop has not heard the new address.')).toBeTruthy()
    expect(screen.getByText(/agenthix console hq-address http:\/\/192\.168\.1\.30:4100/)).toBeTruthy()
  })
})
