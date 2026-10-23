import { act, cleanup, render, screen, within } from '@testing-library/react'
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

describe("the organisation's connection to Agenthix Cloud, on HQ's page @SC-1076", () => {
  it('offers neither Connect nor Disconnect, and says it is done in HQ under Manage › Providers', async () => {
    const requests = fakeServer(signedIn(() => view()))
    openHq()
    expect(await within(await screen.findByRole('region', { name: 'Agenthix Cloud connection' })).findByText(/done in HQ by an organisation admin, under Manage › Providers/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Connect to Agenthix Cloud/ })).toBeNull()
    expect(requests.some(r => r.path === '/cloud/organisation')).toBe(false)
  })

  it('while a connection waits on approval in HQ, reads it again and then shows Connected as the organisation, with no Disconnect', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let state = view({ connecting: CONNECTING })
    fakeServer(signedIn(() => state))
    openHq()
    expect(await within(await screen.findByRole('region', { name: 'Agenthix Cloud connection' })).findByText('Waiting for approval in HQ')).toBeTruthy()
    expect(screen.queryByLabelText('Code to check')).toBeNull()
    state = view({ organisation: CONNECTED })
    await act(async () => { await vi.advanceTimersByTimeAsync(CONNECTING_POLL_MS + 100) })
    expect(await within(section()).findByText(/^Connected as Acme Robotics/)).toBeTruthy()
    expect(within(section()).queryByRole('button', { name: 'Disconnect…' })).toBeNull()
  })

  it('a refusal on Cloud, or a code that expired, is said', async () => {
    fakeServer(signedIn(() => view({ lastAttempt: 'refused' })))
    openHq()
    expect(await screen.findByText('Not approved')).toBeTruthy()
    cleanup()
    fakeServer(signedIn(() => view({ lastAttempt: 'expired' })))
    openHq()
    expect(await screen.findByText('The code expired')).toBeTruthy()
  })

  it('a connected HQ whose calls Cloud refuses for the protocol says why beside Connected, and says nothing otherwise @SC-1169', async () => {
    const problem = 'Agenthix Cloud speaks protocol 3.0 and this HQ speaks 1.0, too far apart to work together: upgrade this HQ.'
    fakeServer(signedIn(() => view({ organisation: CONNECTED, problem })))
    openHq()
    expect(await screen.findByText(problem)).toBeTruthy()
    expect(within(section()).getByText(/^Connected as Acme Robotics/)).toBeTruthy()
    cleanup()
    fakeServer(signedIn(() => view({ organisation: CONNECTED, problem: null })))
    openHq()
    await screen.findByText(/^Connected as Acme Robotics/)
    expect(screen.queryByText(/too far apart/)).toBeNull()
  })
})
