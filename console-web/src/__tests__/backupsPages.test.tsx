import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackupFigures, HostFigures } from '@agenthix/core'
import { forgetCsrfToken } from '../api/csrf'
import { BackupsPage } from '../pages/backups/BackupsPage'
import { SiteBackupsPage } from '../pages/backups/SiteBackupsPage'
import type { FleetHost, FleetResponse } from '../pages/dashboard/types'
import { fakeServer, type Request, type Route } from './fakeServer'

const GB = 1000 ** 3
const NOW = new Date()
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const DAY = 86400_000
const FP = 'a'.repeat(64)
const HQ_FP = 'c'.repeat(64)
const KEY = 'AGXK-7F3Q-M2PL-9WZD-H4TC-K8RN'

const backups = (over: Partial<BackupFigures> = {}): BackupFigures => ({
  lastNightlyAt: ago(3600_000), lastNightlyOk: true, locationSet: true, lastCopyAt: ago(3000_000), lastExportAt: null, nightlyAt: '02:00', ...over,
})
const figures = (b: BackupFigures = backups(), hq = false): HostFigures => ({
  takenAt: NOW.toISOString(),
  machine: { name: 'office-server', system: 'Ubuntu 24.04', dockerVersion: '27.3', hostServiceVersion: '0.2.0', upSince: ago(20 * DAY) },
  resources: { cpuLoad: 0.2, memory: { usedBytes: 9 * GB, totalBytes: 16 * GB }, disk: { freeBytes: 120 * GB, totalBytes: 200 * GB } },
  ceilings: { memoryBytesPerContainer: 4 * GB, cpusPerContainer: 2, processesPerContainer: 512, containersAtOnce: 6 },
  protections: { holding: true, rules: ['machine-ports'], checkedAt: NOW.toISOString(), problem: null },
  installs: [
    ...(hq ? [{ target: 'hq' as const, version: '0.2.0', state: 'running' as const, since: ago(DAY), healthy: true, problem: null }] : []),
    { target: 'site', version: '0.2.0', state: 'running', since: ago(DAY), healthy: true, problem: null },
  ],
  backups: b, frontDoor: { on: false, certificateExpiresAt: null, renewalProblem: null }, scheduledChanges: 0,
})
const host = (over: Partial<FleetHost> = {}): FleetHost => ({
  fingerprint: FP, fingerprintShort: 'aaaa', hostId: 'h1', machineName: 'office-server', siteName: 'office', hqMachine: false, siteRegistered: true,
  connectedAt: ago(30 * DAY), online: true, since: ago(3 * DAY), leftByItself: false, leftAt: null,
  figures: figures(backups({ locationSet: false, lastCopyAt: null, lastExportAt: ago(41 * DAY) })), figuresAt: NOW.toISOString(),
  agents: null, scheduled: [], move: null, ...over,
})
const hqHost = host({ fingerprint: HQ_FP, machineName: 'hq-box', siteName: 'hq-box', hqMachine: true, figures: figures(backups(), true) })
const fleet = (hosts: FleetHost[]): FleetResponse => ({
  console: { machineName: 'hq-box', version: '0.2.0', fingerprintShort: 'cccc', hq: 'connected' }, hq: null, hosts, disconnected: [],
})

const done = (result: unknown): Route => ({ status: 200, body: { command: { id: 'c1', state: 'done', result, problem: null } } })
const SUMMARY = { id: '9f3a1c2b', night: '2026-10-14', takenAt: ago(60_000), sizeBytes: 5.2 * GB, holds: ['site'], inLocation: false }
type Answers = Partial<Record<string, Route>>
const commands = (answers: Answers) => (req: Request): Route => {
  const op = (req.body as { request: { op: string } }).request.op
  return answers[op] ?? { status: 500, body: { error: 'failed', message: 'unexpected' } }
}
const sent = (requests: Request[], fp = FP) =>
  requests.filter(r => r.method === 'POST' && r.path === `/hosts/${fp}/commands`).map(r => (r.body as { request: unknown }).request)

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

describe('the Backups screen @SC-905', () => {
  it('lists HQ, then every site, each after its machine, with what each backup holds and whether a copy is elsewhere', async () => {
    fakeServer({ 'GET /fleet': { status: 200, body: fleet([host(), hqHost, host({ fingerprint: 'b'.repeat(64), machineName: 'laptop', siteName: 'laptop', online: false, notifyIfSilent: false })]) } })
    render(<BackupsPage />)
    const rows = await screen.findAllByRole('article')
    expect(rows.map(r => r.getAttribute('aria-label'))).toEqual(['HQ', 'laptop', 'office-server'])
    const hq = screen.getByRole('article', { name: 'HQ' })
    expect(within(hq).getByText('Sealed · copied')).toBeTruthy()
    expect(within(hq).getByText(/holds HQ — its database, storage and secrets/)).toBeTruthy()
    const office = screen.getByRole('article', { name: 'office-server' })
    expect(within(office).getByText('No copy elsewhere')).toBeTruthy()
    expect(within(office).getByText('No backup location. The last export was 41 days ago.')).toBeTruthy()
    const laptop = screen.getByRole('article', { name: 'laptop' })
    expect(within(laptop).getByText('Not heard from')).toBeTruthy()
    expect(within(laptop).getByRole('button', { name: 'Back up now' }).getAttribute('aria-disabled')).toBe('true')
    expect(within(laptop).getByRole('button', { name: 'Export…' }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText("Every night at each machine's 02:00. 2 of 3 keep their backups on their own machine only.")).toBeTruthy()
    // The location's folder never reaches the Fleet Console, so no path is drawn.
    expect(screen.queryByText(/\/mnt\//)).toBeNull()
  })

  it('the row opens its backups; Export… opens them with the export; Restore a lost site… is at the top', async () => {
    fakeServer({ 'GET /fleet': { status: 200, body: fleet([hqHost, host()]) } })
    render(<BackupsPage />)
    const office = await screen.findByRole('article', { name: 'office-server' })
    expect(within(office).getByRole('link', { name: 'office-server' }).getAttribute('href')).toBe(`/backups/${FP}`)
    fireEvent.click(within(office).getByRole('button', { name: 'Export…' }))
    expect(window.location.pathname).toBe(`/backups/${FP}/export`)
    fireEvent.click(screen.getByRole('button', { name: 'Restore a lost site…' }))
    expect(window.location.pathname).toBe('/fleet/add/restore')
  })

  it('Back up now sends backup.take and says what the machine answered', async () => {
    const requests = fakeServer({
      'GET /fleet': { status: 200, body: fleet([host()]) },
      [`POST /hosts/${FP}/commands`]: commands({ 'backup.take': done({ ok: true, op: 'backup.take', result: { backup: SUMMARY } }) }),
    })
    render(<BackupsPage pollMs={1} />)
    const office = await screen.findByRole('article', { name: 'office-server' })
    fireEvent.click(within(office).getByRole('button', { name: 'Back up now' }))
    // The backup shows in the Nights card, not in a message.
    await waitFor(() => expect(sent(requests)).toEqual([{ op: 'backup.take' }]))
    expect(within(office).queryByText(/^Backed up/)).toBeNull()
  })

  it("a refusal shows the host service's own words", async () => {
    fakeServer({
      'GET /fleet': { status: 200, body: fleet([host()]) },
      [`POST /hosts/${FP}/commands`]: commands({
        'backup.take': done({ ok: false, op: 'backup.take', refusal: { code: 'busy', message: 'A restore is running on this machine. Wait for it to finish, then try again.' } }),
      }),
    })
    render(<BackupsPage pollMs={1} />)
    fireEvent.click(within(await screen.findByRole('article', { name: 'office-server' })).getByRole('button', { name: 'Back up now' }))
    expect(await screen.findByText('A restore is running on this machine. Wait for it to finish, then try again.')).toBeTruthy()
  })
})

describe("one site's backups @SC-905", () => {
  it('with no backup location: the warning, and the command to run on the machine — never a control', async () => {
    fakeServer({ [`GET /hosts/${FP}`]: { status: 200, body: { host: host() } } })
    render(<SiteBackupsPage fingerprint={FP} />)
    expect(await screen.findByText(/This site's backups are only on office-server\. If office-server is lost, so are they\. The last export was 41 days ago\./)).toBeTruthy()
    const location = screen.getByRole('region', { name: 'Backup location' })
    expect(within(location).getByText('agenthix backup location <path>')).toBeTruthy()
    expect(within(location).getByRole('button', { name: 'Copy the command' })).toBeTruthy()
    expect(within(location).queryByRole('textbox')).toBeNull()
  })

  it("with one set: when the last copy reached it, and that the folder is shown only on the machine", async () => {
    fakeServer({ [`GET /hosts/${HQ_FP}`]: { status: 200, body: { host: hqHost } } })
    render(<SiteBackupsPage fingerprint={HQ_FP} />)
    const location = await screen.findByRole('region', { name: 'Backup location' })
    expect(within(location).getByText(/^In the backup location since/)).toBeTruthy()
    expect(within(location).getByText(/The folder is shown only on hq-box/)).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: "HQ's backups" })).toBeTruthy()
  })

  it('an offline machine cannot be asked to back up or export', async () => {
    fakeServer({ [`GET /hosts/${FP}`]: { status: 200, body: { host: host({ online: false }) } } })
    render(<SiteBackupsPage fingerprint={FP} />)
    // Greyed but not disabled: the reason is in the tooltip, and a press says it in full.
    const take = await screen.findByRole('button', { name: 'Take a backup now' })
    expect(take.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('button', { name: 'Export a backup…' }).getAttribute('aria-disabled')).toBe('true')
    fireEvent.mouseEnter(take)
    expect(screen.getByTestId('tooltip').textContent).toMatch(/office-server is not answering/)
    fireEvent.click(take)
    expect(screen.getByRole('alert').textContent).toMatch(/keeps backing up on its own each night/)
  })
})

describe('exporting a backup @SC-906', () => {
  const exported = done({ ok: true, op: 'backup.export', result: { exportId: 'office-server-2026-10-14T1158-export-9f3a1c2b.sealed', sizeBytes: 5.2 * GB, key: KEY } })

  it('takes a backup, exports that one, and shows its key once; Done waits for the tick', async () => {
    const requests = fakeServer({
      [`GET /hosts/${FP}`]: { status: 200, body: { host: host() } },
      [`POST /hosts/${FP}/commands`]: commands({ 'backup.take': done({ ok: true, op: 'backup.take', result: { backup: SUMMARY } }), 'backup.export': exported }),
    })
    render(<SiteBackupsPage fingerprint={FP} pollMs={1} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Export a backup…' }))
    const panel = screen.getByRole('region', { name: 'Export a backup' })
    expect(within(panel).getByText(/Every fleet admin and organisation admin is told that you made this export\./)).toBeTruthy()
    fireEvent.click(within(panel).getByRole('button', { name: 'Make the export' }))
    const key = await screen.findByRole('region', { name: 'The key for this export' })
    expect(within(key).getByLabelText('The key').textContent).toBe(KEY)
    expect(within(key).getByText('office-server-2026-10-14T1158-export-9f3a1c2b.sealed')).toBeTruthy()
    expect(sent(requests)).toEqual([{ op: 'backup.take' }, { op: 'backup.export', backupId: '9f3a1c2b' }])
    const finish = within(key).getByRole('button', { name: 'Done' }) as HTMLButtonElement
    expect(finish.disabled).toBe(true)
    fireEvent.click(within(key).getByRole('checkbox'))
    expect(finish.disabled).toBe(false)
    fireEvent.click(finish)
    await waitFor(() => expect(screen.queryByText(KEY)).toBeNull())
  })

  it('opened from Export… on the Backups page, it starts on the export', async () => {
    fakeServer({ [`GET /hosts/${FP}`]: { status: 200, body: { host: host() } } })
    render(<SiteBackupsPage fingerprint={FP} exporting />)
    expect(await screen.findByRole('region', { name: 'Export a backup' })).toBeTruthy()
  })

  it('a key kept as a file is not drawn on the screen', async () => {
    fakeServer({
      [`GET /hosts/${FP}`]: { status: 200, body: { host: host() } },
      [`POST /hosts/${FP}/commands`]: commands({ 'backup.take': done({ ok: true, op: 'backup.take', result: { backup: SUMMARY } }), 'backup.export': exported }),
    })
    render(<SiteBackupsPage fingerprint={FP} pollMs={1} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Export a backup…' }))
    fireEvent.click(screen.getByRole('radio', { name: /Save the key as a small file/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Make the export' }))
    expect(await screen.findByRole('button', { name: 'Save the key file' })).toBeTruthy()
    expect(screen.queryByText(KEY)).toBeNull()
    expect(screen.getByText(/Save it now as office-2026-10-14\.key/)).toBeTruthy()
  })

  it('a key file the browser could not save shows the key and offers to copy it', async () => {
    fakeServer({
      [`GET /hosts/${FP}`]: { status: 200, body: { host: host() } },
      [`POST /hosts/${FP}/commands`]: commands({ 'backup.take': done({ ok: true, op: 'backup.take', result: { backup: SUMMARY } }), 'backup.export': exported }),
    })
    vi.stubGlobal('URL', Object.assign(function URLStub() {}, { createObjectURL: undefined }))
    render(<SiteBackupsPage fingerprint={FP} pollMs={1} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Export a backup…' }))
    fireEvent.click(screen.getByRole('radio', { name: /Save the key as a small file/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Make the export' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save the key file' }))
    expect(await screen.findByLabelText('The key')).toBeTruthy()
    expect(screen.getByText(KEY)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy the key' })).toBeTruthy()
  })

  it("an export the machine refuses says so in its words, and that the backup taken for it stays", async () => {
    const requests = fakeServer({
      [`GET /hosts/${FP}`]: { status: 200, body: { host: host() } },
      [`POST /hosts/${FP}/commands`]: commands({
        'backup.take': done({ ok: true, op: 'backup.take', result: { backup: SUMMARY } }),
        'backup.export': done({ ok: false, op: 'backup.export', refusal: { code: 'failed', message: 'The disk is full.' } }),
      }),
    })
    render(<SiteBackupsPage fingerprint={FP} pollMs={1} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Export a backup…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Make the export' }))
    expect(await screen.findByText('The disk is full. The backup taken for it stays on office-server with its other backups.')).toBeTruthy()
    expect(sent(requests)).toHaveLength(2)
  })

  it('a backup that could not be taken makes no export', async () => {
    const requests = fakeServer({
      [`GET /hosts/${FP}`]: { status: 200, body: { host: host() } },
      [`POST /hosts/${FP}/commands`]: commands({
        'backup.take': done({ ok: false, op: 'backup.take', refusal: { code: 'not_installed', message: 'No site runs on office-server, so there is nothing to back up.' } }),
      }),
    })
    render(<SiteBackupsPage fingerprint={FP} pollMs={1} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Export a backup…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Make the export' }))
    expect(await screen.findByText('No site runs on office-server, so there is nothing to back up.')).toBeTruthy()
    expect(sent(requests)).toEqual([{ op: 'backup.take' }])
  })
})
