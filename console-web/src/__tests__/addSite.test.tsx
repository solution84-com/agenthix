import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetCsrfToken } from '../api/csrf'
import { AddSitePage } from '../pages/add/AddSitePage'
import type { JoinView } from '../pages/add/joinWords'
import { fakeServer } from './fakeServer'

const inMs = (ms: number) => new Date(Date.now() + ms).toISOString()
const MACHINE = { name: 'office-server', fingerprint: 'f'.repeat(64), fingerprintShort: '8F3A 91C2 E04B 7D55' }
const view = (over: Partial<JoinView> = {}): JoinView => ({
  joinId: 'j1', state: 'waiting', expiresAt: inMs(60 * 60_000), machine: null, replaces: null, hqClaim: null, siteName: null, problem: null, ...over,
})
const SESSION = { status: 200, body: { user: { id: 'u1', name: 'Sam Rivera' }, hq: { organisationName: 'Acme Robotics', address: 'https://hq.acme.example' } } }

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

async function openCode() {
  render(<AddSitePage pollMs={5} />)
  expect(screen.getByText('What are you adding?')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  return screen.findByLabelText('One-time code')
}

describe('Add a site', () => {
  it('waiting: the code once, how long it works, and the command with HQ\'s address @SC-903', async () => {
    const requests = fakeServer({
      'GET /session': SESSION,
      'POST /joins': { status: 201, body: { ...view(), code: 'K7QM-4XPD-93TB' } },
      'GET /joins/j1': { status: 200, body: view() },
    })
    expect((await openCode()).textContent).toBe('K7QM-4XPD-93TB')
    expect(screen.getByText('Works once, for the next 60 minutes.')).toBeTruthy()
    expect(await screen.findByText('$ agenthix console connect https://hq.acme.example K7QM-4XPD-93TB')).toBeTruthy()
    expect(screen.getByText(/Waiting for the machine to connect/)).toBeTruthy()
    // The code is never read back: only the join's state is.
    await waitFor(() => expect(requests.some(r => r.path === '/joins/j1')).toBe(true))
  })

  it('asks whether to notify the fleet admins if the machine stops answering, ticked to begin with @SC-901', async () => {
    const requests = fakeServer({
      'GET /session': SESSION,
      'POST /joins': { status: 201, body: { ...view(), code: 'K7QM-4XPD-93TB' } },
      'GET /joins/j1': { status: 200, body: view() },
    })
    render(<AddSitePage pollMs={5} />)
    const notify = screen.getByRole('checkbox', { name: 'Notify the fleet admins if this machine stops answering' }) as HTMLInputElement
    expect(notify.checked).toBe(true)
    fireEvent.click(notify)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByLabelText('One-time code')
    expect(requests.find(r => r.path === '/joins' && r.method === 'POST')?.body).toEqual({ notify: false })
  })

  it('arrived: the name and fingerprint to compare; confirming starts the site, step by step @SC-903', async () => {
    let confirmed = false
    const installing = view({ state: 'installing', machine: MACHINE, siteName: 'office-server' })
    const requests = fakeServer({
      'GET /session': SESSION,
      'POST /joins': { status: 201, body: { ...view(), code: 'K7QM-4XPD-93TB' } },
      'GET /joins/j1': () => ({ status: 200, body: confirmed ? installing : view({ state: 'confirming', machine: MACHINE }) }),
      'POST /joins/j1/confirm': () => { confirmed = true; return { status: 200, body: installing } },
    })
    await openCode()
    const check = await screen.findByRole('region', { name: 'The machine that used the code' })
    expect(within(check).getByText('office-server')).toBeTruthy()
    expect(within(check).getByText('8F3A 91C2 E04B 7D55')).toBeTruthy()
    fireEvent.click(within(check).getByRole('button', { name: 'Confirm office-server' }))
    expect(await screen.findByText('The site installed and started on it')).toBeTruthy()
    expect(screen.getAllByText('Under way')).toHaveLength(1)
    expect(requests.find(r => r.path === '/joins/j1/confirm')?.method).toBe('POST')
  })

  it('done: says it is connected, and where HQ shows it @SC-903', async () => {
    fakeServer({
      'GET /session': SESSION,
      'POST /joins': { status: 201, body: { ...view(), code: 'K7QM-4XPD-93TB' } },
      'GET /joins/j1': { status: 200, body: view({ state: 'done', machine: MACHINE, siteName: 'office-server' }) },
    })
    await openCode()
    expect(await screen.findByText('Confirmed. office-server is connected.')).toBeTruthy()
    expect(screen.getAllByText('Done')).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'Open Where work runs in HQ ↗' }).getAttribute('href')).toBe('https://hq.acme.example/settings')
  })

  it('refused: the machine is turned away and the code is spent @SC-903', async () => {
    const requests = fakeServer({
      'GET /session': SESSION,
      'POST /joins': { status: 201, body: { ...view(), code: 'K7QM-4XPD-93TB' } },
      'GET /joins/j1': { status: 200, body: view({ state: 'confirming', machine: MACHINE }) },
      'POST /joins/j1/refuse': { status: 204 },
    })
    await openCode()
    fireEvent.click(await screen.findByRole('button', { name: 'Refuse' }))
    expect(await screen.findByText('Refused')).toBeTruthy()
    expect(screen.queryByLabelText('One-time code')).toBeNull()
    expect(requests.some(r => r.method === 'POST' && r.path === '/joins/j1/refuse')).toBe(true)
  })

  it('expired: the Fleet Console no longer knows the code, and a new one can be made @SC-903', async () => {
    let made = 0
    fakeServer({
      'GET /session': SESSION,
      'POST /joins': () => ({ status: 201, body: { ...view({ joinId: `j${++made}` }), code: made === 1 ? 'K7QM-4XPD-93TB' : 'R2WN-8DKE-41HC' } }),
      'GET /joins/j1': { status: 404, body: { error: 'not_found', message: 'No such code, or it has expired.' } },
      'GET /joins/j2': { status: 200, body: view({ joinId: 'j2' }) },
    })
    await openCode()
    expect(await screen.findByText('The code ran out')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Make a new code' }))
    expect((await screen.findByLabelText('One-time code')).textContent).toBe('R2WN-8DKE-41HC')
  })

  it('the site could not be installed: the reason, and trying again @SC-903', async () => {
    const requests = fakeServer({
      'GET /session': SESSION,
      'POST /joins': { status: 201, body: { ...view(), code: 'K7QM-4XPD-93TB' } },
      'GET /joins/j1': { status: 200, body: view({ state: 'failed', machine: MACHINE, siteName: 'office-server', problem: 'The image could not be fetched.' }) },
      'POST /joins/j1/confirm': { status: 200, body: view({ state: 'installing', machine: MACHINE, siteName: 'office-server' }) },
    })
    await openCode()
    expect(await screen.findByText('The image could not be fetched.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(requests.some(r => r.path === '/joins/j1/confirm')).toBe(true))
  })

  it('cancelling withdraws the code @SC-903', async () => {
    const requests = fakeServer({
      'GET /session': SESSION,
      'POST /joins': { status: 201, body: { ...view(), code: 'K7QM-4XPD-93TB' } },
      'GET /joins/j1': { status: 200, body: view() },
      'DELETE /joins/j1': { status: 204 },
    })
    await openCode()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(requests.some(r => r.method === 'DELETE' && r.path === '/joins/j1')).toBe(true)
  })
})

describe('Restore from a backup @SC-903', () => {
  it('is offered beside a new site', () => {
    fakeServer({})
    render(<AddSitePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Restore from a backup…' }))
    expect(window.location.pathname).toBe('/fleet/add/restore')
  })
})
