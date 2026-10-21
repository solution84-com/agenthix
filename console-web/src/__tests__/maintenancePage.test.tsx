import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduledChange, ScheduledChangeNotice, ScheduledChangeUpdate } from '@agenthix/core'
import { forgetCsrfToken } from '../api/csrf'
import type { FleetHost, FleetResponse } from '../pages/dashboard/types'
import { MaintenancePage } from '../pages/maintenance/MaintenancePage'
import { fakeServer } from './fakeServer'

const FP = 'a'.repeat(64)
const FP2 = 'b'.repeat(64)
const hours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()

const change = (over: Partial<ScheduledChange> = {}): ScheduledChange => ({
  id: 'c1', kind: 'upgrade', target: 'hq', siteName: 'acme', machine: { name: 'hq-box', fingerprint: FP },
  at: hours(48), scheduledBy: { kind: 'fleetAdmin', userId: 'u1', name: 'Sam Rivera' }, scheduledAt: hours(-24),
  state: 'scheduled', detail: '0.3.0', expectedMinutes: 10, ...over,
})
const notice = (c: ScheduledChange, update: ScheduledChangeUpdate, sentAt = hours(-24), reason: string | null = null): ScheduledChangeNotice => ({ update, change: c, sentAt, reason })
const host = (scheduled: ScheduledChangeNotice[], over: Partial<FleetHost> = {}): FleetHost => ({
  fingerprint: FP, fingerprintShort: 'aaaa', hostId: 'h', machineName: 'hq-box', siteName: 'acme', hqMachine: true,
  siteRegistered: true, connectedAt: hours(-300), online: true, since: null, leftByItself: false, leftAt: null,
  figures: null, figuresAt: null, agents: null, scheduled, move: null, ...over,
})
const fleet = (hosts: FleetHost[]): FleetResponse => ({
  console: { machineName: 'hq-box', version: '0.2.0', fingerprintShort: 'aaaa', hq: 'connected' }, hq: null, hosts, disconnected: [],
})

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

const OK = { status: 200, body: { command: { id: 'k1', state: 'done', result: { ok: true, data: {} }, problem: null } } }

describe('Maintenance @SC-907', () => {
  it('lists what is planned and what was done recently, each named for what it does', async () => {
    const up = change()
    const cloud = change({ id: 'c2', kind: 'upgrade', target: 'site', machine: { name: 'hel-2', fingerprint: FP2 }, scheduledBy: { kind: 'cloud' } })
    const rolled = change({ id: 'c3', kind: 'upgrade', target: 'site', state: 'rolledBack', at: hours(-30), machine: { name: 'office-server', fingerprint: FP2 }, detail: '0.2.0' })
    fakeServer({ 'GET /fleet': { status: 200, body: fleet([
      host([notice(up, 'scheduled')]),
      host([notice(cloud, 'scheduled'), notice(rolled, 'failed', hours(-29), 'the site did not come up healthy')], { fingerprint: FP2, hqMachine: false, machineName: 'hel-2' }),
    ]) } })
    render(<MaintenancePage />)
    expect(await screen.findByText('Planned · 2')).toBeTruthy()
    const first = screen.getByRole('article', { name: 'Upgrade HQ to 0.3.0' })
    expect(within(first).getByText(/by Sam Rivera/)).toBeTruthy()
    expect(within(first).getByText(/about 10 minutes/)).toBeTruthy()
    expect(within(first).getByText(/members told from now/)).toBeTruthy()
    expect(within(first).getByRole('button', { name: 'Change time' })).toBeTruthy()
    const theirs = screen.getByRole('article', { name: 'Upgrade hel-2 to 0.3.0' })
    expect(within(theirs).getByText('Cloud')).toBeTruthy()
    expect(within(theirs).queryByRole('button', { name: 'Cancel' })).toBeNull()
    const ended = screen.getByRole('article', { name: 'Upgrade office-server to 0.2.0' })
    expect(within(ended).getByText('Failed — rolled back')).toBeTruthy()
    expect(within(ended).getByText('the site did not come up healthy')).toBeTruthy()
    expect(within(ended).getByRole('list', { name: "The upgrade's steps" })).toBeTruthy()
  })

  it('says so when nothing is planned, and + Plan maintenance opens its panel beside the list', async () => {
    fakeServer({ 'GET /fleet': { status: 200, body: fleet([host([])]) } })
    render(<MaintenancePage />)
    expect(screen.getByRole('heading', { name: 'Maintenance' })).toBeTruthy()
    expect(screen.getByText('Upgrades, moves and other work on HQ and the sites: what is planned, and when members are told')).toBeTruthy()
    expect(await screen.findByText('Nothing is planned.')).toBeTruthy()
    window.history.replaceState(null, '', '/maintenance')
    fireEvent.click(screen.getByRole('button', { name: '+ Plan maintenance' }))
    expect(window.location.pathname + window.location.search).toBe('/maintenance?panel=maintenance')
  })

  it('cancels planned maintenance on the machine that holds it, after asking', async () => {
    const requests = fakeServer({
      'GET /fleet': { status: 200, body: fleet([host([notice(change(), 'scheduled')])]) },
      [`POST /hosts/${FP}/commands`]: OK,
    })
    render(<MaintenancePage pollMs={1} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(requests.some(r => r.method === 'POST')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel it' }))
    await waitFor(() => expect(requests.find(r => r.method === 'POST')?.body).toEqual({ request: { op: 'schedule.cancel', changeId: 'c1' } }))
  })

  it('changes the time, and refuses one too near for members to be told @SC-909', async () => {
    const requests = fakeServer({
      'GET /fleet': { status: 200, body: fleet([host([notice(change(), 'scheduled')])]) },
      [`POST /hosts/${FP}/commands`]: OK,
    })
    render(<MaintenancePage pollMs={1} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Change time' }))
    const field = screen.getByLabelText('When') as HTMLInputElement
    fireEvent.change(field, { target: { value: '2001-01-01T10:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the time' }))
    expect(await screen.findByText(/at least 5 minutes from now/)).toBeTruthy()
    expect(requests.some(r => r.method === 'POST')).toBe(false)
    const soon = new Date(Date.now() + 3 * 86400_000)
    const p = (n: number) => String(n).padStart(2, '0')
    fireEvent.change(field, { target: { value: `${soon.getFullYear()}-${p(soon.getMonth() + 1)}-${p(soon.getDate())}T03:00` } })
    fireEvent.click(screen.getByRole('button', { name: 'Save the time' }))
    await waitFor(() => {
      const body = requests.find(r => r.method === 'POST')?.body as { request: { op: string; changeId: string; at: string } }
      expect(body.request).toMatchObject({ op: 'schedule.change', changeId: 'c1' })
      expect(new Date(body.request.at).getHours()).toBe(3)
    })
  })

  it("shows the machine's own refusal in the dialog", async () => {
    fakeServer({
      'GET /fleet': { status: 200, body: fleet([host([notice(change(), 'scheduled')])]) },
      [`POST /hosts/${FP}/commands`]: { status: 200, body: { command: { id: 'k', state: 'done', result: { ok: false, refusal: { code: 'unknown_change', message: 'That change is not scheduled any more.' } }, problem: null } } },
    })
    render(<MaintenancePage pollMs={1} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel it' }))
    expect(await screen.findByText('That change is not scheduled any more.')).toBeTruthy()
  })
})
