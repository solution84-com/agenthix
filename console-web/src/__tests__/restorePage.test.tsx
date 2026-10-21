import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetCsrfToken } from '../api/csrf'
import type { JoinView } from '../pages/add/joinWords'
import { RestorePage } from '../pages/add/RestorePage'
import { candidates, restoreSteps, restoreWarning } from '../pages/add/restoreWords'
import type { FleetHost, FleetResponse } from '../pages/dashboard/types'
import { fakeServer } from './fakeServer'

const NOW = new Date()
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const inMs = (ms: number) => new Date(NOW.getTime() + ms).toISOString()
const HOUR = 3600_000
const FP = 'a'.repeat(64)
const host = (over: Partial<FleetHost> = {}): FleetHost => ({
  fingerprint: FP, fingerprintShort: 'aaaa', hostId: 'h1', machineName: 'office-server', siteName: 'office', hqMachine: false, siteRegistered: true,
  connectedAt: ago(30 * 24 * HOUR), online: false, since: ago(3 * 24 * HOUR), leftByItself: false, leftAt: null, figures: null, figuresAt: null,
  agents: null, scheduled: [], move: null, ...over,
})
const fleet = (hosts: FleetHost[]): FleetResponse => ({
  console: { machineName: 'hq-box', version: '0.2.0', fingerprintShort: 'cccc', hq: 'connected' }, hq: null, hosts, disconnected: [],
})
const SESSION = { status: 200, body: { user: { id: 'u1', name: 'Sam Rivera' }, hq: { organisationName: 'Acme Robotics', address: 'https://hq.acme.example' } } }
const MACHINE = { name: 'new-server', fingerprint: 'b'.repeat(64), fingerprintShort: '8F3A 91C2 E04B 7D55' }
const RESTORE = { siteName: 'office', lostMachine: 'office-server', lastHeardAt: ago(3 * 24 * HOUR), backupTakenAt: ago(30 * HOUR) }
const view = (over: Partial<JoinView> = {}): JoinView => ({
  joinId: 'j1', state: 'waiting', expiresAt: inMs(60 * 60_000), machine: null, replaces: null, hqClaim: null, siteName: 'office', restore: { ...RESTORE, backupTakenAt: null }, problem: null, ...over,
})

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

async function toCode(routes: Parameters<typeof fakeServer>[0] = {}) {
  const requests = fakeServer({
    'GET /session': SESSION,
    'GET /fleet': { status: 200, body: fleet([host(), host({ fingerprint: 'c'.repeat(64), machineName: 'laptop', siteName: 'laptop', online: true })]) },
    'POST /joins': { status: 201, body: { ...view(), code: 'K7QM-4XPD-93TB' } },
    'GET /joins/j1': { status: 200, body: view() },
    ...routes,
  })
  render(<RestorePage pollMs={5} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Restore office…' }))
  const make = screen.getByRole('button', { name: 'Make a code for the new machine' })
  expect((make as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('checkbox', { name: /I understand/ }))
  fireEvent.click(make)
  await screen.findByLabelText('One-time code')
  return requests
}

describe('Restore a site from a backup (adr-0119) @SC-904', () => {
  it('offers only a site whose machine is offline, saying when it was last heard from', async () => {
    fakeServer({ 'GET /session': SESSION, 'GET /fleet': { status: 200, body: fleet([host(), host({ fingerprint: 'c'.repeat(64), machineName: 'laptop', siteName: 'laptop', online: true })]) } })
    render(<RestorePage />)
    const which = await screen.findByRole('region', { name: 'Which site' })
    expect(within(which).getByText(/Last heard from .*, 3 days ago\./)).toBeTruthy()
    expect(within(which).getByText('laptop is online, so laptop is not lost. To give it a new machine, use Plan maintenance… on its page, and choose Move.')).toBeTruthy()
    expect(within(which).queryByRole('button', { name: 'Restore laptop…' })).toBeNull()
  })

  it('warns before any code, then gives the command with the backup chosen on the new machine; the key is never asked here', async () => {
    const requests = await toCode()
    expect(requests.find(r => r.path === '/joins' && r.method === 'POST')?.body).toEqual({ restoreMachine: FP, notify: true })
    expect(await screen.findByText('$ agenthix restore --from <folder or file> https://hq.acme.example K7QM-4XPD-93TB')).toBeTruthy()
    expect(screen.getByText(/The key never reaches the Fleet Console or HQ\./)).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('shows the backup the machine restores and what it replaces before the fleet admin confirms', async () => {
    let confirmed = false
    const arrived = view({ state: 'confirming', machine: MACHINE, restore: RESTORE })
    const restoring = view({ state: 'restoring', machine: MACHINE, restore: RESTORE })
    await toCode({
      'GET /joins/j1': () => ({ status: 200, body: confirmed ? restoring : arrived }),
      'POST /joins/j1/confirm': () => { confirmed = true; return { status: 200, body: restoring } },
    })
    const check = await screen.findByRole('region', { name: 'The machine that used the code' })
    expect(within(check).getByText(/It restores office from its backup taken .*\. Anything office did after that is lost\./)).toBeTruthy()
    expect(within(check).getByText(/office-server, last heard from .*, is replaced: HQ refuses it if it comes back\./)).toBeTruthy()
    fireEvent.click(within(check).getByRole('button', { name: 'Confirm new-server and restore office' }))
    expect(await screen.findByText('office restored on new-server from its backup and named new-server, its credential renewed at HQ')).toBeTruthy()
    expect(screen.getByText('office-server replaced: it leaves the fleet')).toBeTruthy()
  })

  it('says how it ended, in the host service\'s words when it was refused', async () => {
    await toCode({ 'GET /joins/j1': { status: 200, body: view({ state: 'failed', machine: MACHINE, problem: 'Not restored: Refused: office is connected to HQ right now. Nothing was changed.' }) } })
    expect(await screen.findByText('office was not restored')).toBeTruthy()
    expect(screen.getByText('Not restored: Refused: office is connected to HQ right now. Nothing was changed.')).toBeTruthy()
  })
})

describe('the words of a restore', () => {
  it('warns more strongly when the machine was heard from recently @SC-904', () => {
    const quiet = restoreWarning('office', 'office-server', ago(3 * 24 * HOUR), NOW)
    expect(quiet).toMatchObject({ strong: false, title: 'Before you restore office' })
    expect(quiet.paragraphs[0]).toBe('office-server may only be down for a while. Restoring office onto a new machine replaces it: if office-server comes back, HQ refuses it, and it leaves the fleet.')
    const recent = restoreWarning('office', 'office-server', ago(12 * 60_000), NOW)
    expect(recent).toMatchObject({ strong: true, title: 'office-server was heard from recently' })
    expect(recent.paragraphs[0]).toContain('was heard from 12 minutes ago')
  })

  it('for a machine whose fleet admins are not told when it stops answering, says it may only be switched off or asleep @SC-901', () => {
    const w = restoreWarning('office', 'office-server', ago(3 * 24 * HOUR), NOW, false)
    expect(w).toMatchObject({ strong: true, title: 'office-server may only be switched off or asleep' })
    expect(w.paragraphs[0]).toBe('office-server is set not to notify the fleet admins when it stops answering: it may only be switched off or asleep.')
    expect(restoreWarning('office', 'office-server', ago(12 * 60_000), NOW, false).title).toBe('office-server was heard from recently')
  })

  it('asks the new machine’s own setting, ticked to begin with, and says so on the warning of an unticked machine @SC-901', async () => {
    const requests = fakeServer({
      'GET /session': SESSION,
      'GET /fleet': { status: 200, body: fleet([host({ notifyIfSilent: false })]) },
      'POST /joins': { status: 201, body: { ...view(), code: 'K7QM-4XPD-93TB' } },
      'GET /joins/j1': { status: 200, body: view() },
    })
    render(<RestorePage pollMs={5} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Restore office…' }))
    expect(screen.getByText('office-server may only be switched off or asleep')).toBeTruthy()
    const notify = screen.getByRole('checkbox', { name: 'Notify the fleet admins if this machine stops answering' }) as HTMLInputElement
    expect(notify.checked).toBe(true)
    fireEvent.click(notify)
    fireEvent.click(screen.getByRole('checkbox', { name: /I understand/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Make a code for the new machine' }))
    await screen.findByLabelText('One-time code')
    expect(requests.find(r => r.path === '/joins' && r.method === 'POST')?.body).toEqual({ restoreMachine: FP, notify: false })
  })

  it('never offers HQ\'s own site, a site that is moving, or one whose machine is online @SC-904', () => {
    const list = candidates([host({ hqMachine: true }), host({ move: { moveId: 'm', role: 'sending', siteName: 'office', state: 'x', at: null } }), host({ online: true }), host()])
    expect(list.map(c => c.restorable)).toEqual([false, false, true])
  })

  it('marks the step that did not complete @SC-904', () => {
    expect(restoreSteps(view({ state: 'failed', machine: MACHINE, siteName: 'office' })).map(s => s.state)).toEqual(['done', 'failed', 'todo'])
    expect(restoreSteps(view({ state: 'done', machine: MACHINE })).map(s => s.state)).toEqual(['done', 'done', 'done'])
  })
})
