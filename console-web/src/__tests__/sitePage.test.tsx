import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostFigures } from '@agenthix/core'
import { forgetCsrfToken } from '../api/csrf'
import { SitePage } from '../pages/site/SitePage'
import { MaintenancePanelHost } from '../shell/MaintenancePanelHost'
import type { FleetHost } from '../pages/dashboard/types'
import { fakeServer, fleetRoute } from './fakeServer'

const GB = 1000 ** 3
const GIB = 1024 ** 3
const NOW = new Date()
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const FP = 'a'.repeat(64)

function figures(over: Partial<HostFigures> = {}): HostFigures {
  return {
    takenAt: NOW.toISOString(),
    machine: { name: 'office-server', system: 'Ubuntu 24.04', dockerVersion: '27.3', hostServiceVersion: '0.2.0', upSince: ago(12 * 86400_000) },
    resources: { cpuLoad: 0.34, memory: { usedBytes: 9.1 * GIB, totalBytes: 32 * GIB }, disk: { freeBytes: 18 * GB, totalBytes: 200 * GB } },
    ceilings: { memoryBytesPerContainer: 4 * GIB, cpusPerContainer: 2, processesPerContainer: 512, containersAtOnce: 6 },
    protections: { holding: true, rules: ['machine-ports', 'published-ports', 'metadata-address'], checkedAt: ago(40_000), problem: null },
    installs: [{ target: 'site', version: '0.2.0', state: 'running', since: ago(86400_000), healthy: true, problem: null }],
    backups: { lastNightlyAt: ago(3600_000), lastNightlyOk: true, locationSet: false, lastCopyAt: null, lastExportAt: ago(41 * 86400_000), nightlyAt: '02:00' },
    frontDoor: { on: false, certificateExpiresAt: null, renewalProblem: null },
    scheduledChanges: 0,
    ...over,
  }
}

const host = (over: Partial<FleetHost> = {}): FleetHost => ({
  fingerprint: FP, fingerprintShort: 'aaaa', hostId: 'h', machineName: 'office-server', siteName: 'office-site', hqMachine: false,
  siteRegistered: true, connectedAt: ago(13 * 86400_000), online: true, since: ago(12 * 86400_000), leftByItself: false, leftAt: null,
  figures: figures(), figuresAt: NOW.toISOString(), agents: { running: 2, maxAtOnce: 6, reportedAt: NOW.toISOString() }, scheduled: [], move: null, ...over,
})

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

describe("a site's page @SC-900", () => {
  it('is named after its machine and tagged Site: the site, then the machine, in words', async () => {
    fakeServer({ [`GET /hosts/${FP}`]: { status: 200, body: { host: host() } } })
    render(<SitePage fingerprint={FP} />)
    expect(await screen.findByRole('heading', { name: 'office-server', level: 1 })).toBeTruthy()
    expect(screen.getByText('Site')).toBeTruthy()
    expect(screen.getByText('Needs attention')).toBeTruthy()
    const site = screen.getByRole('region', { name: 'The site' })
    expect(within(site).getByText('2 of 6 at once')).toBeTruthy()
    expect(within(site).getByText('4 GB memory · 2 processors · 512 processes')).toBeTruthy()
    expect(within(site).getByText('On this machine only')).toBeTruthy()
    expect(within(site).getByText(/If office-server is lost, so are its backups\./)).toBeTruthy()
    expect(within(site).getByRole('link', { name: 'Set a backup location, or export a copy' }).getAttribute('href')).toBe(`/sites/${FP}/backups`)
    expect(within(site).getByRole('region', { name: 'Version' })).toBeTruthy()
    const machine = screen.getByRole('region', { name: 'The machine' })
    expect(within(machine).getByText('Ubuntu 24.04 · Docker 27.3 · host service 0.2.0 · up 12 days')).toBeTruthy()
    expect(within(machine).getByText('The disk is 91% full, 18 GB left.')).toBeTruthy()
    expect(within(machine).getByText('Disk 91%')).toBeTruthy()
    expect(within(machine).getByText('In place')).toBeTruthy()
    expect(within(machine).getByText('Fleet admins are notified if it stops answering.')).toBeTruthy()
  })

  it('every action is a button in its header, and none is about HQ', async () => {
    fakeServer({ [`GET /hosts/${FP}`]: { status: 200, body: { host: host() } } })
    render(<SitePage fingerprint={FP} />)
    await screen.findByRole('heading', { name: 'office-server', level: 1 })
    const names = screen.getAllByRole('button').map(b => b.textContent)
    expect(names).toEqual(['Plan maintenance…', 'Back up now', 'Logs', 'Notify…', 'Disconnect…'])
    expect(screen.queryByText(/\bHQ's\b/)).toBeNull()
    expect(screen.queryByRole('link', { name: /Open HQ/ })).toBeNull()
    expect(screen.queryByText(/front door/i)).toBeNull()
    expect(screen.queryByText(/CPU load/)).toBeNull()
  })

  it("HQ's own site has the same page, tagged HQ's site, without what HQ's site cannot do on its own", async () => {
    const own = host({ hqMachine: true, machineName: 'machine-d', siteName: 'machine-d', figures: figures({ installs: [
      { target: 'hq', version: '0.2.0', state: 'running', since: ago(86400_000), healthy: true, problem: null },
      { target: 'site', version: '0.2.0', state: 'running', since: ago(86400_000), healthy: true, problem: null },
    ] }) })
    fakeServer({ [`GET /hosts/${FP}`]: { status: 200, body: { host: own } } })
    render(<SitePage fingerprint={FP} />)
    expect(await screen.findByRole('heading', { name: 'machine-d', level: 1 })).toBeTruthy()
    expect(screen.getByText("HQ's site")).toBeTruthy()
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['Plan maintenance…', 'Back up now', 'Logs'])
    expect(screen.getByRole('region', { name: 'The site' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'How people reach it' })).toBeNull()
    expect(screen.queryByText(/people can sign in/)).toBeNull()
    expect(within(screen.getByRole('region', { name: 'The machine' })).getByText(/Fleet admins are always notified/)).toBeTruthy()
  })

  it('has no control for the protections: they are a fact', async () => {
    fakeServer({ [`GET /hosts/${FP}`]: { status: 200, body: { host: host() } } })
    render(<SitePage fingerprint={FP} />)
    const card = (await screen.findByRole('region', { name: 'Protections' }))
    expect(within(card).queryAllByRole('button')).toHaveLength(0)
    expect(within(card).queryAllByRole('checkbox')).toHaveLength(0)
    // Only the link to Help explaining them.
    expect(within(card).queryAllByRole('link').filter(a => !a.getAttribute('href')?.startsWith('/help'))).toHaveLength(0)
  })

  it('says when the protections do not hold', async () => {
    const f = figures({ protections: { holding: false, rules: [], checkedAt: ago(10_000), problem: 'The firewall rule is missing.' } })
    fakeServer({ [`GET /hosts/${FP}`]: { status: 200, body: { host: host({ figures: f }) } } })
    render(<SitePage fingerprint={FP} />)
    const card = await screen.findByRole('region', { name: 'Protections' })
    expect(within(card).getByText('Not holding')).toBeTruthy()
    expect(within(card).getByText(/No new agent starts until they hold/)).toBeTruthy()
  })

  it('one door to its maintenance: Plan maintenance… opens the panel beside the page, with Which the site and What left to choose', async () => {
    window.history.replaceState(null, '', `/sites/${FP}`)
    fakeServer({ [`GET /hosts/${FP}`]: { status: 200, body: { host: host() } }, 'GET /fleet': fleetRoute([host()]) })
    render(<><SitePage fingerprint={FP} /><MaintenancePanelHost /></>)
    const length = window.history.length
    fireEvent.click(await screen.findByRole('button', { name: 'Plan maintenance…' }))
    expect(window.location.pathname + window.location.search).toBe(`/sites/${FP}?panel=maintenance&which=${FP}`)
    expect(window.history.length).toBe(length)
    expect(await screen.findByRole('button', { name: 'Which: office-server · Site' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'What: Choose what to do' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'office-server', level: 1 })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Plan maintenance' })).toBeNull()
    expect(window.location.pathname + window.location.search).toBe(`/sites/${FP}`)
  })

  it('Back up now opens its backups', async () => {
    fakeServer({ [`GET /hosts/${FP}`]: { status: 200, body: { host: host() } } })
    render(<SitePage fingerprint={FP} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Back up now' }))
    expect(window.location.pathname).toBe(`/sites/${FP}/backups`)
  })

  it('a machine not answering shows its last figures as old, and why', async () => {
    fakeServer({ [`GET /hosts/${FP}`]: { status: 200, body: { host: host({ online: false }) } } })
    render(<SitePage fingerprint={FP} />)
    expect(await screen.findByText('Not answering')).toBeTruthy()
    expect(screen.getByText(/These figures are from .*\. Not answering since/)).toBeTruthy()
  })

  it('without figures: says so instead of inventing them', async () => {
    fakeServer({ [`GET /hosts/${FP}`]: { status: 200, body: { host: host({ figures: null, figuresAt: null }) } } })
    render(<SitePage fingerprint={FP} />)
    expect(await screen.findByText('Waiting for its first figures.')).toBeTruthy()
  })

  it('an unknown machine', async () => {
    fakeServer({ [`GET /hosts/${FP}`]: { status: 404, body: { error: 'not_found', message: 'That machine is not connected to this Fleet Console.' } } })
    render(<SitePage fingerprint={FP} />)
    expect(await screen.findByText('That machine is not connected to this Fleet Console.')).toBeTruthy()
  })
})

describe('notify the fleet admins if this machine stops answering, from Notify… on its page @SC-901', () => {
  const LABEL = 'Notify the fleet admins if this machine stops answering'

  it('shows the machine’s setting and changes it, then reads the machine again', async () => {
    let notify = true
    const requests = fakeServer({
      [`GET /hosts/${FP}`]: () => ({ status: 200, body: { host: host({ notifyIfSilent: notify }) } }),
      [`PUT /hosts/${FP}/notify`]: req => { notify = (req.body as { notify: boolean }).notify; return { status: 200, body: { host: host({ notifyIfSilent: notify }) } } },
    })
    render(<SitePage fingerprint={FP} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Notify…' }))
    const box = await screen.findByRole('checkbox', { name: LABEL }) as HTMLInputElement
    expect(box.checked).toBe(true)
    fireEvent.click(box)
    await waitFor(() => expect(requests.filter(r => r.path === `/hosts/${FP}`).length).toBeGreaterThan(1))
    expect(requests.find(r => r.method === 'PUT')).toMatchObject({ path: `/hosts/${FP}/notify`, body: { notify: false } })
    expect((screen.getByRole('checkbox', { name: LABEL }) as HTMLInputElement).checked).toBe(false)
  })

  it('a refused change is put back, and says why', async () => {
    fakeServer({
      [`GET /hosts/${FP}`]: { status: 200, body: { host: host() } },
      [`PUT /hosts/${FP}/notify`]: { status: 409, body: { error: 'conflict', message: 'Not now.' } },
    })
    render(<SitePage fingerprint={FP} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Notify…' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: LABEL }))
    expect(await screen.findByText('Not now.')).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: LABEL }) as HTMLInputElement).checked).toBe(true)
  })
})

