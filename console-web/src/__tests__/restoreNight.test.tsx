import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackupListed } from '@agenthix/core'
import { forgetCsrfToken } from '../api/csrf'
import { fakeServer, fleetRoute, type Request } from './fakeServer'
import { choose, dropDown, figures, fleetHost, inDays, openAt, optionsOf, panelAddress, running } from './maintenanceHarness'

const FP = 'a'.repeat(64)
const HQ_FP = 'c'.repeat(64)
const KEY = 'AGXK-7F3Q-M2PL-9WZD-H4TC-K8RN'
const office = fleetHost(FP, 'office-server')
const hqBox = fleetHost(HQ_FP, 'hq-box', { hqMachine: true, figures: figures([running('hq'), running('site')]) })

const night = (id: string, n: string, over: Partial<BackupListed> = {}): BackupListed => ({
  id, night: n, takenAt: `${n}T02:00:04.000Z`, kind: 'nightly', holds: ['site'], sizeBytes: 52_000_000, onMachine: true, inLocation: true, ...over,
})
const TUESDAY = night('0b0b0b0b', '2026-10-13')
const MONDAY = night('0a0a0a0a', '2026-10-12')
const SEPTEMBER = night('09090909', '2026-09-20', { onMachine: false })
const LIST = { backups: [TUESDAY, MONDAY, SEPTEMBER], location: 'read' }

const DONE = { status: 200, body: { command: { id: 'r1', state: 'done', result: { ok: true, op: 'backup.restore', result: { backup: {} } }, problem: null } } }
const restoresSent = (requests: Request[], fp = FP) => requests.filter(r => r.method === 'POST' && r.path === `/hosts/${fp}/restore`).map(r => r.body as Record<string, unknown>)
const search = () => new URLSearchParams(window.location.search)

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

describe("a machine's backups page", () => {
  it('lists the nights the machine holds, newest first, each with where it is and Restore…', async () => {
    fakeServer({ [`GET /hosts/${FP}`]: { status: 200, body: { host: office } }, [`GET /hosts/${FP}/backups`]: { status: 200, body: LIST } })
    openAt(`/backups/${FP}`)
    const list = await screen.findByRole('list', { name: 'Nights to restore' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map(r => within(r).getByText(/2026$/).textContent)).toEqual(['Tue, 13 Oct 2026', 'Mon, 12 Oct 2026', 'Sun, 20 Sept 2026'])
    expect(within(rows[0]).getByText(/Nightly · taken .* · 52 MB · On office-server and in the backup location/)).toBeTruthy()
    expect(within(rows[2]).getByText(/In the backup location only/)).toBeTruthy()
    expect(screen.queryByText(/does not list them, or restore one, yet/)).toBeNull()
  })

  it('Restore… opens Plan maintenance on Restore a backup, with that night chosen', async () => {
    fakeServer({
      'GET /fleet': fleetRoute([office, hqBox]), [`GET /hosts/${FP}`]: { status: 200, body: { host: office } }, [`GET /hosts/${FP}/backups`]: { status: 200, body: LIST },
    })
    openAt(`/backups/${FP}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Restore the night of Mon, 12 Oct 2026…' }))
    expect(search().get('panel')).toBe('maintenance')
    expect(search().get('which')).toBe(FP)
    expect(search().get('what')).toBe('restore')
    expect(search().get('night')).toBe(MONDAY.id)
    const panel = await screen.findByRole('dialog', { name: 'Plan maintenance' })
    expect(await within(panel).findByRole('button', { name: 'Night: Mon, 12 Oct 2026 · Nightly' })).toBeTruthy()
  })

  it("HQ's machine's Restore… is HQ's", async () => {
    fakeServer({ [`GET /hosts/${HQ_FP}`]: { status: 200, body: { host: hqBox } }, [`GET /hosts/${HQ_FP}/backups`]: { status: 200, body: { backups: [night('0c0c0c0c', '2026-10-13', { holds: ['hq', 'site'] })], location: 'none' } } })
    openAt(`/backups/${HQ_FP}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Restore the night of Tue, 13 Oct 2026…' }))
    expect(search().get('which')).toBe('hq')
  })
})

describe('Restore a backup, in Plan maintenance', () => {
  it('is offered for HQ and for a site, and said in full before anything is sent', async () => {
    fakeServer({ 'GET /fleet': fleetRoute([office, hqBox]), [`GET /hosts/${FP}/backups`]: { status: 200, body: LIST } })
    openAt(`/sites/${FP}${panelAddress(FP, 'restore')}`)
    await screen.findByRole('button', { name: 'What: Restore a backup' })
    choose('Night', 'Mon, 12 Oct 2026 · Nightly')
    const steps = within(screen.getByRole('list', { name: 'What happens' })).getAllByRole('listitem').map(li => li.textContent)
    expect(steps).toEqual([
      'What is there now is backed up first, so this restore can be undone: that backup is listed here afterwards.',
      'The site office-server is stopped, restored to the night of Mon, 12 Oct 2026, and started again.',
      'Anything done on the site since that night is lost: its runs and the files in its workspaces go back to how they were.',
      'Done at a time, members whose work it affects see a notice from when it is planned; done now, they are not told before. Once the site is back, HQ tells its organisation admins what was lost.',
    ])
    choose('Which', 'HQ')
    expect(optionsOf('What')).toEqual(['Upgrade', 'Change capacity', 'Move', 'Suspend', 'Restore a backup'])
  })

  it("needs the machine's name typed, then restores now through Restore…'s own route", async () => {
    const requests = fakeServer({ 'GET /fleet': fleetRoute([office, hqBox]), [`GET /hosts/${FP}/backups`]: { status: 200, body: LIST }, [`POST /hosts/${FP}/restore`]: DONE })
    openAt(`/sites/${FP}${panelAddress(FP, 'restore')}&night=${MONDAY.id}`)
    await screen.findByRole('button', { name: 'Night: Mon, 12 Oct 2026 · Nightly' })
    fireEvent.change(screen.getByLabelText('Type office-server to confirm'), { target: { value: 'office' } })
    fireEvent.click(screen.getByRole('button', { name: 'Do it now' }))
    expect(screen.getByText('Type office-server to confirm.')).toBeTruthy()
    expect(restoresSent(requests)).toEqual([])
    fireEvent.change(screen.getByLabelText('Type office-server to confirm'), { target: { value: 'Office-Server' } })
    fireEvent.click(screen.getByRole('button', { name: 'Do it now' }))
    expect(await screen.findByText('Restored.')).toBeTruthy()
    expect(restoresSent(requests)).toEqual([{ backupId: MONDAY.id, from: 'machine', confirmName: 'Office-Server', at: null }])
    expect(requests.some(r => r.path === `/hosts/${FP}/commands`)).toBe(false)
  })

  it('schedules a night kept on the machine for a time', async () => {
    const requests = fakeServer({ 'GET /fleet': fleetRoute([office]), [`GET /hosts/${FP}/backups`]: { status: 200, body: LIST }, [`POST /hosts/${FP}/restore`]: DONE })
    openAt(`/sites/${FP}${panelAddress(FP, 'restore')}&night=${TUESDAY.id}`)
    await screen.findByRole('button', { name: 'Night: Tue, 13 Oct 2026 · Nightly' })
    fireEvent.click(screen.getByLabelText('At a time…'))
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: inDays(2, 3) } })
    fireEvent.change(screen.getByLabelText('Type office-server to confirm'), { target: { value: 'office-server' } })
    fireEvent.click(screen.getByRole('button', { name: /^Schedule for / }))
    expect(await screen.findByText('Scheduled.')).toBeTruthy()
    expect(restoresSent(requests)).toEqual([{ backupId: TUESDAY.id, from: 'machine', confirmName: 'office-server', at: new Date(inDays(2, 3)).toISOString() }])
  })

  it('a night only in the backup location asks for its key, is done now only, and the key leaves the field once sent', async () => {
    const requests = fakeServer({ 'GET /fleet': fleetRoute([office]), [`GET /hosts/${FP}/backups`]: { status: 200, body: LIST }, [`POST /hosts/${FP}/restore`]: DONE })
    openAt(`/sites/${FP}${panelAddress(FP, 'restore')}&night=${SEPTEMBER.id}`)
    await screen.findByRole('button', { name: 'Night: Sun, 20 Sept 2026 · Nightly' })
    expect(screen.queryByLabelText('At a time…')).toBeNull()
    expect(screen.getByText(/A copy in the backup location is restored now, with its key: the key is never kept for later/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Type office-server to confirm'), { target: { value: 'office-server' } })
    fireEvent.click(screen.getByRole('button', { name: 'Do it now' }))
    expect(screen.getByText("Type the backup location's key.")).toBeTruthy()
    fireEvent.change(screen.getByLabelText("The backup location's key"), { target: { value: KEY } })
    fireEvent.click(screen.getByRole('button', { name: 'Do it now' }))
    expect(await screen.findByText('Restored.')).toBeTruthy()
    expect(restoresSent(requests)).toEqual([{ backupId: SEPTEMBER.id, from: 'location', key: KEY, confirmName: 'office-server', at: null }])
    expect((screen.getByLabelText("The backup location's key") as HTMLInputElement).value).toBe('')
  })

  it("says the machine's refusal in its own words", async () => {
    fakeServer({
      'GET /fleet': fleetRoute([office]), [`GET /hosts/${FP}/backups`]: { status: 200, body: LIST },
      [`POST /hosts/${FP}/restore`]: { status: 404, body: { error: 'not_found', message: 'That backup is no longer on office-server. Choose another night.' } },
    })
    openAt(`/sites/${FP}${panelAddress(FP, 'restore')}&night=${MONDAY.id}`)
    await screen.findByRole('button', { name: 'Night: Mon, 12 Oct 2026 · Nightly' })
    fireEvent.change(screen.getByLabelText('Type office-server to confirm'), { target: { value: 'office-server' } })
    fireEvent.click(screen.getByRole('button', { name: 'Do it now' }))
    expect(await screen.findByText('Not restored')).toBeTruthy()
    expect(screen.getByText('That backup is no longer on office-server. Choose another night.')).toBeTruthy()
  })

  it("HQ's restore says HQ and its own site go back", async () => {
    fakeServer({ 'GET /fleet': fleetRoute([office, hqBox]), [`GET /hosts/${HQ_FP}/backups`]: { status: 200, body: { backups: [night('0c0c0c0c', '2026-10-13', { holds: ['hq', 'site'] })], location: 'none' } } })
    openAt(`/hq${panelAddress('hq', 'restore')}`)
    await screen.findByRole('button', { name: 'Night: Choose the night to go back to' })
    expect(screen.getByText('HQ and its own site are stopped, restored to that night, and started again.')).toBeTruthy()
    expect(dropDown('Which').getAttribute('aria-label')).toBe('Which: HQ')
    expect(screen.getByLabelText('Type hq-box to confirm')).toBeTruthy()
  })
})
