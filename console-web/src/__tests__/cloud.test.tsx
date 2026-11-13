import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudView, RemoteAccessView } from '@agenthix/core'
import { App } from '../App'
import { forgetCsrfToken } from '../api/csrf'
import { SAMPLE_HOSTS } from '../dev/fleetSamples'
import { fakeServer, SAM, STATUS_OK, type Request, type Route } from './fakeServer'

const ORG = { organisationName: 'Acme Robotics', address: 'https://hq.acme.example' }
const HQ_HOST = SAMPLE_HOSTS[0]
const NOT_CONNECTED: Route = { status: 409, body: { error: 'not_connected', message: 'This organisation is not connected to Agenthix Cloud.' } }

const cloudView = (over: Partial<CloudView> = {}): CloudView => ({
  organisation: null, account: null, place: 'onTheMachine', connecting: null, lastAttempt: null, cloudUrl: null, runByCloud: false, ...over,
})
const remoteView = (over: Partial<RemoteAccessView> = {}): RemoteAccessView => ({ state: { on: false }, organisationConnected: false, place: 'onTheMachine', ...over })
type Answer = Route | ((req: Request) => Route)

const signedIn = (extra: Record<string, Answer> = {}): Record<string, Answer> => ({
  'GET /status': { status: 200, body: STATUS_OK },
  'GET /session': { status: 200, body: { user: SAM, account: { username: 'sam', organisationAdmin: true, since: null }, hq: ORG } },
  'GET /fleet': { status: 200, body: { console: { machineName: 'hq-box', version: '0.2.0', fingerprintShort: 'x', hq: 'connected' }, hq: ORG, hosts: [HQ_HOST], disconnected: [] } },
  [`GET /hosts/${HQ_HOST.fingerprint}`]: { status: 200, body: { host: HQ_HOST } },
  'GET /cloud': { status: 200, body: cloudView() },
  'GET /remote-access': { status: 200, body: remoteView() },
  'GET /authenticator': { status: 200, body: { code: null, place: 'onTheMachine' } },
  'GET /fleet-admins': { status: 200, body: { admins: [] } },
  ...extra,
})

function openAt(path: string) {
  window.history.replaceState(null, '', path)
  sessionStorage.setItem('csrfToken', 'tok')
  render(<App />)
}

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  forgetCsrfToken()
  sessionStorage.clear()
})

describe('not connected to Cloud @SC-1077', () => {
  it('the dashboard says the organisation is not connected and where to connect it, and that remote access waits for it', async () => {
    fakeServer(signedIn())
    openAt('/fleet')
    const note = await screen.findByRole('link', { name: 'Acme Robotics is not connected to Agenthix Cloud' })
    expect(note.getAttribute('href')).toBe('/hq')
    expect(screen.getByText('An organisation admin connects it in HQ, under Manage › Providers.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Connect to Agenthix Cloud/ })).toBeNull()
    expect(screen.getByText('Needs Acme Robotics connected to Agenthix Cloud')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'HQ' })).getByText('Not connected')).toBeTruthy()
  })

  it('connected, with no Cloud sign-in: one line offering it, and signing in says plainly it is not connected', async () => {
    const requests = fakeServer(signedIn({
      'GET /cloud': { status: 200, body: cloudView({ organisation: { cloudOrganisationId: 'o1', name: 'Acme Robotics', connectedAt: '2026-10-01T00:00:00Z' } }) },
      'POST /cloud/account/sign-in': NOT_CONNECTED,
    }))
    openAt('/fleet')
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in to Cloud to see the sites Cloud runs for you ↗' }))
    expect(await screen.findByText('Not connected')).toBeTruthy()
    expect(requests.some(r => r.method === 'POST' && r.path === '/cloud/account/sign-in')).toBe(true)
    expect(within(screen.getByRole('region', { name: 'HQ' })).getByText('Connected as Acme Robotics')).toBeTruthy()
  })

  it('remote access cannot be turned on until the organisation is connected', async () => {
    fakeServer(signedIn())
    openAt('/remote-access')
    expect(await screen.findByText('Cannot be turned on yet')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Turn on remote access…' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('turning it on asks for how long, warns about Cloud\'s domain, and says plainly it is not connected', async () => {
    const requests = fakeServer(signedIn({ 'GET /remote-access': { status: 200, body: remoteView({ organisationConnected: true }) }, 'POST /remote-access': NOT_CONNECTED }))
    openAt('/remote-access')
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on remote access…' }))
    expect(screen.getByText(/could in principle obtain a certificate for it/)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: '30 minutes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Turn on for 30 minutes' }))
    expect(await screen.findByText('Not connected')).toBeTruthy()
    expect(requests.find(r => r.method === 'POST' && r.path === '/remote-access')?.body).toEqual({ forMinutes: 30 })
  })

  it('Turn off now reads the page again, which shows it Off: no message', async () => {
    const on = { on: true as const, turnedOnBy: { via: 'localScreen' as const, userId: 'sam' }, startedAt: new Date().toISOString(), endsAt: new Date(Date.now() + 78 * 60_000).toISOString(), address: 'https://hm.relay.example' }
    let off = false
    fakeServer(signedIn({
      'GET /remote-access': () => ({ status: 200, body: remoteView({ state: off ? { on: false } : on, organisationConnected: true }) }),
      'DELETE /remote-access': () => { off = true; return { status: 200, body: {} } },
    }))
    openAt('/remote-access')
    fireEvent.click(await screen.findByRole('button', { name: 'Turn off now' }))
    expect(await screen.findByText('Off — the usual state')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('through remote access, the page offers Turn off and never Turn on or Extend', async () => {
    const on = { on: true as const, turnedOnBy: { via: 'cli' as const }, startedAt: new Date().toISOString(), endsAt: new Date(Date.now() + 78 * 60_000).toISOString(), address: 'https://hm.relay.example' }
    fakeServer(signedIn({ 'GET /remote-access': { status: 200, body: remoteView({ state: on, organisationConnected: true, place: 'throughRemoteAccess' }) } }))
    openAt('/remote-access')
    expect(await screen.findByRole('button', { name: 'Turn off now' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Extend…' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Turn on remote access…' })).toBeNull()
    expect(screen.getByText(/remote access can be turned on or extended only there/)).toBeTruthy()
  })

  it("HQ's page only reads the connection and says it is made in HQ, on the machine or through remote access", async () => {
    fakeServer(signedIn())
    openAt('/hq')
    expect(await screen.findByText(/done in HQ by an organisation admin/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Connect to Agenthix Cloud/ })).toBeNull()
    cleanup()

    fakeServer(signedIn({ 'GET /cloud': { status: 200, body: cloudView({ place: 'throughRemoteAccess' }) } }))
    openAt('/hq')
    expect(await screen.findByText(/done in HQ by an organisation admin/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Connect to Agenthix Cloud/ })).toBeNull()
  })

  it('Your account offers setting up the code, on the machine only, and linking a Cloud account', async () => {
    fakeServer(signedIn())
    openAt('/account')
    expect(await screen.findByRole('button', { name: 'Set up…' })).toBeTruthy()
    // Nothing is offered before the organisation is connected.
    expect(screen.queryByRole('button', { name: 'Link a Cloud account ↗' })).toBeNull()
    cleanup()

    const connected = { cloudOrganisationId: 'org_42', name: 'Acme Robotics', connectedAt: '2026-01-01T00:01:00.000Z' }
    fakeServer(signedIn({ 'GET /cloud': { status: 200, body: cloudView({ organisation: connected }) } }))
    openAt('/account')
    expect(await screen.findByRole('button', { name: 'Link a Cloud account ↗' })).toBeTruthy()
    cleanup()

    fakeServer(signedIn({ 'GET /authenticator': { status: 200, body: { code: null, place: 'throughRemoteAccess' } } }))
    openAt('/account')
    expect(await screen.findByText(/Set up your authenticator code on the Fleet Console's machine/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Set up…' })).toBeNull()
  })

  it('setting up the code says plainly it is not connected', async () => {
    fakeServer(signedIn({ 'POST /authenticator': NOT_CONNECTED }))
    openAt('/account/code')
    fireEvent.click(await screen.findByRole('button', { name: 'Set up the code' }))
    expect(await screen.findByText('Not connected')).toBeTruthy()
  })

  it('a Cloud site before signing in to Cloud says why nothing is shown', async () => {
    fakeServer(signedIn())
    openAt('/fleet/cloud/hel-2')
    expect(await screen.findByText('Sign in to Cloud to see this site and its machine.')).toBeTruthy()
  })

  it('Fleet admins says Cloud\'s are listed once the organisation is connected', async () => {
    fakeServer(signedIn())
    openAt('/fleet-admins')
    expect(await screen.findByText(/its fleet admins on Cloud are listed here/)).toBeTruthy()
  })
})

describe('signing in through remote access, with it on @SC-1078', () => {
  const STATUS = { 'GET /status': { status: 200, body: STATUS_OK }, 'GET /sign-in/remote': { status: 200, body: { remote: true } } }

  it('asks for the code too, and sends it with the HQ login', async () => {
    const requests = fakeServer({ ...STATUS, 'POST /session': NOT_CONNECTED })
    render(<App />)
    const code = await screen.findByLabelText('Six-digit code from your authenticator app')
    expect(screen.getByText('You came in through remote access, so a code is needed too.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'avery' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
    const signIn = screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement
    expect(signIn.disabled).toBe(true)
    fireEvent.change(code, { target: { value: '603 914' } })
    fireEvent.click(signIn)
    expect(await screen.findByText('This organisation is not connected to Agenthix Cloud.')).toBeTruthy()
    expect(requests.find(r => r.path === '/session')?.body).toEqual({ username: 'avery', password: 'pw', code: '603914' })
  })

  it('a recovery code can be used instead', async () => {
    const requests = fakeServer({ ...STATUS, 'POST /session': NOT_CONNECTED })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Use a recovery code' }))
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'avery' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
    fireEvent.change(screen.getByLabelText('Recovery code'), { target: { value: 'k7qm-2xpa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(requests.find(r => r.path === '/session')?.body).toEqual({ username: 'avery', password: 'pw', recoveryCode: 'k7qm-2xpa' }))
  })

  it('on the machine, the HQ login alone is sent, as before', async () => {
    const requests = fakeServer({ 'GET /status': { status: 200, body: STATUS_OK }, 'GET /sign-in/remote': { status: 200, body: { remote: false } }, 'POST /session': NOT_CONNECTED })
    render(<App />)
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'sam' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
    expect(screen.queryByLabelText('Six-digit code from your authenticator app')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(requests.find(r => r.path === '/session')?.body).toEqual({ username: 'sam', password: 'pw' }))
  })
})
