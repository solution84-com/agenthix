import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostFigures } from '@agenthix/core'
import { App } from '../App'
import { forgetCsrfToken } from '../api/csrf'
import { DashboardPage } from '../pages/dashboard/DashboardPage'
import type { DisconnectedMachine, FleetHost, FleetResponse } from '../pages/dashboard/types'
import { fakeServer } from './fakeServer'

const GB = 1000 ** 3
const NOW = new Date()

const SITE: HostFigures['installs'][number] = { target: 'site', version: '0.2.0', state: 'running', since: NOW.toISOString(), healthy: true, problem: null }

function figures(diskUsed: number, installs: HostFigures['installs'] = [SITE]): HostFigures {
  return {
    takenAt: NOW.toISOString(),
    machine: { name: 'm', system: 'Linux', dockerVersion: '27', hostServiceVersion: '0.2.0', upSince: NOW.toISOString() },
    resources: { cpuLoad: 0.1, memory: { usedBytes: 30 * GB, totalBytes: 100 * GB }, disk: { freeBytes: (100 - diskUsed) * GB, totalBytes: 100 * GB } },
    ceilings: { memoryBytesPerContainer: GB, cpusPerContainer: 1, processesPerContainer: 100, containersAtOnce: 6 },
    protections: { holding: true, rules: [], checkedAt: NOW.toISOString(), problem: null },
    installs,
    backups: { lastNightlyAt: NOW.toISOString(), lastNightlyOk: true, locationSet: false, lastCopyAt: null, lastExportAt: null, nightlyAt: '02:00' },
    frontDoor: { on: false, certificateExpiresAt: null, renewalProblem: null },
    scheduledChanges: 0,
  }
}

function host(name: string, over: Partial<FleetHost> = {}): FleetHost {
  return {
    fingerprint: name.padEnd(64, '0'), fingerprintShort: name, hostId: name, machineName: name, siteName: name, hqMachine: false,
    siteRegistered: true, connectedAt: NOW.toISOString(), online: true, since: NOW.toISOString(), leftByItself: false, leftAt: null,
    figures: figures(40),
    figuresAt: NOW.toISOString(), agents: null, scheduled: [], move: null, ...over,
  }
}

const hqBox = host('hq-box', {
  hqMachine: true,
  figures: figures(30, [{ target: 'hq', version: '0.2.0', state: 'running', since: NOW.toISOString(), healthy: true, problem: null }]),
})

const fleet = (hosts: FleetHost[], hq: FleetResponse['console']['hq'] = 'connected', disconnected: DisconnectedMachine[] = []): FleetResponse => ({
  console: { machineName: 'hq-box', version: '0.2.0', fingerprintShort: 'abcd', hq }, hq: null, hosts, disconnected,
})
const order = (list: HTMLElement) => within(list).getAllByRole('article').map(a => a.getAttribute('aria-label'))
const upgrade = (siteName: string, at: string) => ({
  update: 'scheduled' as const, sentAt: NOW.toISOString(), reason: null,
  change: {
    id: `u-${siteName}`, kind: 'upgrade' as const, target: 'site' as const, siteName, machine: { name: siteName, fingerprint: siteName.padEnd(64, '0') },
    at, scheduledBy: { kind: 'maintenanceWindow' as const }, scheduledAt: NOW.toISOString(), state: 'scheduled' as const, detail: '0.3.0', expectedMinutes: 10,
  },
})

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  forgetCsrfToken()
  sessionStorage.clear()
})

describe('the dashboard', () => {
  it('puts what needs you on top, then the fleet with HQ as its hub, then the totals @SC-896', async () => {
    fakeServer({ 'GET /fleet': { status: 200, body: fleet([hqBox, host('office-server'), host('lab-01', { figures: figures(91) })]) } })
    render(<DashboardPage />)
    const needs = await screen.findByRole('region', { name: 'Needs you' })
    const fleetView = screen.getByRole('region', { name: 'The fleet' })
    const totals = screen.getByRole('region', { name: 'Totals' })
    expect(needs.compareDocumentPosition(fleetView) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(fleetView.compareDocumentPosition(totals) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const item = within(needs).getByRole('article', { name: 'lab-01 — disk 91% full' })
    expect(within(item).getByText(/Free space before it fills, or the site stops taking runs/)).toBeTruthy()
    fireEvent.click(within(item).getByRole('button', { name: 'Open lab-01' }))
    expect(window.location.pathname).toBe(`/sites/${'lab-01'.padEnd(64, '0')}`)

    const hub = within(fleetView).getByRole('region', { name: 'HQ' })
    const sites = within(fleetView).getByRole('list', { name: 'Sites' })
    expect(hub.compareDocumentPosition(sites) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('HQ and 3 sites · 1 needs you')).toBeTruthy()
  })

  it("draws every site under HQ in the menu's order — HQ's own first, then by name — whatever its state @SC-896", async () => {
    const long = new Date(Date.now() - 60 * 60_000).toISOString()
    fakeServer({ 'GET /fleet': { status: 200, body: fleet([host('zzz', { online: false, since: long }), host('aaa'), hqBox, host('lab', { online: false, since: long, stoppedAt: long })]) } })
    render(<DashboardPage />)
    const sites = await screen.findByRole('list', { name: 'Sites' })
    expect(order(sites)).toEqual(['hq-box', 'aaa', 'lab', 'zzz'])
    expect(within(screen.getByRole('article', { name: 'zzz' })).getByText('Not answering')).toBeTruthy()
    expect(within(screen.getByRole('article', { name: 'lab' })).getByText('Stopped')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Needs you' })).getByRole('article', { name: 'zzz — not answering' })).toBeTruthy()
  })

  it("says each site in one line: what it is, its runs, its disk, and a planned change or an overdue backup @SC-896", async () => {
    const at = new Date(NOW.getTime() + 2 * 86400_000)
    at.setHours(2, 0, 0, 0)
    const old = new Date(NOW.getTime() - 3 * 86400_000).toISOString()
    const late = figures(40)
    late.backups = { ...late.backups, lastNightlyAt: old }
    fakeServer({ 'GET /fleet': { status: 200, body: fleet([
      hqBox,
      host('office-server', { agents: { running: 2, maxAtOnce: 4, reportedAt: NOW.toISOString() }, scheduled: [upgrade('office-server', at.toISOString())] }),
      host('lab-01', { figures: late }),
    ]) } })
    render(<DashboardPage />)
    const office = await screen.findByRole('article', { name: 'office-server' })
    expect(within(office).getByText(/^Site · 2 of 4 runs · disk 40% · upgrade 0\.3\.0 .* 02:00$/)).toBeTruthy()
    expect(within(screen.getByRole('article', { name: 'lab-01' })).getByText('Site · disk 40% · not backed up for 3 days')).toBeTruthy()
    expect(within(screen.getByRole('article', { name: 'hq-box' })).getByText("HQ's site · disk 30%")).toBeTruthy()
  })

  it('gives the totals: agents running, the next change, backups kept off their machine @SC-896', async () => {
    const located = figures(40)
    located.backups = { ...located.backups, locationSet: true }
    fakeServer({ 'GET /fleet': { status: 200, body: fleet([hqBox, host('office-server', { figures: located }), host('lab-01')]) } })
    render(<DashboardPage />)
    const totals = await screen.findByRole('region', { name: 'Totals' })
    expect(within(totals).getByText('Agents running')).toBeTruthy()
    expect(within(totals).getByText('Next maintenance')).toBeTruthy()
    expect(within(totals).getByText('Nothing is planned')).toBeTruthy()
    const backups = within(totals).getByText('Backups').parentElement!
    expect(within(backups).getByText('1 of 3')).toBeTruthy()
    expect(within(backups).getByText('kept off their machine, in a backup location')).toBeTruthy()
  })

  it('past twenty sites, draws them as a compact list under HQ, with a search @SC-896', async () => {
    const many = Array.from({ length: 21 }, (_, i) => host(`lab-${String(i + 1).padStart(2, '0')}`))
    fakeServer({ 'GET /fleet': { status: 200, body: fleet([hqBox, ...many]) } })
    render(<DashboardPage />)
    const view = await screen.findByRole('region', { name: 'The fleet' })
    expect(within(view).getByText('22 sites')).toBeTruthy()
    fireEvent.change(within(view).getByRole('searchbox', { name: 'Find a site' }), { target: { value: 'lab-2' } })
    expect(order(within(view).getByRole('list', { name: 'Sites' }))).toEqual(['lab-20', 'lab-21'])
    fireEvent.change(within(view).getByRole('searchbox', { name: 'Find a site' }), { target: { value: 'nothing' } })
    expect(within(view).getByText('No site matches "nothing".')).toBeTruthy()
  })

  it('with twenty sites or fewer, draws them all, with no search @SC-896', async () => {
    fakeServer({ 'GET /fleet': { status: 200, body: fleet([hqBox, host('office-server')]) } })
    render(<DashboardPage />)
    const view = await screen.findByRole('region', { name: 'The fleet' })
    expect(within(view).queryByRole('searchbox')).toBeNull()
  })

  it('Add a site leads to its page: a new site, or a restore @SC-896', async () => {
    fakeServer({
      'GET /status': { status: 200, body: { machineName: 'hq-box', version: '0.2.0', hq: 'connected', fleetAdmins: 'some' } },
      'GET /session': { status: 200, body: { user: { id: 'u1', name: 'Sam Rivera' } } },
      'GET /fleet': { status: 200, body: fleet([hqBox]) },
    })
    window.history.replaceState(null, '', '/fleet')
    render(<App />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Add a site' }))[0])
    expect(window.location.pathname).toBe('/fleet/add')
    expect(await screen.findByText('What are you adding?')).toBeTruthy()
  })

  it("with only HQ's machine: the hub, its own site, and a line inviting a second site @SC-896", async () => {
    fakeServer({ 'GET /fleet': { status: 200, body: fleet([hqBox]) } })
    render(<DashboardPage />)
    await screen.findByRole('region', { name: 'HQ' })
    expect(screen.getByRole('article', { name: 'hq-box' })).toBeTruthy()
    expect(screen.getByText(/HQ has one site so far, on its own machine/)).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Needs you' })).toBeNull()
  })

  it('with no machine at all: says so and offers to add one @SC-896', async () => {
    fakeServer({ 'GET /fleet': { status: 200, body: fleet([]) } })
    render(<DashboardPage />)
    expect(await screen.findByText('No machine is connected yet.')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'HQ' })).toBeNull()
  })

  it('when HQ does not answer, it needs you first, and the fleet shows what was last known @SC-896', async () => {
    fakeServer({ 'GET /fleet': { status: 200, body: fleet([hqBox, host('laptop')], 'disconnected') } })
    render(<DashboardPage />)
    const needs = await screen.findByRole('region', { name: 'Needs you' })
    const first = within(needs).getAllByRole('article')[0]
    expect(first.getAttribute('aria-label')).toBe('HQ is not answering')
    fireEvent.click(within(first).getByRole('button', { name: 'Open HQ' }))
    expect(window.location.pathname).toBe('/hq')
    expect(screen.getByRole('article', { name: 'laptop' })).toBeTruthy()
  })

  it('when the Fleet Console cannot be read, says so and can try again @SC-896', async () => {
    let answer = false
    fakeServer({ 'GET /fleet': () => answer ? { status: 200, body: fleet([hqBox]) } : { status: 500, body: { error: 'failed', message: 'It broke.' } } })
    render(<DashboardPage />)
    expect(await screen.findByText('The fleet could not be read')).toBeTruthy()
    answer = true
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('region', { name: 'HQ' })).toBeTruthy()
    expect(screen.queryByText('The fleet could not be read')).toBeNull()
  })

  it('reads again every 15 seconds, and when the window comes back to the front @SC-896', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const all = fakeServer({ 'GET /fleet': { status: 200, body: fleet([hqBox]) } })
    // The Cloud group reads its own routes once; only the fleet is read again.
    const requests = { get length() { return all.filter(r => r.path === '/fleet').length } }
    render(<DashboardPage />)
    await waitFor(() => expect(requests).toHaveLength(1))
    await act(async () => { vi.advanceTimersByTime(15_000) })
    expect(requests).toHaveLength(2)
    await act(async () => { vi.advanceTimersByTime(14_000) })
    expect(requests).toHaveLength(2)
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(requests).toHaveLength(3)
  })

  it('a machine disconnected here stays listed, by its own name: who, when, and adding it again or removing it from the list @SC-898', async () => {
    const at = new Date(NOW)
    at.setHours(10, 22, 0, 0)
    const gone: DisconnectedMachine = {
      id: 'd-1', fingerprint: 'f'.repeat(64), machineName: 'office-server', siteName: 'office-server',
      by: { userId: 'u1', name: 'Sam Rivera' }, at: at.toISOString(),
    }
    let listed = [gone]
    const requests = fakeServer({
      'GET /fleet': () => ({ status: 200, body: fleet([hqBox], 'connected', listed) }),
      'DELETE /fleet/disconnected/d-1': () => { listed = []; return { status: 204 } },
    })
    render(<DashboardPage />)
    const left = await screen.findByRole('region', { name: 'Left the fleet' })
    const card = within(left).getByRole('article', { name: 'office-server' })
    expect(within(card).getByText('Disconnected')).toBeTruthy()
    expect(within(card).queryByText(/ on /)).toBeNull()
    expect(within(card).getByText('Disconnected by Sam Rivera today 10:22. Its site no longer takes part in HQ. To manage it again, add it with a new code.')).toBeTruthy()

    fireEvent.click(within(card).getByRole('button', { name: 'Remove from the list' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Left the fleet' })).toBeNull())
    expect(requests.some(r => r.method === 'DELETE' && r.path === '/fleet/disconnected/d-1')).toBe(true)
  })

  it('a machine a restore replaced says so, names its site by the new machine, and can be removed from the list @SC-898', async () => {
    const at = new Date(NOW)
    at.setHours(20, 33, 0, 0)
    fakeServer({
      'GET /fleet': { status: 200, body: fleet([hqBox], 'connected', [{
        id: 'd-2', fingerprint: 'e'.repeat(64), machineName: 'machine-b', siteName: 'machine-b',
        by: { userId: 'u1', name: 'Dana Lee' }, at: at.toISOString(), replacedBy: { machineName: 'machine-a' },
      }]) },
    })
    render(<DashboardPage />)
    const card = await screen.findByRole('article', { name: 'machine-b' })
    expect(within(card).getByText('Replaced')).toBeTruthy()
    expect(within(card).getByText('Replaced today 20:33: its site was restored onto machine-a, and is named machine-a now. HQ refuses this machine. It stays listed until you remove it from the list; nothing on the machine changes.')).toBeTruthy()
    expect(within(card).queryByText(/Disconnected by/)).toBeNull()
    expect(within(card).getByRole('button', { name: 'Remove from the list' })).toBeTruthy()
    expect(within(card).queryByRole('button', { name: 'Add it again' })).toBeNull()
  })

  it('Add it again leads to Add a site @SC-898', async () => {
    fakeServer({
      'GET /fleet': { status: 200, body: fleet([hqBox], 'connected', [{
        id: 'd-1', fingerprint: 'f'.repeat(64), machineName: 'office-server', siteName: 'office-server', by: { userId: 'u1', name: 'Sam Rivera' }, at: NOW.toISOString(),
      }]) },
    })
    window.history.replaceState(null, '', '/fleet')
    render(<DashboardPage />)
    fireEvent.click(within(await screen.findByRole('article', { name: 'office-server' })).getByRole('button', { name: 'Add it again' }))
    expect(window.location.pathname).toBe('/fleet/add')
  })
})
