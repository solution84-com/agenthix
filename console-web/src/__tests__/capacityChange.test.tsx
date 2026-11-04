import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostFigures } from '@agenthix/core'
import { forgetCsrfToken } from '../api/csrf'
import type { FleetHost } from '../pages/dashboard/types'
import { CapacityChange } from '../forms/CapacityChange'
import { fakeServer } from './fakeServer'

const GB = 1000 ** 3
const GIB = 1024 ** 3
const NOW = new Date()
const FP = 'a'.repeat(64)
const figures = {
  takenAt: NOW.toISOString(),
  machine: { name: 'office-server', system: 'Linux', dockerVersion: '27', hostServiceVersion: '0.2.0', upSince: NOW.toISOString() },
  resources: { cpuLoad: 0.1, memory: { usedBytes: GB, totalBytes: 32 * GIB }, disk: { freeBytes: 100 * GB, totalBytes: 200 * GB } },
  ceilings: { memoryBytesPerContainer: 4 * GIB, cpusPerContainer: 2, processesPerContainer: 512, containersAtOnce: 6 },
  protections: { holding: true, rules: [], checkedAt: NOW.toISOString(), problem: null },
  installs: [{ target: 'site', version: '0.2.0', state: 'running', since: NOW.toISOString(), healthy: true, problem: null }],
  backups: { lastNightlyAt: null, lastNightlyOk: null, locationSet: false, lastCopyAt: null, lastExportAt: null, nightlyAt: '02:00' },
  frontDoor: { on: false, certificateExpiresAt: null, renewalProblem: null }, scheduledChanges: 0,
} satisfies HostFigures
const host: FleetHost = {
  fingerprint: FP, fingerprintShort: 'aaaa', hostId: 'h', machineName: 'office-server', siteName: 'office-server', hqMachine: false,
  siteRegistered: true, connectedAt: NOW.toISOString(), online: true, since: null, leftByItself: false, leftAt: null,
  figures, figuresAt: NOW.toISOString(), agents: null, scheduled: [], move: null,
}
const route = `POST /hosts/${FP}/commands`
const OK = { status: 200, body: { command: { id: 'c1', state: 'done', result: { ok: true, op: 'capacity.set', result: {} }, problem: null } } }
const p = (n: number) => String(n).padStart(2, '0')
const inDays = (days: number, hour: number) => {
  const d = new Date(Date.now() + days * 86400_000)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:00`
}

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear() })

describe('Change capacity @SC-908', () => {
  it('starts from the current ceilings, and says protections are not set here', () => {
    fakeServer({})
    render(<CapacityChange host={host} />)
    expect((screen.getByLabelText('Memory (GB)') as HTMLInputElement).value).toBe('4')
    expect((screen.getByLabelText('Processors') as HTMLInputElement).value).toBe('2')
    expect((screen.getByLabelText('Processes') as HTMLInputElement).value).toBe('512')
    expect((screen.getByLabelText('Runs at once') as HTMLInputElement).value).toBe('6')
    expect(screen.getByText(/Protections are not set here/)).toBeTruthy()
    expect(screen.getByText('the machine has 32 GB memory')).toBeTruthy()
  })

  it('does not send what is not valid', async () => {
    const requests = fakeServer({})
    render(<CapacityChange host={host} />)
    fireEvent.change(screen.getByLabelText('Runs at once'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Do it now' }))
    expect(await screen.findByText('Enter a whole number above zero.')).toBeTruthy()
    expect(requests.some(r => r.method === 'POST')).toBe(false)
  })

  it('now: sends the capacity command and says the answer', async () => {
    const requests = fakeServer({ [route]: OK })
    render(<CapacityChange host={host} />)
    expect((screen.getByLabelText('Now') as HTMLInputElement).checked).toBe(true)
    fireEvent.change(screen.getByLabelText('Runs at once'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Do it now' }))
    expect(await screen.findByText('Saved.')).toBeTruthy()
    expect(requests.find(r => r.method === 'POST')!.body).toEqual({ request: { op: 'capacity.set', ceilings: { memoryBytesPerContainer: 4 * GIB, cpusPerContainer: 2, processesPerContainer: 512, containersAtOnce: 4 } } })
  })

  it('once saved, the button cannot send it a second time', async () => {
    const requests = fakeServer({ [route]: OK })
    render(<CapacityChange host={host} />)
    fireEvent.click(screen.getByRole('button', { name: 'Do it now' }))
    expect(await screen.findByText('Saved.')).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Do it now' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(requests.filter(r => r.method === 'POST')).toHaveLength(1)
  })

  it('at a time: refuses one too near for members to be told, then sends it scheduled @SC-909', async () => {
    const requests = fakeServer({ [route]: OK })
    render(<CapacityChange host={host} pollMs={1} />)
    fireEvent.click(screen.getByLabelText('At a time…'))
    fireEvent.change(screen.getByLabelText('Runs at once'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2001-01-01T10:00' } })
    fireEvent.click(screen.getByRole('button', { name: /^Schedule for / }))
    expect(await screen.findByText(/at least 5 minutes from now/)).toBeTruthy()
    expect(requests.some(r => r.method === 'POST')).toBe(false)
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: inDays(3, 4) } })
    fireEvent.click(screen.getByRole('button', { name: /^Schedule for / }))
    expect(await screen.findByText('Scheduled.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'See it under Maintenance' }).getAttribute('href')).toBe('/maintenance')
    const body = requests.find(r => r.method === 'POST')?.body as { request: { op: string; at: string; change: unknown } }
    expect(body.request.op).toBe('schedule')
    expect(body.request.change).toMatchObject({ op: 'capacity.set', ceilings: { containersAtOnce: 8 } })
    expect(new Date(body.request.at).getHours()).toBe(4)
  })

  it("shows a refusal in the host service's own words", async () => {
    fakeServer({ [route]: { status: 200, body: { command: { id: 'c1', state: 'done', result: { ok: false, op: 'capacity.set', refusal: { code: 'busy', message: 'The site is restarting. Try again in a minute.' } }, problem: null } } } })
    render(<CapacityChange host={host} />)
    fireEvent.click(screen.getByRole('button', { name: 'Do it now' }))
    expect(await screen.findByText('The site is restarting. Try again in a minute.')).toBeTruthy()
  })

  it('follows a command that takes longer until it ends', async () => {
    let polls = 0
    fakeServer({
      [route]: { status: 202, body: { command: { id: 'c9', state: 'pending', result: null, problem: null } } },
      'GET /commands/c9': () => (++polls < 2
        ? { status: 202, body: { command: { id: 'c9', state: 'pending', result: null, problem: null } } }
        : OK),
    })
    render(<CapacityChange host={host} pollMs={5} />)
    fireEvent.click(screen.getByRole('button', { name: 'Do it now' }))
    expect(await screen.findByText('Waiting for office-server to answer…')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Saved.')).toBeTruthy())
  })

  it('a command that failed before the machine answered says why', async () => {
    fakeServer({ [route]: { status: 200, body: { command: { id: 'c1', state: 'failed', result: null, problem: 'The machine did not answer.' } } } })
    render(<CapacityChange host={host} />)
    fireEvent.click(screen.getByRole('button', { name: 'Do it now' }))
    expect(await screen.findByText('The machine did not answer.')).toBeTruthy()
  })
})
