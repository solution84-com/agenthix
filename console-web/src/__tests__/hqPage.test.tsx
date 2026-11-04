import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostFigures, InstallFigures } from '@agenthix/core'
import { forgetCsrfToken } from '../api/csrf'
import { forgetHqSuspended } from '../forms/hqSuspend'
import type { FleetHost, FleetResponse } from '../pages/dashboard/types'
import { AddressPage } from '../pages/hq/AddressPage'
import { HqRoute } from '../pages/hq/HqRoute'
import { MaintenancePanelHost } from '../shell/MaintenancePanelHost'
import { fakeServer, type Route } from './fakeServer'
import { choose } from './maintenanceHarness'

const GB = 1000 ** 3
const NOW = new Date()
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const FP = 'c'.repeat(64)
const ADDRESS = 'https://hq.acme.example'

const hqInstall = (over: Partial<InstallFigures> = {}): InstallFigures => ({
  target: 'hq', version: '0.2.0', state: 'running', since: ago(21 * 86400_000), healthy: true, problem: null, ...over,
})
const figures = (hq: InstallFigures = hqInstall(), over: Partial<HostFigures> = {}): HostFigures => ({
  takenAt: NOW.toISOString(),
  machine: { name: 'hq-box', system: 'Ubuntu 24.04', dockerVersion: '27.3', hostServiceVersion: '0.2.0', upSince: ago(21 * 86400_000) },
  resources: { cpuLoad: 0.2, memory: { usedBytes: 9 * GB, totalBytes: 16 * GB }, disk: { freeBytes: 120 * GB, totalBytes: 200 * GB } },
  ceilings: { memoryBytesPerContainer: 4 * GB, cpusPerContainer: 2, processesPerContainer: 512, containersAtOnce: 6 },
  protections: { holding: true, rules: ['machine-ports'], checkedAt: ago(30_000), problem: null },
  installs: [hq, { target: 'site', version: '0.2.0', state: 'running', since: ago(86400_000), healthy: true, problem: null }],
  backups: { lastNightlyAt: ago(3600_000), lastNightlyOk: true, locationSet: true, lastCopyAt: ago(3000_000), lastExportAt: null, nightlyAt: '02:00' },
  frontDoor: { on: false, certificateExpiresAt: null, renewalProblem: null },
  scheduledChanges: 0,
  ...over,
})
const host = (over: Partial<FleetHost> = {}): FleetHost => ({
  fingerprint: FP, fingerprintShort: 'cccc', hostId: 'h', machineName: 'hq-box', siteName: 'hq-box', hqMachine: true, siteRegistered: false,
  connectedAt: ago(14 * 86400_000), online: true, since: ago(14 * 86400_000), leftByItself: false, leftAt: null,
  figures: figures(), figuresAt: NOW.toISOString(), agents: { running: 2, maxAtOnce: 6, reportedAt: NOW.toISOString() }, scheduled: [], move: null, ...over,
})

const SESSION: Route = { status: 200, body: { user: { id: 'u1', name: 'Sam Rivera' }, hq: { organisationName: 'Acme Robotics', address: ADDRESS } } }
const STATUS: Route = { status: 200, body: { machineName: 'hq-box', version: '0.2.0', hq: 'connected', fleetAdmins: 'some' } }
const answer = (state: 'pending' | 'done', result: unknown = null): Route => ({ status: state === 'pending' ? 202 : 200, body: { command: { id: 'c1', state, result, problem: null } } })
const ok = (op: string, result: unknown) => answer('done', { ok: true, op, result })
const refused = (op: string, message: string) => answer('done', { ok: false, op, refusal: { code: 'conflict', message } })
const fleet = (hosts: FleetHost[] = [host()]): FleetResponse => ({
  console: { machineName: 'hq-box', version: '0.2.0', fingerprintShort: 'cccc', hq: 'connected' },
  hq: { organisationName: 'Acme Robotics', address: ADDRESS }, hosts, disconnected: [],
})
const routes = (over: Record<string, Route | (() => Route)> = {}) => ({
  'GET /session': SESSION, 'GET /status': STATUS, [`GET /hosts/${FP}`]: { status: 200, body: { host: host() } },
  'GET /fleet': { status: 200, body: fleet() }, ...over,
})
const sent = (requests: ReturnType<typeof fakeServer>) => requests.filter(r => r.method === 'POST' && r.path === `/hosts/${FP}/commands`).map(r => (r.body as { request: unknown }).request)

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => { cleanup(); forgetHqSuspended(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

describe("HQ's page @SC-902", () => {
  it("says why HQ cannot start when its port is taken, on a machine the organisation runs itself @SC-1245", async () => {
    const why = 'HQ cannot start: port 7800 is held by another program on this machine. Free it or choose another port with agenthix hq port. Nothing was changed.'
    const down = host({ figures: figures(hqInstall({ state: 'stopped', healthy: false, problem: why })) })
    fakeServer(routes({ [`GET /hosts/${FP}`]: { status: 200, body: { host: down } }, 'GET /fleet': { status: 200, body: fleet([down]) } }))
    render(<HqRoute part={null} />)
    expect(await screen.findByText(new RegExp(why.slice(0, 40)))).toBeTruthy()
    expect(screen.getByText('Needs attention')).toBeTruthy()
  })

  it('is only HQ, then the machine it runs on: every action a button in the header', async () => {
    fakeServer(routes())
    render(<HqRoute part={null} />)
    expect(await screen.findByRole('heading', { name: "Acme Robotics' HQ", level: 1 })).toBeTruthy()
    expect(await screen.findByText(/^Healthy — people can sign in · up 21 days · on hq-box, with this Fleet Console$/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open HQ ↗' }).getAttribute('href')).toBe(ADDRESS)
    const header = screen.getAllByRole('button').map(b => b.textContent)
    expect(header).toEqual(['Plan maintenance…', 'Back up now', 'Erase…'])
    const hq = screen.getByRole('region', { name: 'HQ' })
    const reach = within(hq).getByRole('region', { name: 'How people reach it' })
    expect(within(reach).getByText(ADDRESS)).toBeTruthy()
    expect(within(reach).getByText('Your own web server')).toBeTruthy()
    expect(within(reach).getByRole('link', { name: 'Change' }).getAttribute('href')).toBe('/hq/address')
    expect(within(hq).getByRole('region', { name: 'Version' })).toBeTruthy()
    const own = within(hq).getByRole('link', { name: "Open hq-box's site ›" })
    expect(own.getAttribute('href')).toBe(`/sites/${FP}`)
    expect(within(hq).getByText(/HQ's own site: 2 of 6 runs/)).toBeTruthy()
    const machine = screen.getByRole('region', { name: 'The machine HQ runs on hq-box' })
    expect(within(machine).getByText('Fine')).toBeTruthy()
    expect(within(machine).getByText('Ubuntu 24.04 · Docker 27.3 · host service 0.2.0 · up 21 days')).toBeTruthy()
  })

  it('leaves out what the board leaves out: the fleet admin role, CPU load, when protections were checked, the notify box, the site\'s capacity', async () => {
    fakeServer(routes())
    render(<HqRoute part={null} />)
    await screen.findByRole('region', { name: 'How people reach it' })
    expect(screen.queryByText(/fleet-admin/)).toBeNull()
    expect(screen.queryByText(/Fleet admin role/)).toBeNull()
    expect(screen.queryByText(/CPU load/)).toBeNull()
    expect(screen.queryByText(/Checked .* ago/)).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByText(/Uploaded files/)).toBeNull()
    expect(screen.queryByText(/127\.0\.0\.1/)).toBeNull()
    expect(screen.queryByRole('region', { name: 'The site' })).toBeNull()
    expect(screen.queryByText(/Each run/)).toBeNull()
    expect(screen.queryByText(/Automatic fixes/)).toBeNull()
  })

  it('says how many sites are connected, its own included', async () => {
    const away = { ...host(), fingerprint: 'd'.repeat(64), machineName: 'lab-01', siteName: 'lab-01', hqMachine: false, siteRegistered: true, online: false }
    fakeServer(routes({ 'GET /fleet': { status: 200, body: fleet([host(), away]) } }))
    render(<HqRoute part={null} />)
    const card = await screen.findByRole('region', { name: 'Who depends on it' })
    expect(within(card).getByText('1 of 2 connected')).toBeTruthy()
    expect(within(card).getByText('1 not connected')).toBeTruthy()
  })

  it('with no backup location, says what is at stake and where to set one', async () => {
    const f = figures(hqInstall(), { backups: { lastNightlyAt: ago(3600_000), lastNightlyOk: true, locationSet: false, lastCopyAt: null, lastExportAt: null, nightlyAt: '02:00' } })
    fakeServer(routes({ 'GET /fleet': { status: 200, body: fleet([host({ figures: f })]) } }))
    render(<HqRoute part={null} />)
    const card = await screen.findByRole('region', { name: 'Backups' })
    expect(within(card).getByText('On this machine only')).toBeTruthy()
    expect(within(card).getByText('tonight 02:00')).toBeTruthy()
    expect(within(card).getByText(/If hq-box is lost, so are its backups\./)).toBeTruthy()
    expect(within(card).getByRole('link', { name: 'Set a backup location, or export a copy' }).getAttribute('href')).toBe('/hq/backups')
  })

  it("shows the host service's front door with its renewal trouble in one line", async () => {
    const f = figures(hqInstall(), { frontDoor: { on: true, certificateExpiresAt: '2030-10-20T00:00:00Z', renewalProblem: 'Renewing the certificate failed twice.' } })
    fakeServer(routes({ 'GET /fleet': { status: 200, body: fleet([host({ figures: f })]) } }))
    render(<HqRoute part={null} />)
    const card = await screen.findByRole('region', { name: 'How people reach it' })
    expect(within(card).getByText("The host service's front door")).toBeTruthy()
    expect(within(card).getByText('Renewal failing')).toBeTruthy()
  })

  it('Plan maintenance… opens the panel beside the page with Which HQ; Back up now opens its backups', async () => {
    window.history.replaceState(null, '', '/hq')
    fakeServer(routes())
    render(<><HqRoute part={null} /><MaintenancePanelHost /></>)
    fireEvent.click(await screen.findByRole('button', { name: 'Plan maintenance…' }))
    expect(window.location.pathname + window.location.search).toBe('/hq?panel=maintenance&which=hq')
    expect(await screen.findByRole('button', { name: 'Which: HQ' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'What: Choose what to do' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }))
    expect(window.location.pathname).toBe('/hq/backups')
  })

  it("without HQ's machine, says so", async () => {
    fakeServer(routes({ 'GET /fleet': { status: 200, body: fleet([]) } }))
    render(<HqRoute part={null} />)
    expect(await screen.findByText(/HQ's machine is not connected to this Fleet Console/)).toBeTruthy()
  })
})

describe('Suspend and resume @SC-910', () => {
  const suspendNow = async () => {
    window.history.replaceState(null, '', '/hq')
    render(<><HqRoute part={null} pollMs={5} /><MaintenancePanelHost pollMs={5} /></>)
    fireEvent.click(await screen.findByRole('button', { name: 'Plan maintenance…' }))
    await screen.findByRole('button', { name: 'Which: HQ' })
    choose('What', 'Suspend')
    expect((screen.getByLabelText('Now') as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Do it now' }))
  }

  it("suspends from Plan maintenance; a refusal shows the host service's own words", async () => {
    const requests = fakeServer(routes({ [`POST /hosts/${FP}/commands`]: refused('suspend', 'HQ is already suspended; nothing is lost.') }))
    await suspendNow()
    expect(await screen.findByText('HQ was not suspended')).toBeTruthy()
    expect(screen.getByText('HQ is already suspended; nothing is lost.')).toBeTruthy()
    expect(sent(requests)).toEqual([{ op: 'suspend', target: 'hq' }])
    expect(screen.queryByText('HQ suspended')).toBeNull()
  })

  it("once suspended, HQ's page offers Resume HQ, and the command on the machine for when it cannot reach it", async () => {
    const requests = fakeServer(routes({ [`POST /hosts/${FP}/commands`]: ok('suspend', { state: 'suspended' }) }))
    await suspendNow()
    expect(await screen.findByText('HQ suspended')).toBeTruthy()
    expect(screen.getByText(/Nobody can sign in and no agent runs/)).toBeTruthy()
    expect(screen.getAllByText('agenthix hq resume').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Resume HQ' }))
    await waitFor(() => expect(sent(requests)).toEqual([{ op: 'suspend', target: 'hq' }, { op: 'resume', target: 'hq' }]))
    await waitFor(() => expect(screen.queryByText('HQ suspended')).toBeNull())
  })

  it('reads as suspended when the machine goes quiet after it was asked: its answer cannot come back through HQ', async () => {
    let online = true
    fakeServer(routes({
      'GET /fleet': () => ({ status: 200, body: fleet([host({ online })]) }),
      [`POST /hosts/${FP}/commands`]: answer('pending'),
      'GET /commands/c1': answer('pending'),
    }))
    await suspendNow()
    await screen.findByText('Waiting for hq-box to answer…')
    online = false
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(await screen.findByText('HQ suspended')).toBeTruthy()
  })

  it('a suspended HQ in the figures shows since when', async () => {
    const f = figures(hqInstall({ state: 'suspended', healthy: false, since: ago(3600_000) }))
    fakeServer(routes({ 'GET /fleet': { status: 200, body: fleet([host({ figures: f })]) } }))
    render(<HqRoute part={null} />)
    expect(await screen.findByText('HQ suspended')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Erase…' })).toBeTruthy()
  })
})

describe('Erase @SC-911', () => {
  it("is confirmed only with HQ's address typed in, and sends the address", async () => {
    const requests = fakeServer(routes({ [`POST /hosts/${FP}/commands`]: ok('erase', { purgeAfter: '2030-11-12T00:00:00.000Z' }) }))
    render(<HqRoute part={null} pollMs={5} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Erase…' }))
    expect(screen.getByRole('heading', { name: 'Erase HQ on hq-box?' })).toBeTruthy()
    expect(screen.getByText(/won't see a notice unless you give notice/)).toBeTruthy()
    expect(screen.getByText('For 30 days from then, it can come back')).toBeTruthy()
    const confirm = screen.getByRole('button', { name: 'Erase HQ now' }) as HTMLButtonElement
    const typed = await screen.findByLabelText("Type HQ's address to confirm")
    fireEvent.change(typed, { target: { value: 'hq.acme.o' } })
    expect(confirm.disabled).toBe(true)
    fireEvent.change(typed, { target: { value: 'hq.acme.example' } })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    expect(await screen.findByText(/HQ erased — restorable until 12 Nov/)).toBeTruthy()
    expect(screen.getByText('agenthix hq restore')).toBeTruthy()
    expect(sent(requests)).toEqual([{ op: 'erase', target: 'hq', confirmAddress: ADDRESS }])
  })

  it('on a date, with notice: a scheduled change, and the countdown everyone sees', async () => {
    const requests = fakeServer(routes({ [`POST /hosts/${FP}/commands`]: ok('schedule', { change: { id: 'x' } }) }))
    render(<HqRoute part={null} pollMs={5} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Erase…' }))
    fireEvent.click(screen.getByLabelText('At a time…'))
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2030-10-17T18:00' } })
    expect(screen.getByText(/This HQ will be erased on 17 Oct 18:00 by a fleet admin/)).toBeTruthy()
    fireEvent.change(await screen.findByLabelText("Type HQ's address to confirm"), { target: { value: ADDRESS } })
    fireEvent.click(screen.getByRole('button', { name: 'Schedule the erase' }))
    expect(await screen.findByText('The erase is scheduled.')).toBeTruthy()
    expect(sent(requests)).toEqual([{
      op: 'schedule', at: new Date('2030-10-17T18:00').toISOString(), change: { op: 'erase', target: 'hq', confirmAddress: ADDRESS },
    }])
  })

  it("a refusal stays in the dialog, in the host service's words", async () => {
    fakeServer(routes({ [`POST /hosts/${FP}/commands`]: refused('erase', 'Not erased: the final backup did not complete, so nothing was removed.') }))
    render(<HqRoute part={null} pollMs={5} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Erase…' }))
    fireEvent.change(await screen.findByLabelText("Type HQ's address to confirm"), { target: { value: 'hq.acme.example' } })
    fireEvent.click(screen.getByRole('button', { name: 'Erase HQ now' }))
    expect(await screen.findByText('HQ was not erased')).toBeTruthy()
    expect(screen.getByText('Not erased: the final backup did not complete, so nothing was removed.')).toBeTruthy()
  })
})

describe('Address and front door @SC-915', () => {
  it('turning the front door on warns first, and No is the default', async () => {
    const requests = fakeServer(routes({ [`POST /hosts/${FP}/commands`]: ok('frontDoor.set', { on: true }) }))
    render(<AddressPage fingerprint={FP} pollMs={5} />)
    expect(await screen.findByText(ADDRESS)).toBeTruthy()
    fireEvent.click(screen.getByLabelText(/The host service's front door/))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const no = screen.getByRole('button', { name: 'No, keep my own web server' })
    expect(document.activeElement).toBe(no)
    expect(screen.getByText(/nothing else on hq-box can serve web traffic on them/)).toBeTruthy()
    fireEvent.click(no)
    expect(sent(requests)).toEqual([])
    fireEvent.click(screen.getByLabelText(/The host service's front door/))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, take ports 80 and 443' }))
    expect(await screen.findByText('The front door is on.')).toBeTruthy()
    expect(sent(requests)).toEqual([{ op: 'frontDoor.set', on: true, confirmPorts: true }])
  })

  it('refused while a port is in use: the words, Try again and Keep my own web server', async () => {
    const message = 'Refused: something on hq-box is already listening on port 443. Stop it first. Nothing changed.'
    const requests = fakeServer(routes({ [`POST /hosts/${FP}/commands`]: refused('frontDoor.set', message) }))
    render(<AddressPage fingerprint={FP} pollMs={5} />)
    fireEvent.click(await screen.findByLabelText(/The host service's front door/))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, take ports 80 and 443' }))
    expect(await screen.findByText('The front door was not turned on')).toBeTruthy()
    expect(screen.getByText(message)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(sent(requests)).toHaveLength(2))
    fireEvent.click(await screen.findByRole('button', { name: 'Keep my own web server' }))
    expect((screen.getByLabelText(/Your own web server/) as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByText('The front door was not turned on')).toBeNull()
  })

  it('Change… opens Plan maintenance on HQ, with Move chosen', async () => {
    fakeServer(routes())
    render(<AddressPage fingerprint={FP} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Change…' }))
    expect(window.location.pathname + window.location.search).toBe('/hq?panel=maintenance&which=hq&what=move')
  })
})
