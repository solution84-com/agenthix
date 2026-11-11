import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetCsrfToken } from '../api/csrf'
import { forgetHqSuspended } from '../forms/hqSuspend'
import { useHqUpgradeUnderWay } from '../forms/HqUpgradeNotice'
import { forgetHqUpgrade, noteHqUpgrade } from '../forms/hqUpgrade'
import type { FleetHost } from '../pages/dashboard/types'
import { fakeServer, fleetRoute, type Request } from './fakeServer'
import { choose, dropDown, figures, fleetHost as host, formSent, inDays, openAt, optionsOf, panelAddress, running } from './maintenanceHarness'

const HQ_FP = 'c'.repeat(64)
const FP = 'a'.repeat(64)
const LAPTOP = 'b'.repeat(64)
const HOSTS = [
  host(FP, 'office-server'),
  host(HQ_FP, 'hq-box', { hqMachine: true, figures: figures([running('hq'), running('site')]) }),
  host(LAPTOP, 'laptop', { online: false }),
]
const OK = { status: 200, body: { command: { id: 'k1', state: 'done', result: { ok: true, op: 'upgrade', result: { version: '0.3.0', rolledBack: false } }, problem: null } } }
const PENDING = { status: 202, body: { command: { id: 'k1', state: 'pending', result: null, problem: null } } }
const sent = (requests: Request[], fp: string) => requests.filter(r => r.method === 'POST' && r.path === `/hosts/${fp}/commands`).map(r => (r.body as { request: unknown }).request)
const atATime = (hour: number) => {
  fireEvent.click(screen.getByLabelText('At a time…'))
  fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: inDays(3, hour) } })
}
const search = () => new URLSearchParams(window.location.search)

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => { cleanup(); forgetHqUpgrade(); forgetHqSuspended(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

describe('Plan maintenance: Which and What, always there, nothing starts over @SC-908', () => {
  it('Which lists HQ, then every site after its machine with its tag', async () => {
    fakeServer({ 'GET /fleet': fleetRoute(HOSTS) })
    openAt(`/maintenance${panelAddress()}`)
    expect(await screen.findByRole('dialog', { name: 'Plan maintenance' })).toBeTruthy()
    await screen.findByRole('button', { name: 'Which: Choose HQ or a site' })
    expect(optionsOf('Which')).toEqual(['HQ', "hq-box · HQ's site", 'laptop · Site', 'office-server · Site'])
    expect((dropDown('What') as HTMLButtonElement).disabled).toBe(true)
  })

  it('a long Which can be searched', async () => {
    const many = Array.from({ length: 9 }, (_, i) => host(String(i).repeat(64), `lab-${String(i).padStart(2, '0')}`))
    fakeServer({ 'GET /fleet': fleetRoute(many) })
    openAt(`/maintenance${panelAddress()}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Which: Choose HQ or a site' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find HQ or a site' }), { target: { value: 'lab-07' } })
    expect(screen.getAllByRole('option').map(o => o.getAttribute('aria-label'))).toEqual(['lab-07 · Site'])
  })

  it('changing What keeps Which, swaps the fields, and keeps what was typed in each, and When', async () => {
    fakeServer({ 'GET /fleet': fleetRoute(HOSTS) })
    openAt(`/sites/${FP}${panelAddress(FP)}`)
    await screen.findByRole('button', { name: 'Which: office-server · Site' })
    expect(optionsOf('What')).toEqual(['Upgrade', 'Change capacity', 'Move', 'Restore a backup'])
    choose('What', 'Change capacity')
    fireEvent.change(screen.getByLabelText('Runs at once'), { target: { value: '9' } })
    atATime(3)
    choose('What', 'Upgrade')
    expect(dropDown('Which').getAttribute('aria-label')).toBe('Which: office-server · Site')
    expect(screen.queryByLabelText('Runs at once')).toBeNull()
    expect((screen.getByLabelText('At a time…') as HTMLInputElement).checked).toBe(true)
    fireEvent.change(screen.getByLabelText('Upgrade to version'), { target: { value: '0.3.0' } })
    choose('What', 'Change capacity')
    expect((screen.getByLabelText('Runs at once') as HTMLInputElement).value).toBe('9')
    choose('What', 'Upgrade')
    expect((screen.getByLabelText('Upgrade to version') as HTMLInputElement).value).toBe('0.3.0')
    expect(search().get('which')).toBe(FP)
    expect(search().get('what')).toBe('upgrade')
  })

  it('changing Which keeps What when the new thing allows it, and clears it with a word why when not', async () => {
    fakeServer({ 'GET /fleet': fleetRoute(HOSTS) })
    openAt(`/hq${panelAddress('hq', 'capacity')}`)
    await screen.findByRole('button', { name: 'What: Change capacity' })
    choose('Which', 'office-server · Site')
    expect(dropDown('What').getAttribute('aria-label')).toBe('What: Change capacity')
    expect(screen.getByRole('form', { name: 'Change capacity' })).toBeTruthy()
    choose('Which', 'HQ')
    choose('What', 'Suspend')
    choose('Which', 'office-server · Site')
    expect(dropDown('What').getAttribute('aria-label')).toBe('What: Choose what to do')
    expect(screen.getByText('office-server does not offer Suspend.')).toBeTruthy()
    expect(search().get('what')).toBeNull()
    choose('Which', "hq-box · HQ's site")
    expect(optionsOf('What')).toEqual(['Change capacity'])
    expect(screen.getByText(/upgrades and moves with HQ/)).toBeTruthy()
  })

  it("the button's words follow When, the same for every kind; Suspend's is the danger kind", async () => {
    fakeServer({ 'GET /fleet': fleetRoute(HOSTS) })
    openAt(`/hq${panelAddress('hq', 'upgrade')}`)
    expect(await screen.findByRole('button', { name: 'Do it now' })).toBeTruthy()
    expect((screen.getByLabelText('Now') as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByLabelText('At a time…'))
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: inDays(2, 2) } })
    const day = new Date(inDays(2, 2)).toLocaleString('en-GB', { weekday: 'short' })
    expect(screen.getByRole('button', { name: `Schedule for ${day} 02:00` })).toBeTruthy()
    expect(screen.getByText(/Members whose work it affects see a notice from now/)).toBeTruthy()
    choose('What', 'Suspend')
    const button = screen.getByRole('button', { name: `Schedule for ${day} 02:00` })
    expect(button.className).toContain('danger')
    fireEvent.click(screen.getByLabelText('Now'))
    expect(screen.getByRole('button', { name: 'Do it now' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Change…/ })).toBeNull()
  })

  it("an answer that comes while another form is shown is there on coming back", async () => {
    let answer: typeof PENDING | typeof OK = PENDING
    fakeServer({ 'GET /fleet': fleetRoute(HOSTS), [`POST /hosts/${FP}/commands`]: PENDING, 'GET /commands/k1': () => answer })
    openAt(`/sites/${FP}${panelAddress(FP, 'capacity')}`, 5)
    fireEvent.click(await screen.findByRole('button', { name: 'Do it now' }))
    expect(await screen.findByRole('button', { name: 'Waiting for office-server to answer…' })).toBeTruthy()
    choose('What', 'Upgrade')
    answer = OK
    await new Promise(resolve => setTimeout(resolve, 30))
    choose('What', 'Change capacity')
    await formSent()
  })

  it('Escape, the close button and a click beside it close it, and leave the page where it was', async () => {
    fakeServer({ 'GET /fleet': fleetRoute(HOSTS) })
    openAt(`/maintenance${panelAddress(FP, 'upgrade')}`)
    expect(await screen.findByRole('heading', { name: 'Maintenance' })).toBeTruthy()
    await screen.findByRole('dialog', { name: 'Plan maintenance' })
    fireEvent.click(dropDown('What'))
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Plan maintenance' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Plan maintenance' })).toBeNull()
    expect(window.location.pathname + window.location.search).toBe('/maintenance')
    expect(screen.getByRole('heading', { name: 'Maintenance' })).toBeTruthy()

    act(() => { window.history.replaceState(null, '', `/maintenance${panelAddress(FP)}`); window.dispatchEvent(new PopStateEvent('popstate')) })
    fireEvent.click(await screen.findByRole('button', { name: 'Close Plan maintenance' }))
    expect(window.location.search).toBe('')
    act(() => { window.history.replaceState(null, '', `/maintenance${panelAddress(FP)}`); window.dispatchEvent(new PopStateEvent('popstate')) })
    fireEvent.click(await screen.findByTestId('maintenance-outside'))
    expect(window.location.search).toBe('')
    expect(window.location.pathname).toBe('/maintenance')
  })
})

describe('Plan maintenance: the work itself @SC-908', () => {
  it("HQ, now: upgrade, sent to HQ's machine for HQ", async () => {
    const requests = fakeServer({ 'GET /fleet': fleetRoute(HOSTS), [`POST /hosts/${HQ_FP}/commands`]: OK })
    openAt(`/hq${panelAddress('hq', 'upgrade')}`, 1)
    expect(await screen.findByText(/HQ runs 0\.2\.0\. HQ's own site upgrades with it/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Upgrade to version'), { target: { value: '0.2.0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Do it now' }))
    expect(await screen.findByText('It runs 0.2.0 already.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Upgrade to version'), { target: { value: '0.3.0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Do it now' }))
    await formSent()
    expect(sent(requests, HQ_FP)).toEqual([{ op: 'upgrade', target: 'hq', version: '0.3.0' }])
  })

  it("HQ, at a time: suspend, held by HQ's machine until then", async () => {
    const requests = fakeServer({ 'GET /fleet': fleetRoute(HOSTS), [`POST /hosts/${HQ_FP}/commands`]: OK })
    openAt(`/hq${panelAddress('hq', 'suspend')}`, 1)
    await screen.findByRole('form', { name: 'Suspend HQ' })
    atATime(3)
    fireEvent.click(screen.getByRole('button', { name: /^Schedule for / }))
    await formSent()
    const [request] = sent(requests, HQ_FP) as { op: string; at: string; change: unknown }[]
    expect(request).toMatchObject({ op: 'schedule', change: { op: 'suspend', target: 'hq' } })
    expect(new Date(request.at).getHours()).toBe(3)
  })

  it("HQ, now: suspend reads as done once HQ's machine goes quiet, since its answer cannot come back through HQ", async () => {
    let online = true
    fakeServer({
      'GET /fleet': () => fleetRoute(HOSTS.map(h => (h.hqMachine ? { ...h, online } : h))),
      [`POST /hosts/${HQ_FP}/commands`]: PENDING,
      'GET /commands/k1': PENDING,
    })
    openAt(`/hq${panelAddress('hq', 'suspend')}`, 5)
    fireEvent.click(await screen.findByRole('button', { name: 'Do it now' }))
    expect(await screen.findByRole('button', { name: 'Waiting for hq-box to answer…' })).toBeTruthy()
    online = false
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    await formSent()
  })

  it('HQ, now: an upgrade whose answer cannot come back through HQ says HQ restarts, and ends when HQ answers on it', async () => {
    let hq: FleetHost = HOSTS[1]
    fakeServer({
      'GET /fleet': () => fleetRoute(HOSTS.map(h => (h.hqMachine ? hq : h))),
      [`POST /hosts/${HQ_FP}/commands`]: PENDING,
      'GET /commands/k1': PENDING,
    })
    openAt(`/hq${panelAddress('hq', 'upgrade')}`, 5)
    fireEvent.change(await screen.findByLabelText('Upgrade to version'), { target: { value: '0.3.0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Do it now' }))
    expect(await screen.findByRole('button', { name: 'Waiting for hq-box to answer…' })).toBeTruthy()
    hq = { ...hq, online: false }
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    await formSent()
    hq = { ...hq, online: true, figures: figures([{ ...running('hq'), version: '0.3.0' }, running('site')]) }
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    await formSent()
  })

  it("HQ's page says an upgrade asked now is under way until HQ answers on the new version", () => {
    noteHqUpgrade('0.3.0')
    const Under = ({ host: h }: { host: FleetHost }) => <>{useHqUpgradeUnderWay(h)?.version ?? 'not under way'}</>
    const { rerender } = render(<Under host={{ ...HOSTS[1], online: false }} />)
    expect(screen.getByText('0.3.0')).toBeTruthy()
    rerender(<Under host={{ ...HOSTS[1], figures: figures([{ ...running('hq'), version: '0.3.0' }, running('site')]) }} />)
    expect(screen.getByText('not under way')).toBeTruthy()
  })

  it('a site, now: capacity, sent to its machine', async () => {
    const requests = fakeServer({ 'GET /fleet': fleetRoute(HOSTS), [`POST /hosts/${FP}/commands`]: OK })
    openAt(`/maintenance${panelAddress()}`, 1)
    await screen.findByRole('button', { name: 'Which: Choose HQ or a site' })
    choose('Which', 'office-server · Site')
    choose('What', 'Change capacity')
    fireEvent.change(screen.getByLabelText('Runs at once'), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Do it now' }))
    await formSent()
    expect(sent(requests, FP)).toEqual([{ op: 'capacity.set', ceilings: { memoryBytesPerContainer: 4 * 1024 ** 3, cpusPerContainer: 2, processesPerContainer: 512, containersAtOnce: 8 } }])
  })

  it('a site, at a time: upgrade of the site, scheduled', async () => {
    const requests = fakeServer({ 'GET /fleet': fleetRoute(HOSTS), [`POST /hosts/${FP}/commands`]: OK })
    openAt(`/sites/${FP}${panelAddress(FP, 'upgrade')}`, 1)
    fireEvent.change(await screen.findByLabelText('Upgrade to version'), { target: { value: '0.3.0' } })
    atATime(2)
    fireEvent.click(screen.getByRole('button', { name: /^Schedule for / }))
    await formSent()
    expect(sent(requests, FP)[0]).toMatchObject({ op: 'schedule', change: { op: 'upgrade', target: 'site', version: '0.3.0' } })
  })

  it('a site that is not answering says why nothing can reach it, and offers no button', async () => {
    const requests = fakeServer({ 'GET /fleet': fleetRoute(HOSTS) })
    openAt(`/maintenance${panelAddress(LAPTOP, 'upgrade')}`)
    const panel = await screen.findByRole('dialog', { name: 'Plan maintenance' })
    expect(await screen.findByText('laptop is not answering, so nothing can reach it now.')).toBeTruthy()
    expect(panel).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Do it now' })).toBeNull()
    expect(requests.some(r => r.method === 'POST')).toBe(false)
  })
})

describe('the older addresses of each kind of work @SC-908', () => {
  it("a site's /resize opens its page with the panel, the site and Change capacity chosen", async () => {
    fakeServer({ 'GET /fleet': fleetRoute(HOSTS) })
    openAt(`/sites/${FP}/resize`)
    await waitFor(() => expect(window.location.pathname).toBe(`/sites/${FP}`))
    expect(search().get('panel')).toBe('maintenance')
    expect(await screen.findByRole('button', { name: 'Which: office-server · Site' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'What: Change capacity' })).toBeTruthy()
  })

  it("HQ's, also from the older address of HQ's machine", async () => {
    fakeServer({ 'GET /fleet': fleetRoute(HOSTS) })
    openAt(`/fleet/${HQ_FP}/upgrade`)
    expect(await screen.findByRole('button', { name: 'Which: HQ' })).toBeTruthy()
    expect(screen.getByRole('form', { name: 'Upgrade' })).toBeTruthy()
    cleanup()
    openAt('/hq/suspend')
    await waitFor(() => expect(window.location.pathname).toBe('/hq'))
    expect(await screen.findByRole('form', { name: 'Suspend HQ' })).toBeTruthy()
  })

  it('Changes and Scheduled go to Maintenance, Make a change to its panel, and a site\'s old backups address to Backups', async () => {
    fakeServer({ 'GET /fleet': fleetRoute(HOSTS), [`GET /hosts/${FP}`]: { status: 200, body: { host: HOSTS[0] } } })
    openAt('/scheduled')
    await waitFor(() => expect(window.location.pathname).toBe('/maintenance'))
    cleanup()
    openAt('/changes')
    await waitFor(() => expect(window.location.pathname).toBe('/maintenance'))
    cleanup()
    openAt(`/changes/new?thing=${FP}&change=capacity`)
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe(`/maintenance?panel=maintenance&which=${FP}&what=capacity`))
    cleanup()
    openAt(`/fleet/${FP}/backups`)
    await waitFor(() => expect(window.location.pathname).toBe(`/backups/${FP}`))
  })
})
