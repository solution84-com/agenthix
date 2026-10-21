import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { forgetCsrfToken } from '../api/csrf'
import { fakeServer, SAM, STATUS_OK } from './fakeServer'

beforeEach(() => window.history.replaceState(null, '', '/'))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  forgetCsrfToken()
  sessionStorage.clear()
  localStorage.clear()
})

async function fillAndSubmit(username: string, password: string) {
  fireEvent.change(await screen.findByLabelText('Username'), { target: { value: username } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('signing in @SC-892', () => {
  it('names the account it needs and where it runs', async () => {
    fakeServer({ 'GET /status': { status: 200, body: STATUS_OK } })
    render(<App />)
    expect(await screen.findByText('Sign in with your HQ account. You need the fleet admin role.')).toBeTruthy()
    expect(screen.getByText('on hq-box · 127.0.0.1')).toBeTruthy()
  })

  it('while HQ does not answer, nobody can sign in, and the page says what to run on the machine', async () => {
    fakeServer({ 'GET /status': { status: 200, body: { ...STATUS_OK, hq: 'disconnected', fleetAdmins: 'unknown' } } })
    render(<App />)
    expect(await screen.findByText('HQ is not answering, so your HQ login cannot be checked.')).toBeTruthy()
    expect(screen.getByText('agenthix status')).toBeTruthy()
    expect(screen.getByText('agenthix restore')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'sam' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
    expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('with nobody holding the role, it says how a machine admin gives it', async () => {
    fakeServer({ 'GET /status': { status: 200, body: { ...STATUS_OK, fleetAdmins: 'none' } } })
    render(<App />)
    expect(await screen.findByText('Nobody holds the fleet admin role')).toBeTruthy()
    expect(screen.getByText('agenthix hq fleet-admin <username>')).toBeTruthy()
    expect(screen.queryByLabelText('Password')).toBeNull()
  })

  it('a wrong password is said as HQ said it, and the password is cleared', async () => {
    fakeServer({
      'GET /status': { status: 200, body: STATUS_OK },
      'POST /session': { status: 401, body: { error: 'wrong', message: 'That username and password do not match an HQ account.' } },
    })
    render(<App />)
    await fillAndSubmit('sam', 'nope')
    expect(await screen.findByText('That username and password do not match an HQ account.')).toBeTruthy()
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('')
  })

  it("an account without the role is told it isn't a fleet admin, and who can give it", async () => {
    fakeServer({
      'GET /status': { status: 200, body: STATUS_OK },
      'POST /session': { status: 403, body: { error: 'not_fleet_admin', message: "This account isn't a fleet admin." } },
    })
    render(<App />)
    await fillAndSubmit('jordan', 'pw')
    expect(await screen.findByText("This account isn't a fleet admin.")).toBeTruthy()
    expect(screen.getByText('A fleet admin can give you the role in the Fleet Console.')).toBeTruthy()
  })

  it('HQ going away between the page and the attempt turns the page to the HQ-not-answering state', async () => {
    let hq = 'connected'
    fakeServer({
      'GET /status': () => ({ status: 200, body: { ...STATUS_OK, hq } }),
      'POST /session': () => { hq = 'disconnected'; return { status: 503, body: { error: 'hq_unreachable', message: 'HQ is not answering.' } } },
    })
    render(<App />)
    await fillAndSubmit('sam', 'pw')
    expect(await screen.findByText('HQ is not answering, so your HQ login cannot be checked.')).toBeTruthy()
  })

  it('a right login opens the shell on the page asked for', async () => {
    const requests = fakeServer({
      'GET /status': { status: 200, body: STATUS_OK },
      'POST /session': { status: 201, body: { user: SAM, csrfToken: 'tok' } },
    })
    render(<App />)
    await fillAndSubmit(' sam ', 'pw')
    expect(await screen.findByRole('navigation', { name: 'Fleet Console' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy()
    expect(requests.find(r => r.method === 'POST')?.body).toEqual({ username: 'sam', password: 'pw' })
    expect(sessionStorage.getItem('csrfToken')).toBe('tok')
  })

  it('a session that ends while open returns to the sign-in page and says why', async () => {
    sessionStorage.setItem('csrfToken', 'tok')
    let answered = false
    fakeServer({
      'GET /status': { status: 200, body: STATUS_OK },
      'GET /session': () => answered
        ? { status: 401, body: { error: 'not_fleet_admin', message: 'This account no longer holds the fleet admin role.' } }
        : (answered = true, { status: 200, body: { user: SAM } }),
      'GET /fleet-admins': { status: 401, body: { error: 'not_fleet_admin', message: 'This account no longer holds the fleet admin role.' } },
    })
    window.history.replaceState(null, '', '/account')
    render(<App />)
    expect(await screen.findByText('This account no longer holds the fleet admin role.')).toBeTruthy()
    await waitFor(() => expect(screen.getByLabelText('Password')).toBeTruthy())
    expect(sessionStorage.getItem('csrfToken')).toBeNull()
  })
})
