import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { forgetCsrfToken } from '../api/csrf'
import { targetPath, type FleetNoticeView } from '../shell/notices'
import { fakeServer, type Route } from './fakeServer'
import { fleet, host, SIGNED_IN } from './shellFixtures'

// The notices are an inbox beside the menu, as HQ's are: each opens what it is about, each is dismissed in HQ, and
// the bell counts what is not dismissed.

const FP = 'a'.repeat(64)
const at = new Date().toISOString()
const silent: FleetNoticeView = {
  id: 'm1', kind: 'machineNotHeardFrom', title: 'Not heard from office-server since 09:14', body: 'It may be switched off.', at,
  dismissible: false, fingerprint: FP, target: { page: 'site', fingerprint: FP },
}
const told = (i: number, over: Partial<FleetNoticeView> = {}): FleetNoticeView => ({
  id: `t${i}`, kind: 'activity', title: `Sam Rivera did thing ${i}`, body: '', at, dismissible: true, fingerprint: null, target: { page: 'dashboard' }, ...over,
})

function serve(list: FleetNoticeView[], extra: Record<string, Route | (() => Route)> = {}) {
  const gone = new Set<string>()
  const routes: Record<string, Route | (() => Route)> = {
    ...SIGNED_IN,
    'GET /fleet': { status: 200, body: fleet([host('machine-d', { hqMachine: true })]) },
    'GET /notices': () => ({ status: 200, body: { notices: list.filter(n => !gone.has(n.id)) } }),
    ...extra,
  }
  for (const n of list) {
    routes[`POST /notices/${n.id}/dismiss`] ??= () => { gone.add(n.id); return { status: 200, body: { dismissed: true } } }
  }
  return fakeServer(routes)
}

async function openAt(path: string) {
  window.history.replaceState(null, '', path)
  render(<App />)
  return screen.findByRole('navigation', { name: 'Fleet Console' })
}

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

describe('the notices panel @SC-916', () => {
  it('opens beside the menu from the bell, kept in the address without a new history entry', async () => {
    serve([silent, told(0)])
    const nav = await openAt('/backups')
    const length = window.history.length
    fireEvent.click(await within(nav).findByRole('button', { name: 'Notices, 2 new' }))
    expect(window.location.pathname + window.location.search).toBe('/backups?panel=notices')
    expect(window.history.length).toBe(length)
    expect(screen.getByRole('dialog', { name: 'Notices' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Backups' })).toBeTruthy()
  })

  it('is open when the address says so, and closes on Escape, on its close button, and on a click outside', async () => {
    serve([told(0)])
    await openAt('/backups?panel=notices')
    expect(await screen.findByRole('dialog', { name: 'Notices' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Notices' })).toBeNull()
    expect(window.location.search).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'Notices, 1 new' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close notices' }))
    expect(screen.queryByRole('dialog', { name: 'Notices' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Notices, 1 new' }))
    fireEvent.click(screen.getByTestId('panel-outside'))
    expect(screen.queryByRole('dialog', { name: 'Notices' })).toBeNull()
    expect(window.location.pathname).toBe('/backups')
  })

  it('each notice opens what it is about, and the panel closes as the page changes', async () => {
    serve([silent, told(0, { target: { page: 'fleetAdmins' } })])
    await openAt('/backups?panel=notices')
    const panel = await screen.findByRole('dialog', { name: 'Notices' })
    const machine = await within(panel).findByRole('link', { name: new RegExp(silent.title) })
    expect(machine.getAttribute('href')).toBe(`/sites/${FP}`)
    fireEvent.click(within(panel).getByRole('link', { name: /did thing 0/ }))
    expect(window.location.pathname + window.location.search).toBe('/fleet-admins')
    expect(screen.queryByRole('dialog', { name: 'Notices' })).toBeNull()
  })

  it('opens the page each kind of target names', () => {
    expect(targetPath({ page: 'site', fingerprint: FP })).toBe(`/sites/${FP}`)
    expect(targetPath({ page: 'hq', fingerprint: FP })).toBe('/hq')
    expect(targetPath({ page: 'move', fingerprint: FP, moveId: 'm1', hq: false })).toBe(`/sites/${FP}/move?move=m1`)
    expect(targetPath({ page: 'move', fingerprint: FP, moveId: 'm2', hq: true })).toBe('/hq/move?move=m2')
    expect(targetPath({ page: 'fleetAdmins' })).toBe('/fleet-admins')
    expect(targetPath({ page: 'dashboard' })).toBe('/')
    expect(targetPath(undefined)).toBeNull()
  })

  it('dismisses one in HQ, and the count falls; one that clears itself has no Dismiss and says so', async () => {
    const requests = serve([silent, told(0), told(1)])
    const nav = await openAt('/backups?panel=notices')
    const panel = await screen.findByRole('dialog', { name: 'Notices' })
    const kept = await within(panel).findByRole('article', { name: silent.title })
    expect(within(kept).queryByRole('button', { name: 'Dismiss' })).toBeNull()
    expect(within(kept).getByText(/Clears itself/)).toBeTruthy()

    fireEvent.click(within(within(panel).getByRole('article', { name: 'Sam Rivera did thing 0' })).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(within(panel).queryByRole('article', { name: 'Sam Rivera did thing 0' })).toBeNull())
    expect(within(nav).getByRole('button', { name: 'Notices, 2 new' })).toBeTruthy()
    expect(requests.filter(r => r.method === 'POST').map(r => r.path)).toEqual(['/notices/t0/dismiss'])
  })

  it('Dismiss all is at the top however many there are, asks first, and empties the bell of all but those that clear themselves', async () => {
    const many = Array.from({ length: 58 }, (_, i) => told(i))
    const requests = serve([silent, ...many])
    const nav = await openAt('/backups?panel=notices')
    const panel = await screen.findByRole('dialog', { name: 'Notices' })
    await within(nav).findByRole('button', { name: 'Notices, 59 new' })
    const all = within(panel).getByRole('button', { name: 'Dismiss all' })
    // Before the list, so it is in reach without scrolling past 58 notices.
    expect(all.compareDocumentPosition(within(panel).getByRole('list', { name: 'Notices' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(all)
    fireEvent.click(within(panel).getByRole('button', { name: 'Yes, dismiss 58' }))
    await waitFor(() => expect(within(nav).getByRole('button', { name: 'Notices, 1 new' })).toBeTruthy())
    expect(requests.filter(r => r.method === 'POST')).toHaveLength(58)
    expect(within(panel).getByRole('article', { name: silent.title })).toBeTruthy()
  }, 15_000) // Draws 59 notices and sends 58 dismissals: past the default 5 seconds on a shared CI runner.

  it('shows HQ’s refusal beside the notice it refused', async () => {
    serve([told(0)], { 'POST /notices/t0/dismiss': { status: 403, body: { error: 'not_allowed', message: 'Only a fleet admin sees this.' } } })
    await openAt('/backups?panel=notices')
    const panel = await screen.findByRole('dialog', { name: 'Notices' })
    fireEvent.click(await within(panel).findByRole('button', { name: 'Dismiss' }))
    expect(within(await screen.findByRole('dialog', { name: 'Not dismissed' })).getByText('Only a fleet admin sees this.')).toBeTruthy()
  })

  it('says nothing needs you when there is nothing, and stays empty when HQ does not keep notices yet', async () => {
    fakeServer({ ...SIGNED_IN, 'GET /notices': { status: 501, body: { error: 'hq_too_old', message: 'older' } } })
    const nav = await openAt('/backups')
    fireEvent.click(await within(nav).findByRole('button', { name: 'Notices' }))
    expect(screen.getByText('Nothing needs you.')).toBeTruthy()
  })
})
