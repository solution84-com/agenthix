import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { quietReadPolicy } from '../api/quietRead'
import { forgetCsrfToken } from '../api/csrf'
import { AddSitePage } from '../pages/add/AddSitePage'
import type { FleetHost } from '../pages/dashboard/types'
import { AddressPage } from '../pages/hq/AddressPage'
import { fakeServer, fleetRoute, type Route } from './fakeServer'
import { fleetHost, openAt, panelAddress } from './maintenanceHarness'

const FP = 'c'.repeat(64)
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
const SESSION: Route = { status: 200, body: { user: { id: 'u1', name: 'Sam Rivera' }, hq: { organisationName: 'Acme', address: 'https://hq.acme.example' } } }
const FAILING: Route = { status: 500, body: { error: 'failed', message: 'It broke.' } }
const hqHost = (): FleetHost => fleetHost(FP, 'hq-box', { hqMachine: true })

beforeEach(() => {
  sessionStorage.setItem('csrfToken', 'tok')
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear(); quietReadPolicy.retries = 0; window.history.replaceState(null, '', '/') })

describe('a polled page that holds its content says "Not up to date" in its meta line @SC-1946', () => {
  it('Address and front door', async () => {
    let up = true
    fakeServer({ 'GET /session': SESSION, [`GET /hosts/${FP}`]: () => (up ? { status: 200, body: { host: hqHost() } } : FAILING) })
    render(<AddressPage fingerprint={FP} />)
    await advance(100)
    expect(screen.getByText('https://hq.acme.example')).toBeTruthy()
    up = false
    await advance(16_000)
    expect(screen.queryByText(/Not up to date/)).toBeNull()
    await advance(60_000)
    expect(screen.getByText('https://hq.acme.example')).toBeTruthy()
    expect(screen.getByText(/Not up to date/)).toBeTruthy()
  })

  it('Plan maintenance', async () => {
    let up = true
    fakeServer({ 'GET /fleet': () => (up ? fleetRoute([hqHost()]) : FAILING) })
    openAt(`/maintenance${panelAddress()}`)
    await advance(100)
    expect(screen.getByRole('button', { name: 'Which: Choose HQ or a site' })).toBeTruthy()
    up = false
    await advance(80_000)
    expect(screen.getByRole('button', { name: 'Which: Choose HQ or a site' })).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Plan maintenance' }).textContent).toMatch(/Not up to date/)
  })
})

describe('Add a site: Cancel that fails', () => {
  it('is the dialog with Try again, and the page stays', async () => {
    vi.useRealTimers()
    let deletes = 0
    fakeServer({
      'GET /session': SESSION,
      'POST /joins': { status: 201, body: { joinId: 'j1', code: 'K7QM-4XPD-93TB', expiresAt: new Date(Date.now() + 3_600_000).toISOString() } },
      'GET /joins/j1': { status: 200, body: { joinId: 'j1', state: 'waiting', expiresAt: new Date(Date.now() + 3_600_000).toISOString(), machine: null, replaces: null, hqClaim: null, siteName: null, problem: null } },
      'DELETE /joins/j1': () => (++deletes === 1 ? FAILING : { status: 204 }),
    })
    render(<AddSitePage pollMs={5} />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByLabelText('One-time code')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect((await screen.findByTestId('attention-text')).textContent).toContain('could not be cancelled')
    expect(window.location.pathname).toBe('/')
    expect(screen.getByLabelText('One-time code')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(deletes).toBe(2))
  })
})
