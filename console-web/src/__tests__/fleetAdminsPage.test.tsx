import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { forgetCsrfToken } from '../api/csrf'
import { FleetAdminsPage } from '../pages/fleet-admins/FleetAdminsPage'
import { fakeServer, SAM, type Route } from './fakeServer'

const sam = { id: SAM.id, name: SAM.name, username: 'sam', organisationAdmin: true, since: '2026-10-13T09:00:00.000Z' }
const avery = { id: 'u2', name: 'Avery Chen', username: 'avery', organisationAdmin: false, since: '2026-10-14T09:00:00.000Z' }
const jordan = { id: 'u3', name: 'Jordan Lee', username: 'jordan', organisationAdmin: true, fleetAdmin: false }

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear() })

function serve(admins: object[], extra: Record<string, Route | ((req: { body: unknown }) => Route)> = {}) {
  return fakeServer({
    'GET /session': { status: 200, body: { user: SAM, account: null, hq: { organisationName: 'Acme Robotics', address: 'https://hq.acme.example' } } },
    'GET /fleet-admins': { status: 200, body: { admins } },
    ...extra,
  })
}

async function open() {
  render(<AuthProvider><FleetAdminsPage /></AuthProvider>)
  return screen.findByRole('list', { name: 'Fleet admins' })
}

describe('Fleet admins @SC-918', () => {
  it('lists who holds the role, and says plainly who can give it and that every grant is announced', async () => {
    serve([sam, avery])
    const list = await open()
    const me = within(list).getByRole('listitem', { name: 'Sam Rivera' })
    expect(within(me).getByText('· you')).toBeTruthy()
    expect(within(me).getByText('Organisation admin')).toBeTruthy()
    expect(within(me).getByText(/since 13 Oct/)).toBeTruthy()
    expect(within(list).getByRole('listitem', { name: 'Avery Chen' })).toBeTruthy()
    expect(await screen.findByText(/Acme Robotics' own machines/)).toBeTruthy()
    expect(screen.getByText(/a machine admin of HQ's machine/)).toBeTruthy()
    expect(screen.getByText('agenthix hq fleet-admin <username>')).toBeTruthy()
    expect(screen.getByText(/An organisation admin cannot give it/)).toBeTruthy()
    expect(screen.getByText(/Every grant and removal is announced to every fleet admin and organisation admin/)).toBeTruthy()
  })

  it('gives the role to an HQ account found by its username', async () => {
    const requests = serve([sam], {
      'GET /fleet-admins/find?username=jordan': { status: 200, body: { account: jordan } },
      'POST /fleet-admins': { status: 200, body: { granted: true } },
    })
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Give the role to…' }))
    const dialog = screen.getByRole('region', { name: 'Give the fleet admin role to…' })
    fireEvent.change(within(dialog).getByLabelText('Username in HQ'), { target: { value: 'jordan' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Find' }))
    expect(await within(dialog).findByText('Jordan Lee')).toBeTruthy()
    expect(within(dialog).getByText(/Every fleet admin and organisation admin is told/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Give the role' }))
    await waitFor(() => expect(requests.find(r => r.method === 'POST')?.body).toEqual({ userId: 'u3' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Give the fleet admin role to…' })).toBeNull())
    expect(requests.filter(r => r.method === 'GET' && r.path === '/fleet-admins').length).toBeGreaterThan(1)
  })

  it('says when no account has that username, or it already holds the role, and offers no grant', async () => {
    serve([sam], {
      'GET /fleet-admins/find?username=nobody': { status: 200, body: { account: null } },
      'GET /fleet-admins/find?username=avery': { status: 200, body: { account: { ...jordan, id: 'u2', name: 'Avery Chen', username: 'avery', fleetAdmin: true } } },
    })
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Give the role to…' }))
    const dialog = screen.getByRole('region', { name: 'Give the fleet admin role to…' })
    const field = within(dialog).getByLabelText('Username in HQ')
    fireEvent.change(field, { target: { value: 'nobody' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Find' }))
    expect(await within(dialog).findByText(/No account in HQ has the username nobody/)).toBeTruthy()
    expect(within(dialog).getByRole('link', { name: 'Open People in HQ ↗' }).getAttribute('href')).toBe('https://hq.acme.example/org/people')
    fireEvent.change(field, { target: { value: 'avery' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Find' }))
    expect(await within(dialog).findByText(/already holds the fleet admin role/)).toBeTruthy()
    expect(within(dialog).queryByRole('button', { name: 'Give the role' })).toBeNull()
  })

  it('removes the role after saying what happens to them', async () => {
    const requests = serve([sam, avery], { 'DELETE /fleet-admins/u2': { status: 200, body: { revoked: true } } })
    const list = await open()
    fireEvent.click(within(within(list).getByRole('listitem', { name: 'Avery Chen' })).getByRole('button', { name: 'Remove the role' }))
    const dialog = screen.getByRole('region', { name: 'Remove the fleet admin role from Avery Chen?' })
    expect(within(dialog).getByText(/signed out here at once/)).toBeTruthy()
    expect(within(dialog).getByText(/Their HQ account stays as it is/)).toBeTruthy()
    expect(requests.some(r => r.method === 'DELETE')).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove the role' }))
    await waitFor(() => expect(requests.some(r => r.method === 'DELETE' && r.path === '/fleet-admins/u2')).toBe(true))
  })

  it('shows HQ’s refusal in the dialog', async () => {
    serve([sam, avery], { 'DELETE /fleet-admins/u2': { status: 403, body: { error: 'not_allowed', message: 'Only a fleet admin can change who holds the fleet admin role.' } } })
    const list = await open()
    fireEvent.click(within(within(list).getByRole('listitem', { name: 'Avery Chen' })).getByRole('button', { name: 'Remove the role' }))
    fireEvent.click(within(screen.getByRole('region', { name: 'Remove the fleet admin role from Avery Chen?' })).getByRole('button', { name: 'Remove the role' }))
    expect(await screen.findByText('Only a fleet admin can change who holds the fleet admin role.')).toBeTruthy()
  })

  it('does not let the last fleet admin remove themselves, and says what to do instead', async () => {
    const requests = serve([sam])
    const list = await open()
    fireEvent.click(within(within(list).getByRole('listitem', { name: 'Sam Rivera' })).getByRole('button', { name: 'Remove the role' }))
    // The control is refused in advance; pressed anyway, it opens the dialog with the full reason.
    const dialog = screen.getByRole('dialog', { name: 'You are the only fleet admin' })
    expect(within(dialog).getByText(/Give someone else the role first/)).toBeTruthy()
    expect(within(dialog).getByText('agenthix hq fleet-admin <username>')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'You are the only fleet admin' })).toBeNull()
    expect(requests.some(r => r.method === 'DELETE')).toBe(false)
  })

  it('says when HQ is older than finding an account', async () => {
    serve([sam], { 'GET /fleet-admins/find?username=jordan': { status: 501, body: { error: 'hq_too_old', message: 'HQ does not keep this yet: it is older than this Fleet Console. Upgrade HQ to see it here.' } } })
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Give the role to…' }))
    const dialog = screen.getByRole('region', { name: 'Give the fleet admin role to…' })
    fireEvent.change(within(dialog).getByLabelText('Username in HQ'), { target: { value: 'jordan' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Find' }))
    // A find that fails is a press that failed: the attention dialog, over the form.
    expect(within(await screen.findByRole('dialog', { name: 'Not found' })).getByText(/older than this Fleet Console/)).toBeTruthy()
  })
})
