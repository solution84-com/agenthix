import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudView } from '@agenthix/core'
import { App } from '../App'
import { forgetCsrfToken } from '../api/csrf'
import { CONNECTING_POLL_MS } from '../cloud/CloudConnectionSection'
import { SAMPLE_HOSTS } from '../dev/fleetSamples'
import { fakeServer, SAM, STATUS_OK, type Route } from './fakeServer'

const ORG = { organisationName: 'Acme Robotics', address: 'https://hq.acme.example' }
const HQ_HOST = SAMPLE_HOSTS[0]
const CONNECTING = {
  userCode: 'WDJB-MJHT', verificationUri: 'https://cloud.agenthix.com/connect',
  verificationUriComplete: 'https://cloud.agenthix.com/connect?user_code=WDJB-MJHT', expiresAt: '2026-01-01T00:15:00.000Z',
}
const CONNECTED = { cloudOrganisationId: 'org_42', name: 'Acme Robotics', connectedAt: '2026-01-01T00:01:00.000Z' }

const view = (over: Partial<CloudView> = {}): CloudView =>
  ({ organisation: null, account: null, place: 'onTheMachine', connecting: null, lastAttempt: null, cloudUrl: null, runByCloud: false, ...over })

const signedIn = (cloud: () => CloudView, extra: Record<string, Route | (() => Route)> = {}): Record<string, Route | (() => Route)> => ({
  'GET /status': { status: 200, body: STATUS_OK },
  'GET /session': { status: 200, body: { user: SAM, account: { username: 'sam', organisationAdmin: true, since: null }, hq: ORG } },
  'GET /fleet': { status: 200, body: { console: { machineName: 'hq-box', version: '0.2.0', fingerprintShort: 'x', hq: 'connected' }, hq: ORG, hosts: [HQ_HOST], disconnected: [] } },
  [`GET /hosts/${HQ_HOST.fingerprint}`]: { status: 200, body: { host: HQ_HOST } },
  'GET /cloud': () => ({ status: 200, body: cloud() }),
  'GET /remote-access': { status: 200, body: { state: { on: false }, organisationConnected: false, place: 'onTheMachine' } },
  'GET /authenticator': { status: 200, body: { code: null, place: 'onTheMachine' } },
  'GET /fleet-admins': { status: 200, body: { admins: [] } },
  ...extra,
})

function openHq() {
  window.history.replaceState(null, '', '/hq')
  sessionStorage.setItem('csrfToken', 'tok')
  render(<App />)
}

const section = () => screen.getByRole('region', { name: 'Agenthix Cloud connection' })

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  forgetCsrfToken()
  sessionStorage.clear()
})

describe("connecting the organisation to Agenthix Cloud, on HQ's page @SC-1076", () => {
  it('Connect shows the code to check and the page to approve on, waits, and shows Connected as the organisation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let state = view()
    const requests = fakeServer(signedIn(() => state, {
      'POST /cloud/organisation': () => {
        state = view({ connecting: CONNECTING })
        return { status: 200, body: { connecting: CONNECTING } }
      },
    }))
    openHq()
    fireEvent.click(await screen.findByRole('button', { name: 'Connect to Agenthix Cloud ↗' }))
    expect(await screen.findByLabelText('Code to check')).toBeTruthy()
    expect(within(section()).getByText('WDJB-MJHT')).toBeTruthy()
    const approve = within(section()).getByRole('link', { name: 'Approve on Agenthix Cloud ↗' })
    expect(approve.getAttribute('href')).toBe(CONNECTING.verificationUriComplete)
    expect(approve.getAttribute('rel')).toBe('noopener noreferrer')
    expect(within(section()).getByText('Waiting for approval…')).toBeTruthy()

    state = view({ organisation: CONNECTED })
    await act(async () => { await vi.advanceTimersByTimeAsync(CONNECTING_POLL_MS + 100) })
    expect(await within(section()).findByText(/^Connected as Acme Robotics/)).toBeTruthy()
    expect(within(section()).getByRole('button', { name: 'Disconnect…' })).toBeTruthy()
    expect(requests.filter(r => r.method === 'POST' && r.path === '/cloud/organisation')).toHaveLength(1)
  })

  it('Cancel drops a connection still waiting', async () => {
    let state = view({ connecting: CONNECTING })
    const requests = fakeServer(signedIn(() => state, {
      'DELETE /cloud/organisation': () => { state = view(); return { status: 200, body: { disconnected: true } } },
    }))
    openHq()
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('button', { name: 'Connect to Agenthix Cloud ↗' })).toBeTruthy()
    expect(requests.some(r => r.method === 'DELETE' && r.path === '/cloud/organisation')).toBe(true)
  })

  it('Disconnect asks first, then ends the connection', async () => {
    let state = view({ organisation: CONNECTED })
    const requests = fakeServer(signedIn(() => state, {
      'DELETE /cloud/organisation': () => { state = view(); return { status: 200, body: { disconnected: true } } },
    }))
    openHq()
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect…' }))
    expect(requests.some(r => r.method === 'DELETE')).toBe(false)
    expect(await screen.findByText('Disconnect Acme Robotics from Agenthix Cloud?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    expect(await within(section()).findByText('Not connected')).toBeTruthy()
    expect(requests.filter(r => r.method === 'DELETE' && r.path === '/cloud/organisation')).toHaveLength(1)
  })

  it('a refusal on Cloud, or a code that expired, is said, and Connect is offered again', async () => {
    fakeServer(signedIn(() => view({ lastAttempt: 'refused' })))
    openHq()
    expect(await screen.findByText('Not approved')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Connect to Agenthix Cloud ↗' })).toBeTruthy()
    cleanup()
    fakeServer(signedIn(() => view({ lastAttempt: 'expired' })))
    openHq()
    expect(await screen.findByText('The code expired')).toBeTruthy()
  })

  it('a connected HQ whose calls Cloud refuses for the protocol says why beside Connected, and says nothing otherwise @SC-1169', async () => {
    const problem = 'Agenthix Cloud speaks protocol 3.0 and this HQ speaks 1.0, too far apart to work together: upgrade this HQ.'
    const connected = { cloudOrganisationId: 'org_42', name: 'Acme Robotics', connectedAt: '2026-01-01T00:01:00.000Z' }
    fakeServer(signedIn(() => view({ organisation: connected, problem })))
    openHq()
    expect(await screen.findByText(problem)).toBeTruthy()
    expect(within(section()).getByText(/^Connected as Acme Robotics/)).toBeTruthy()
    cleanup()
    fakeServer(signedIn(() => view({ organisation: connected, problem: null })))
    openHq()
    await screen.findByText(/^Connected as Acme Robotics/)
    expect(screen.queryByText(/too far apart/)).toBeNull()
  })

  it("HQ's refusal is said in its words", async () => {
    fakeServer(signedIn(() => view(), {
      'POST /cloud/organisation': { status: 403, body: { error: 'not_allowed', message: 'Only an organisation admin who is also a fleet admin connects HQ to Agenthix Cloud or disconnects it.' } },
    }))
    openHq()
    fireEvent.click(await screen.findByRole('button', { name: 'Connect to Agenthix Cloud ↗' }))
    expect(await screen.findByText(/Only an organisation admin who is also a fleet admin/)).toBeTruthy()
  })

  it('Cloud busy is said as not yet, with when to try again, and Connect stays', async () => {
    fakeServer(signedIn(() => view(), {
      'POST /cloud/organisation': { status: 429, body: { error: 'rate_limited', message: 'Agenthix Cloud is busy — try again in 3 minutes.' } },
    }))
    openHq()
    fireEvent.click(await screen.findByRole('button', { name: 'Connect to Agenthix Cloud ↗' }))
    expect(await screen.findByText('Agenthix Cloud is busy — try again in 3 minutes.')).toBeTruthy()
    expect(within(section()).getByText('Not yet')).toBeTruthy()
    expect(within(section()).queryByText('Not done')).toBeNull()
    expect(within(section()).getByRole('button', { name: 'Connect to Agenthix Cloud ↗' })).toBeTruthy()
  })

  it('through remote access, the code is shown but there is no link to approve, and nothing to cancel', async () => {
    fakeServer(signedIn(() => view({ connecting: CONNECTING, place: 'throughRemoteAccess' })))
    openHq()
    expect(await screen.findByLabelText('Code to check')).toBeTruthy()
    expect(within(section()).queryByRole('link', { name: /Approve/ })).toBeNull()
    expect(within(section()).queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(within(section()).getByText(/this section is read-only/)).toBeTruthy()
  })
})
