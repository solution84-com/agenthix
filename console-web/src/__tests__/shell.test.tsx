import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { forgetCsrfToken } from '../api/csrf'
import { LocalOnlyFoot } from '../shell/LocalOnlyFoot'
import { findSites, JOBS, jobsFor, menuSites } from '../shell/menu'
import { initialsOf } from '../shell/PersonMenu'
import { fakeServer } from './fakeServer'
import { fleet, host, SIGNED_IN } from './shellFixtures'

const hqBox = host('machine-d', { hqMachine: true })
const FLEET = fleet([
  host('office-server', { siteName: 'office' }),
  hqBox,
  host('lab-02', { online: false, since: new Date(Date.now() - 60 * 60_000).toISOString() }),
  host('lab-01', { figures: null, siteRegistered: false, online: false, notifyIfSilent: false }),
])
const SIGNED_IN_WITH_FLEET = { ...SIGNED_IN, 'GET /fleet': { status: 200, body: FLEET } }

async function openAt(path: string) {
  window.history.replaceState(null, '', path)
  sessionStorage.setItem('csrfToken', 'tok')
  render(<App />)
  return screen.findByRole('navigation', { name: 'Fleet Console' })
}

const links = (el: HTMLElement) => within(el).getAllByRole('link').map(a => (a.textContent ?? '').replace(/, .*$/, ''))

beforeEach(() => { localStorage.clear() })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  forgetCsrfToken()
  sessionStorage.clear()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  window.history.replaceState(null, '', '/')
})

describe('the menu', () => {
  it('has three parts: Dashboard and HQ on top, every site in the middle, the jobs pinned below; "Fleet" names no entry @SC-894', async () => {
    fakeServer(SIGNED_IN_WITH_FLEET)
    const nav = await openAt('/')
    const sites = await within(nav).findByRole('list', { name: 'Sites' })
    await waitFor(() => expect(within(sites).getAllByRole('link')).toHaveLength(4))
    const all = links(nav)
    expect(all.slice(0, 2)).toEqual(['Dashboard', 'HQ'])
    expect(links(sites)).toEqual(['machine-d', 'lab-01', 'lab-02', 'office-server'])
    // Remote access is Agenthix Cloud's, listed only while its flag is on (adr-0189).
    expect(all.slice(6)).toEqual(['Maintenance', 'Backups', 'Activity', 'Fleet admins', 'Help'])
    expect(all).not.toContain('Fleet')
  })

  it('names each site after its machine, HQ’s first, then by name, with its state in words beside the dot @SC-894', () => {
    const now = new Date()
    const sites = menuSites(FLEET.hosts, now)
    expect(sites.map(s => s.name)).toEqual(['machine-d', 'lab-01', 'lab-02', 'office-server'])
    expect(sites.map(s => s.dot)).toEqual(['healthy', 'none', 'attention', 'healthy'])
    expect(sites[2].state).toBe('Not answering')
  })

  it('a site that is stopped or only not heard from is silent, not in need of attention @SC-897', () => {
    const now = new Date()
    const [stopped, quiet] = menuSites([
      host('a', { online: false, stoppedAt: now.toISOString() }),
      host('b', { online: false, notifyIfSilent: false }),
    ], now)
    expect([stopped.dot, quiet.dot]).toEqual(['silent', 'silent'])
  })

  it('Find a site filters the sites as you type, by the machine’s name or the site’s @SC-894', async () => {
    expect(findSites(menuSites(FLEET.hosts, new Date()), 'OFF').map(s => s.name)).toEqual(['office-server'])
    fakeServer(SIGNED_IN_WITH_FLEET)
    const nav = await openAt('/')
    const sites = await within(nav).findByRole('list', { name: 'Sites' })
    await waitFor(() => expect(within(sites).getAllByRole('link')).toHaveLength(4))
    fireEvent.change(within(nav).getByRole('searchbox', { name: 'Find a site' }), { target: { value: 'lab' } })
    expect(links(sites)).toEqual(['lab-01', 'lab-02'])
    fireEvent.change(within(nav).getByRole('searchbox', { name: 'Find a site' }), { target: { value: 'nothing' } })
    expect(within(nav).getByText('No site matches "nothing".')).toBeTruthy()
  })

  it('HQ opens HQ’s page, a site its own, and each is marked when open @SC-894', async () => {
    fakeServer(SIGNED_IN_WITH_FLEET)
    const nav = await openAt('/')
    const hq = await within(nav).findByRole('link', { name: /^HQ, Healthy/ })
    await waitFor(() => expect(hq.getAttribute('href')).toBe('/hq'))
    expect(within(nav).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBe('page')

    fireEvent.click(within(nav).getByRole('link', { name: /^office-server/ }))
    expect(window.location.pathname).toBe(`/sites/${'office-server'.padEnd(64, '0')}`)
    expect(within(nav).getByRole('link', { name: /^office-server/ }).getAttribute('aria-current')).toBe('page')
    expect(within(nav).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBeNull()
  })

  it('says HQ needs attention when it does not answer the Fleet Console @SC-894', async () => {
    fakeServer({ ...SIGNED_IN, 'GET /fleet': { status: 200, body: fleet([hqBox], 'disconnected') } })
    const nav = await openAt('/')
    expect(await within(nav).findByRole('link', { name: /^HQ, Not answering/ })).toBeTruthy()
  })

  it('opens on the dashboard at /, and the old /fleet address leads there @SC-894', async () => {
    fakeServer(SIGNED_IN_WITH_FLEET)
    await openAt('/fleet')
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy()
    expect(window.location.pathname).toBe('/')
  })

  it("a site's old address, under /fleet, leads to its page under /sites @SC-894", async () => {
    fakeServer({ ...SIGNED_IN_WITH_FLEET, [`GET /hosts/${'office-server'.padEnd(64, '0')}`]: { status: 200, body: { host: host('office-server') } } })
    const fp = 'office-server'.padEnd(64, '0')
    await openAt(`/fleet/${fp}/capacity`)
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe(`/sites/${fp}?panel=maintenance&which=${fp}&what=capacity`))
    expect(await screen.findByRole('dialog', { name: 'Plan maintenance' })).toBeTruthy()
  })

  it("HQ's page and HQ's own site's page are two entries: HQ on top, its site among the sites @SC-894", async () => {
    fakeServer({ ...SIGNED_IN_WITH_FLEET, [`GET /hosts/${hqBox.fingerprint}`]: { status: 200, body: { host: hqBox } } })
    const nav = await openAt('/hq')
    const hq = await within(nav).findByRole('link', { name: /^HQ, / })
    await waitFor(() => expect(hq.getAttribute('aria-current')).toBe('page'))
    const own = within(within(nav).getByRole('list', { name: 'Sites' })).getByRole('link', { name: /^machine-d/ })
    expect(own.getAttribute('aria-current')).toBeNull()
    fireEvent.click(own)
    expect(window.location.pathname).toBe(`/sites/${hqBox.fingerprint}`)
    expect(own.getAttribute('aria-current')).toBe('page')
    expect(hq.getAttribute('aria-current')).toBeNull()
    expect(await screen.findByRole('heading', { name: 'machine-d', level: 1 })).toBeTruthy()
  })

  it('moves between pages without a reload; Maintenance has its page, and Help has its page @SC-894', async () => {
    fakeServer(SIGNED_IN_WITH_FLEET)
    const nav = await openAt('/')
    expect(await within(nav).findByText('on hq-box · localhost')).toBeTruthy()
    fireEvent.click(within(nav).getByRole('link', { name: 'Maintenance' }))
    expect(window.location.pathname).toBe('/maintenance')
    expect(within(nav).getByRole('link', { name: 'Maintenance' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('heading', { name: 'Maintenance' })).toBeTruthy()
    fireEvent.click(within(nav).getByRole('link', { name: 'Help' }))
    expect(screen.getByRole('heading', { name: 'Help' })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Help topics' })).toBeTruthy()
  })

  it('draws no breadcrumb trail on a page @SC-894', async () => {
    fakeServer(SIGNED_IN_WITH_FLEET)
    await openAt('/fleet/add')
    expect(await screen.findByRole('heading', { name: 'Add a site' })).toBeTruthy()
    // The one › on a page is the *How this works ›* link's own, not a trail.
    expect(screen.queryAllByText(/›/).filter(el => !el.closest('a[href^="/help"]'))).toHaveLength(0)
  })

  it('lists Remote access among the jobs only while Agenthix Cloud is on (adr-0189) @SC-1077', () => {
    expect(JOBS.map(i => i.label)).toContain('Remote access')
    expect(jobsFor(true).map(i => i.label)).toContain('Remote access')
    expect(jobsFor(false).map(i => i.label)).not.toContain('Remote access')
  })

  it('folds to icons keeping its three parts, and the browser remembers it @SC-894', async () => {
    fakeServer(SIGNED_IN_WITH_FLEET)
    const nav = await openAt('/')
    const sites = await within(nav).findByRole('list', { name: 'Sites' })
    await waitFor(() => expect(within(sites).getAllByRole('link')).toHaveLength(4))
    fireEvent.click(within(nav).getByRole('button', { name: 'Collapse the menu' }))
    expect(within(nav).getByRole('link', { name: 'Maintenance' }).getAttribute('title')).toBe('Maintenance')
    expect(within(nav).getByRole('link', { name: /^HQ, Healthy/ })).toBeTruthy()
    expect(within(within(nav).getByRole('list', { name: 'Sites' })).getAllByRole('link')).toHaveLength(4)
    expect(within(nav).queryByRole('searchbox')).toBeNull()
    expect(localStorage.getItem('menuCollapsed')).toBe('true')

    cleanup()
    const again = await openAt('/')
    expect(within(again).getByRole('button', { name: 'Expand the menu' })).toBeTruthy()
  })

  it('says on every page that it is opened on this machine alone @SC-894', async () => {
    fakeServer(SIGNED_IN_WITH_FLEET)
    await openAt('/backups')
    expect(screen.getByText('Local only')).toBeTruthy()
    expect(screen.getByText(/Opened on this machine alone, at localhost/)).toBeTruthy()
  })

  it('says it came through remote access when the page was opened at another name', () => {
    vi.stubGlobal('location', { ...window.location, hostname: 'console.example.net' })
    render(<LocalOnlyFoot />)
    expect(screen.getByText('Remote access')).toBeTruthy()
    expect(screen.queryByText(/nothing on the network/)).toBeNull()
    expect(screen.queryByText('Local only')).toBeNull()
  })
})

describe('the person signed in @SC-895', () => {
  it('is named with their initials and role, and their menu opens Your account', async () => {
    fakeServer(SIGNED_IN_WITH_FLEET)
    const nav = await openAt('/')
    expect(within(nav).getByText('Sam Rivera')).toBeTruthy()
    expect(within(nav).getByText('fleet admin')).toBeTruthy()
    expect(initialsOf('Sam Rivera')).toBe('SR')
    expect(initialsOf('sam')).toBe('SA')

    fireEvent.click(within(nav).getByRole('button', { name: /Sam Rivera/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Your account' }))
    expect(window.location.pathname).toBe('/account')
    expect(screen.getByRole('heading', { name: 'Your account' })).toBeTruthy()
    expect(within(nav).queryByRole('link', { current: 'page' })).toBeNull()
    expect(await screen.findByText('sam')).toBeTruthy()
    expect(screen.getByText(/An HQ account, with the fleet admin and organisation admin roles/)).toBeTruthy()
    expect(screen.getByText(/Kept by HQ: you sign in here with your HQ login/)).toBeTruthy()
  })

  it('switches light and dark from their menu', async () => {
    fakeServer(SIGNED_IN_WITH_FLEET)
    const nav = await openAt('/')
    fireEvent.click(within(nav).getByRole('button', { name: /Sam Rivera/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('signs out from their menu: the session ends on the server and the sign-in page returns', async () => {
    const requests = fakeServer(SIGNED_IN_WITH_FLEET)
    const nav = await openAt('/')
    fireEvent.click(within(nav).getByRole('button', { name: /Sam Rivera/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(await screen.findByLabelText('Password')).toBeTruthy()
    expect(requests.some(r => r.method === 'DELETE' && r.path === '/session')).toBe(true)
    expect(sessionStorage.getItem('csrfToken')).toBeNull()
  })

  it('can sign out from Your account too', async () => {
    fakeServer(SIGNED_IN_WITH_FLEET)
    await openAt('/account')
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByLabelText('Password')).toBeTruthy()
  })
})
