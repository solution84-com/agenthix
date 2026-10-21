import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetCsrfToken } from '../api/csrf'
import type { JoinView } from '../pages/add/joinWords'
import type { FleetHost } from '../pages/dashboard/types'
import { forgetStartedMoves } from '../forms/MoveChange'
import type { Move } from '../pages/site/move/moveWords'
import { SitePage } from '../pages/site/SitePage'
import { fakeServer, fleetRoute } from './fakeServer'
import { openAt, panelAddress } from './maintenanceHarness'

const FP = 'a'.repeat(64)
const TO = 'b'.repeat(64)
const host = (over: Partial<FleetHost> = {}): FleetHost => ({
  fingerprint: FP, fingerprintShort: 'aaaa', hostId: 'h', machineName: 'office-server', siteName: 'office', hqMachine: false,
  siteRegistered: true, connectedAt: new Date().toISOString(), online: true, since: null, leftByItself: false, leftAt: null,
  figures: null, figuresAt: null, agents: null, scheduled: [], move: null, ...over,
})
const move = (over: Partial<Move> = {}): Move => ({
  moveId: 'm1', from: FP, siteName: 'office', executionSiteId: 's1', joinId: 'j1', to: null, transferId: null, at: null,
  by: { userId: 'u1', name: 'Sam Rivera' }, confirmedBy: null, changeId: null, state: 'waitingForMachine',
  reports: { from: null, to: null }, problem: null, createdAt: new Date().toISOString(), ...over,
})
const join = (over: Partial<JoinView> = {}): JoinView => ({
  joinId: 'j1', state: 'waiting', expiresAt: new Date(Date.now() + 3600_000).toISOString(), machine: null, replaces: null, hqClaim: null,
  siteName: 'office', problem: null, ...over,
})
const SESSION = { status: 200, body: { user: { id: 'u1', name: 'Sam Rivera' }, hq: { organisationName: null, address: 'http://192.168.1.20:4100' } } }

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => { cleanup(); forgetStartedMoves(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

describe('Move site… @SC-912', () => {
  it('scheduled for a time: the code for the new machine, then its name and fingerprint to confirm', async () => {
    const requests = fakeServer({
      'GET /session': SESSION,
      'GET /fleet': fleetRoute([host()]),
      [`POST /hosts/${FP}/move`]: { status: 201, body: { ...move({ at: '2030-10-18T20:00:00.000Z' }), code: 'M7QD-3KXA-90PL', expiresAt: join().expiresAt } },
      'GET /moves/m1': { status: 200, body: { move: move({ at: '2030-10-18T20:00:00.000Z' }) } },
      'GET /joins/j1': { status: 200, body: join({ state: 'confirming', machine: { name: 'new-server', fingerprint: TO, fingerprintShort: '1C2D 3E4F' } }) },
      'POST /joins/j1/confirm': { status: 200, body: join({ state: 'done' }) },
    })
    openAt(`/sites/${FP}${panelAddress(FP, 'move')}`, 5)
    expect(await screen.findByRole('form', { name: 'Move the site' })).toBeTruthy()
    fireEvent.click(screen.getByLabelText('At a time…'))
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2030-10-18T22:00' } })
    const notify = screen.getByRole('checkbox', { name: 'Notify the fleet admins if this machine stops answering' }) as HTMLInputElement
    expect(notify.checked).toBe(true)
    fireEvent.click(notify)
    fireEvent.click(screen.getByRole('button', { name: /^Schedule/ }))
    const check = await screen.findByRole('region', { name: 'The machine that used the code' })
    expect(within(check).getByText('1C2D 3E4F')).toBeTruthy()
    fireEvent.click(within(check).getByRole('button', { name: 'Confirm new-server' }))
    await waitFor(() => expect(requests.some(r => r.path === '/joins/j1/confirm')).toBe(true))
    const sent = requests.find(r => r.method === 'POST' && r.path === `/hosts/${FP}/move`)!
    expect(sent.body).toEqual({ at: new Date('2030-10-18T22:00').toISOString(), notify: false })
  })

  it('started from Plan maintenance, is followed on its own page, with the code until a machine uses it', async () => {
    fakeServer({
      'GET /session': SESSION,
      'GET /fleet': fleetRoute([host()]),
      [`POST /hosts/${FP}/move`]: { status: 201, body: { ...move(), code: 'M7QD-3KXA-90PL', expiresAt: join().expiresAt } },
      'GET /moves/m1': { status: 200, body: { move: move() } },
      'GET /joins/j1': { status: 200, body: join() },
    })
    openAt(`/sites/${FP}${panelAddress(FP, 'move')}`, 5)
    fireEvent.click(await screen.findByRole('button', { name: 'Do it now' }))
    expect((await screen.findByLabelText('One-time code')).textContent).toBe('M7QD-3KXA-90PL')
    expect(window.location.pathname + window.location.search).toBe(`/sites/${FP}/move`)
    expect(screen.queryByRole('dialog', { name: 'Plan maintenance' })).toBeNull()
    expect(await screen.findByText('$ agenthix console connect http://192.168.1.20:4100 M7QD-3KXA-90PL')).toBeTruthy()
  })

  it('a time that is not given is not sent', async () => {
    const requests = fakeServer({ 'GET /fleet': fleetRoute([host()]) })
    openAt(`/sites/${FP}${panelAddress(FP, 'move')}`)
    fireEvent.click(await screen.findByLabelText('At a time…'))
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^Schedule/ }))
    expect(await screen.findByText('Choose the date and time.')).toBeTruthy()
    expect(requests.some(r => r.method === 'POST')).toBe(false)
  })

  it('under way: its steps from what the machines said, ending only on what the Fleet Console says', async () => {
    let finished = false
    const running = move({ to: TO, state: 'running', confirmedBy: { userId: 'u1', name: 'Sam Rivera' }, reports: { from: 'transferring', to: 'restoring' } })
    fakeServer({
      'GET /fleet': fleetRoute([host({ move: { moveId: 'm1', role: 'sending', siteName: 'office', state: 'running', at: null } })]),
      [`GET /hosts/${TO}`]: { status: 200, body: { host: host({ fingerprint: TO, machineName: 'new-server' }) } },
      'GET /moves/m1': () => ({ status: 200, body: { move: !finished ? running : { ...running, state: 'done', reports: { from: 'removed', to: 'tookOver' } } } }),
    })
    openAt(`/sites/${FP}/move`, 5)
    expect(await screen.findByText('Restored on new-server')).toBeTruthy()
    expect(screen.queryByText('Moved.')).toBeNull()
    finished = true
    expect(await screen.findByText('Moved.')).toBeTruthy()
    expect(await screen.findByText('office now runs on new-server, and is named new-server. office-server has left the fleet.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancel the move' })).toBeNull()
  })

  it('a finished move’s notice opens its outcome, not Plan maintenance', async () => {
    const done = move({ moveId: 'm9', to: TO, state: 'done', reports: { from: 'removed', to: 'tookOver' } })
    fakeServer({
      'GET /fleet': fleetRoute([host({ fingerprint: TO, machineName: 'new-server', siteName: 'new-server' })]),
      [`GET /hosts/${TO}`]: { status: 200, body: { host: host({ fingerprint: TO, machineName: 'new-server' }) } },
      'GET /moves/m9': { status: 200, body: { move: done } },
    })
    openAt(`/sites/${TO}/move?move=m9`, 5)
    expect(await screen.findByText('Moved.')).toBeTruthy()
    // Named after the new machine once its own record arrives, which may come after the move's.
    expect(await screen.findByText('office now runs on new-server, and is named new-server. office has left the fleet.')).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Plan maintenance' })).toBeNull()
    expect(window.location.pathname + window.location.search).toBe(`/sites/${TO}/move?move=m9`)
  })

  it('a move no longer held: the site’s page instead', async () => {
    fakeServer({
      'GET /fleet': fleetRoute([host()]),
      'GET /moves/m9': { status: 404, body: { error: 'not_found', message: 'No such move.' } },
    })
    openAt(`/sites/${FP}/move?move=m9`, 5)
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe(`/sites/${FP}`))
  })

  it('scheduled: can be cancelled', async () => {
    const scheduled = move({ to: TO, state: 'scheduled', at: '2030-10-18T20:00:00.000Z', confirmedBy: { userId: 'u1', name: 'Sam Rivera' } })
    const requests = fakeServer({
      'GET /fleet': fleetRoute([host({ move: { moveId: 'm1', role: 'sending', siteName: 'office', state: 'scheduled', at: scheduled.at } })]),
      [`GET /hosts/${TO}`]: { status: 200, body: { host: host({ fingerprint: TO, machineName: 'new-server' }) } },
      'GET /moves/m1': { status: 200, body: { move: scheduled } },
      'DELETE /moves/m1': { status: 200, body: { move: { ...scheduled, state: 'cancelled' } } },
    })
    openAt(`/sites/${FP}/move`, 60_000)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel the move' }))
    expect(await screen.findByText('Cancelled.')).toBeTruthy()
    expect(requests.some(r => r.method === 'DELETE' && r.path === '/moves/m1')).toBe(true)
  })
})

describe('Disconnect… @SC-914', () => {
  it('asks first, says what stays, and needs the machine\'s name typed', async () => {
    const requests = fakeServer({
      [`GET /hosts/${FP}`]: { status: 200, body: { host: host() } },
      [`POST /hosts/${FP}/disconnect`]: { status: 200, body: { disconnected: true } },
    })
    render(<SitePage fingerprint={FP} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect…' }))
    expect(screen.getByRole('heading', { name: 'Disconnect office-server?' })).toBeTruthy()
    expect(screen.getByText(/Nothing on the machine is removed/)).toBeTruthy()
    expect(screen.getByText(/stops taking part in HQ/)).toBeTruthy()
    const go = screen.getByRole('button', { name: 'Disconnect office-server' }) as HTMLButtonElement
    expect(go.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText("Type the machine's name to confirm"), { target: { value: 'office-server' } })
    expect(go.disabled).toBe(false)
    fireEvent.click(go)
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(requests.some(r => r.method === 'POST' && r.path === `/hosts/${FP}/disconnect`)).toBe(true)
  })

  it('cancel sends nothing', async () => {
    const requests = fakeServer({ [`GET /hosts/${FP}`]: { status: 200, body: { host: host() } } })
    render(<SitePage fingerprint={FP} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('heading', { name: 'Disconnect office-server?' })).toBeNull()
    expect(requests.some(r => r.method === 'POST')).toBe(false)
  })

  it('a machine that left by itself is removed from the list', async () => {
    fakeServer({ [`GET /hosts/${FP}`]: { status: 200, body: { host: host({ leftByItself: true, leftAt: new Date().toISOString() }) } } })
    render(<SitePage fingerprint={FP} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Remove from the list…' }))
    expect(screen.getByRole('heading', { name: 'Remove office-server from the list?' })).toBeTruthy()
  })
})
