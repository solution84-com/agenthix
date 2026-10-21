// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const ops = vi.hoisted(() => ({ useQuery: vi.fn() }))

vi.mock('wasp/client/operations', () => ({
  useQuery: ops.useQuery,
  getSiteList: 'getSiteList',
  getUserSettings: 'getUserSettings',
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { ExecutionSitesPage } from '../ExecutionSitesPage'
import type { SiteListEntry } from '../../siteViews'

const site = (over: Partial<SiteListEntry>): SiteListEntry => ({
  id: 'row-1', siteId: 'site-1', label: 'Build server', status: 'ONLINE', connected: true, isDefault: false,
  registeredAt: new Date(2026, 8, 1), lastSeenAt: new Date(), protocolVersion: '1.0', hqProtocol: '1.0',
  projectCount: 1, waiting: { runs: 0, changes: 0 }, figures: false, load: null, health: null, healthReportedAt: null, removal: null,
  group: 'running', problems: [], hosting: 'self-hosted', scheduled: null, cause: null, ...over,
})

const C = { memoryBytesPerContainer: 8 * 1024 ** 3, cpusPerContainer: 4, processesPerContainer: 512, containersAtOnce: 4 }
const limits = (running: number, maxAtOnce: number) => ({ running, maxAtOnce, ceilings: { ceilings: C, machine: C } })
const CLOUD = site({ id: 'row-c', siteId: 'site-c', label: 'hel-2', hosting: 'cloud', load: limits(0, 6) })
const BUSY = site({ id: 'row-b', siteId: 'site-b', label: 'office-server', projectCount: 3, load: limits(4, 4), waiting: { runs: 0, changes: 0, atCapacity: 3 } })
// Earlier today, so the words read a clock time and not "yesterday".
const AWAY_SINCE = new Date(Date.now() - 1000)
const AWAY_CLOCK = `${String(AWAY_SINCE.getHours()).padStart(2, '0')}:${String(AWAY_SINCE.getMinutes()).padStart(2, '0')}`
const AWAY = site({ id: 'row-a', siteId: 'site-a', label: 'laptop', status: 'OFFLINE', connected: false, group: 'needsYou', lastSeenAt: AWAY_SINCE, projectCount: 0, waiting: { runs: 2, changes: 0 }, load: limits(0, 2) })
const HQ = site({ id: 'row-d', siteId: 'site-d', label: 'hq-box', isDefault: true, projectCount: 2, load: limits(1, 4) })
const GONE = site({ id: 'row-g', label: 'Old laptop', status: 'REVOKED', connected: false, projectCount: 0, group: 'removed', removal: { at: new Date(2026, 8, 20), by: null, leftByItself: true } })

function given(sites: SiteListEntry[], role: 'ADMIN' | 'MEMBER' = 'ADMIN', isLoading = false) {
  ops.useQuery.mockImplementation((fn: unknown) =>
    fn === 'getSiteList' ? { data: isLoading ? undefined : sites, isLoading }
    : { data: { role }, isLoading: false },
  )
}

const renderPage = () => render(<MemoryRouter><ExecutionSitesPage /></MemoryRouter>)

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ExecutionSitesPage — Where work runs, as an admin sees it @SC-637', () => {
  it('lists Cloud\'s sites first, then the self-hosted ones, each with a sentence, its runs and the limits', () => {
    given([HQ, BUSY, AWAY, CLOUD])
    renderPage()
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Agenthix Cloud', 'Self-hosted'])
    const rows = screen.getAllByTestId('site-row').map((r) => r.textContent ?? '')
    expect(rows[0]).toContain('hel-2')
    expect(rows[0]).toContain('0 of 6 runs')
    expect(rows[1]).toContain('hq-box')
    expect(rows[1]).toContain('2 projects · runs get 8 GB memory, 4 processors')
    expect(rows[2]).toContain('Busy: all 4 runs are going, 3 runs wait for a place')
    expect(rows[2]).toContain('4 of 4 runs · 3 waiting')
    expect(rows[3]).toContain(`Unavailable since ${AWAY_CLOCK}: its machine isn't answering. Your fleet admins have been told.`)
    expect(rows[3]).toContain('2 runs wait')
  })

  it('says the state once in the sentence under the name, and the name stands alone', () => {
    given([HQ, BUSY])
    renderPage()
    const names = screen.getAllByTestId('site-name').map((n) => n.textContent)
    expect(names).toEqual(['hq-box', 'office-server'])
    const sentences = screen.getAllByTestId('site-sentence').map((n) => n.textContent)
    expect(sentences[0]).toBe('Available · 2 projects · runs get 8 GB memory, 4 processors')
    expect(sentences[1]).toMatch(/^Busy: all 4 runs are going, 3 runs wait for a place · 3 projects/)
  })

  it('opens the site\'s page, and offers no action on a row', () => {
    given([BUSY])
    renderPage()
    expect(screen.getByTestId('site-row').getAttribute('href')).toBe('/org/settings/where-work-runs/row-b')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows a scheduled change on the row, in words', () => {
    given([site({ scheduled: { kind: 'upgrade', at: new Date(Date.UTC(2026, 9, 18, 2, 0)), expectedMinutes: 20, detail: null } })])
    renderPage()
    expect(screen.getByTestId('site-row').textContent).toMatch(/Scheduled maintenance: upgrade .*, about 20 minutes/)
  })

  it('has no way to add, approve, limit, stop or remove a site, and points to the Fleet Console', () => {
    given([HQ])
    renderPage()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Sites are looked after by your fleet admins, in the Fleet Console.')).toBeTruthy()
  })

  it('never shows a machine figure or a version', () => {
    given([BUSY, AWAY])
    renderPage()
    expect(document.body.textContent).not.toMatch(/GB free|protocol|Docker|HQ speaks/i)
  })

  it('gives a fleet admin the figures under the row, and nobody else @SC-637 @SC-939', () => {
    const health = { takenAt: '', runs: { running: 1, maxAtOnce: 4 }, disk: { freeBytes: 182e9, totalBytes: 500e9 }, docker: { running: true, version: '27' }, agentImage: { name: 'a', present: true, version: null }, ceilings: null, memoryNearlyFull: false }
    given([{ ...BUSY, figures: true, health }])
    renderPage()
    expect(screen.getByTestId('site-row').textContent).toContain('disk 182 GB free of 500 GB')
    cleanup()
    given([BUSY])
    renderPage()
    expect(screen.getByTestId('site-row').textContent).not.toMatch(/disk/)
  })

  it('folds Removed away until it is shown', () => {
    given([HQ, GONE])
    renderPage()
    expect(screen.queryByText('Old laptop')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(screen.getByText('Old laptop')).toBeTruthy()
    expect(screen.getByText(/Left by itself on 20 Sep/)).toBeTruthy()
  })

  it('says HQ has no site of its own when none is returned, and not while loading', () => {
    given([BUSY])
    renderPage()
    expect(screen.getByText(/no site of its own/)).toBeTruthy()
    cleanup()
    given([], 'ADMIN', true)
    renderPage()
    expect(screen.queryByText(/no site of its own/)).toBeNull()
  })
})

describe('ExecutionSitesPage — anyone who is not an admin @SC-637', () => {
  it('is told only admins can see the settings, and sees no site', () => {
    given([HQ, BUSY], 'MEMBER')
    renderPage()
    expect(screen.getByRole('alert').textContent).toContain("Only an organisation admin can see the organisation's settings.")
    expect(screen.queryByText('office-server')).toBeNull()
  })
})
