import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FleetActivityEntry } from '@agenthix/core'
import { forgetCsrfToken } from '../api/csrf'
import { ActivityPage } from '../pages/activity/ActivityPage'
import type { FleetNoticeView } from '../shell/notices'
import { fakeServer, type Route } from './fakeServer'
import { fleet, host } from './shellFixtures'

// Activity is the record: read only, newest first, found in by who, by what it was done to and by kind. The notices
// are the bell's; none is shown here and nothing here is dismissed.

const now = new Date()
const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString()

const entry = (over: Partial<FleetActivityEntry> = {}): FleetActivityEntry => ({
  id: 'a1', at: ago(5), by: { id: 'u1', name: 'Sam Rivera' }, action: 'command.backup.export', subject: 'office on office-server', ...over,
})
const RECORD = [
  entry(),
  entry({ id: 'a2', at: ago(1), by: { id: 'u2', name: 'Dana Lee' }, action: 'hq.moveScheduled', subject: 'HQ from machine-d to lab-01, now' }),
  entry({ id: 'a3', at: ago(30), by: { id: 'u2', name: 'Dana Lee' }, action: 'command.upgrade', subject: 'lab-01' }),
  entry({ id: 'a0', by: null, action: 'fleetAdmin.granted', subject: 'Sam Rivera', at: ago(60) }),
]
const told: FleetNoticeView = { id: 'n2', kind: 'activity', title: 'Sam Rivera exported a backup of office', body: 'office on office-server', at: ago(5), dismissible: true, fingerprint: null }

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

function serve(extra: Record<string, Route | ((req: { path: string }) => Route)> = {}) {
  return fakeServer({
    'GET /notices': { status: 200, body: { notices: [told] } },
    'GET /fleet': { status: 200, body: fleet([host('machine-d', { hqMachine: true }), host('office-server', { siteName: 'office' }), host('lab-01')]) },
    'GET /activity': { status: 200, body: { entries: RECORD, next: null } },
    ...extra,
  })
}

const lines = () => within(screen.getByRole('list', { name: 'What was done' })).getAllByRole('listitem').map(li => li.textContent ?? '')

describe('Activity @SC-917', () => {
  it('is the record, newest first, with who did each and what to, kept in HQ for a year where nobody can edit it', async () => {
    serve()
    render(<ActivityPage />)
    await screen.findByRole('list', { name: 'What was done' })
    expect(screen.getByText(/Kept in HQ for a year; nobody can edit it/)).toBeTruthy()
    const rows = lines()
    expect(rows[0]).toMatch(/Dana Lee.*asked to move HQ/)
    expect(rows[1]).toMatch(/Sam Rivera.*exported a backup.*office on office-server/)
    expect(rows[3]).toMatch(/A machine admin.*gave the fleet admin role.*Sam Rivera/)
    expect(within(screen.getAllByRole('listitem')[3]).getByText('command line')).toBeTruthy()
  })

  it('shows no notices and has no Dismiss anywhere', async () => {
    const requests = serve()
    render(<ActivityPage />)
    await screen.findByRole('list', { name: 'What was done' })
    expect(screen.queryByText(told.title)).toBeNull()
    expect(screen.queryByRole('button', { name: /Dismiss/ })).toBeNull()
    expect(requests.some(r => r.path === '/notices')).toBe(false)
  })

  it('finds by who, by HQ or a site, and by kind', async () => {
    serve()
    render(<ActivityPage />)
    await screen.findByRole('list', { name: 'What was done' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Who' }), { target: { value: 'Dana Lee' } })
    expect(lines()).toHaveLength(2)
    fireEvent.change(screen.getByRole('combobox', { name: 'Kind' }), { target: { value: 'maintenance' } })
    expect(lines()).toEqual([expect.stringMatching(/upgraded.*lab-01/)])
    fireEvent.click(screen.getByRole('button', { name: 'Show everything' }))
    expect(lines()).toHaveLength(4)

    await waitFor(() => expect(within(screen.getByRole('combobox', { name: 'Done to' })).getAllByRole('option')).toHaveLength(5))
    fireEvent.change(screen.getByRole('combobox', { name: 'Done to' }), { target: { value: 'hq' } })
    expect(lines()).toEqual([expect.stringMatching(/asked to move HQ/)])
    fireEvent.change(screen.getByRole('combobox', { name: 'Done to' }), { target: { value: 'office-server'.padEnd(64, '0') } })
    expect(lines()).toEqual([expect.stringMatching(/exported a backup/)])
    fireEvent.change(screen.getByRole('combobox', { name: 'Who' }), { target: { value: 'Dana Lee' } })
    expect(screen.getByText('Nothing in the record so far matches.')).toBeTruthy()
  })

  it('reads the next page of the record when asked', async () => {
    const requests = serve({
      'GET /activity': { status: 200, body: { entries: [entry()], next: 'a1' } },
      'GET /activity?after=a1': { status: 200, body: { entries: [entry({ id: 'a0', at: ago(90), action: 'signedIn', subject: 'On hq-box' })], next: null } },
    })
    render(<ActivityPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Show earlier' }))
    expect(await screen.findByText('On hq-box')).toBeTruthy()
    expect(requests.some(r => r.path === '/activity?after=a1')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Show earlier' })).toBeNull()
  })

  it('says when HQ is older than the record, rather than showing nothing', async () => {
    serve({ 'GET /activity': { status: 501, body: { error: 'hq_too_old', message: 'HQ does not keep this yet: it is older than this Fleet Console. Upgrade HQ to see it here.' } } })
    render(<ActivityPage />)
    expect(await screen.findByText(/older than this Fleet Console/)).toBeTruthy()
    expect(screen.queryByText('Nothing has been done here yet.')).toBeNull()
  })
})
