// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { answers, asAdmin, asMember, asOrgAdminOnly, calls, layoutFake, useQueryFake } from './harness'

const { check } = vi.hoisted(() => ({ check: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (op: string, args?: unknown) => useQueryFake(op, args),
  getUserSettings: 'getUserSettings',
  getFleetAccess: 'getFleetAccess',
  getDiagnosticsHealth: 'getDiagnosticsHealth',
  getRecentErrors: 'getRecentErrors',
  checkDiagnosticsHealthNow: (...a: unknown[]) => check(...a),
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({ AppLayout: layoutFake }))

import { DiagnosticsPage } from '../DiagnosticsPage'

const now = new Date()
const health = {
  checkedAt: now,
  hq: { runningSince: new Date(now.getTime() - 86_400_000), version: '0.4.0', commit: 'abc', built: '', databaseAnswers: true, schedulerLastTick: { at: now, ok: true }, sitesKnown: 2 },
  sites: [
    { executionSiteId: 'e1', siteId: 's1', label: 'HQ site', isDefault: true, status: 'ONLINE', connected: true, group: 'running', problems: [], protocolVersion: '1.0',
      health: { takenAt: '', runs: { running: 2, maxAtOnce: 4 }, disk: { freeBytes: 182e9, totalBytes: 500e9 }, docker: { running: true, version: '27', }, agentImage: { name: 'a', present: true, version: '0.4.0' }, ceilings: null, memoryNearlyFull: false },
      healthReportedAt: now, runStore: 'answers', runStoreDetail: null },
    { executionSiteId: 'e2', siteId: 's2', label: 'Build server 2', isDefault: false, status: 'ONLINE', connected: true, group: 'needsYou', problems: [{ kind: 'dockerDown' }], protocolVersion: '1.0',
      health: null, healthReportedAt: null, runStore: 'no-answer', runStoreDetail: 'Its run store did not answer' },
  ],
}
const group = (over: object) => ({
  key: 'k', origin: 'run', title: 'A run could not sign in to Claude', advice: 'They renew it in Settings.', count: 3, firstAt: now, lastAt: now,
  ongoing: false, detail: null, site: { executionSiteId: 'e1', siteId: 's1', label: 'HQ site' }, agent: { id: 'a1', name: 'Frontend dev' },
  project: null, runLink: '/runs/r1?session=s1', siteLink: null, chatRun: false, ...over,
})

const show = () => render(<MemoryRouter><DiagnosticsPage /></MemoryRouter>)

beforeEach(() => { cleanup(); calls.length = 0; check.mockReset() })

describe('Logs and diagnostics @SC-724', () => {
  it('tells a member that only admins can see it, and asks for nothing of the page', () => {
    asMember()
    show()
    expect(screen.getByRole('alert').textContent).toContain('Only an organisation admin can see Infrastructure.')
    expect(screen.queryByText('Health now')).toBeNull()
  })

  it('shows an organisation admin who is not a fleet admin the recent errors, and no figures, logs or bundle', () => {
    asOrgAdminOnly()
    answers.current.getRecentErrors = { groups: [] }
    show()
    expect(screen.getAllByText(/shown to fleet admins/)).toHaveLength(2)
    expect(screen.queryByText(/Health now/)).toBeNull()
    expect(screen.queryByRole('link', { name: 'Logs' })).toBeNull()
    expect(calls.map((c) => c.name)).not.toContain('getDiagnosticsHealth')
  })

  it('shows an admin the breadcrumb, a card for HQ and one for each site opening its page', () => {
    asAdmin()
    answers.current.getDiagnosticsHealth = health
    answers.current.getRecentErrors = { range: '24h', since: now, groups: [] }
    show()
    expect(screen.getByTestId('layout').getAttribute('data-crumbs')).toBe('Organisation / Infrastructure / Logs and diagnostics')
    const cards = within(screen.getByRole('region', { name: 'Health' })).getAllByRole('link')
    expect(cards.map(c => c.getAttribute('href'))).toEqual([
      '/org/infrastructure/hq', '/org/settings/where-work-runs/e1', '/org/settings/where-work-runs/e2',
    ])
    expect(cards[0].textContent).toContain('Database answering')
    expect(cards[1].textContent).toContain('2 of 4 runs')
    expect(cards[2].textContent).toContain('Docker is not running')
    expect(cards[2].textContent).toContain('Its run store did not answer')
  })

  it('lists errors with their advice and the link they carry; a chat run has none @SC-726', () => {
    asAdmin()
    answers.current.getDiagnosticsHealth = health
    answers.current.getRecentErrors = {
      range: '24h', since: now,
      groups: [
        group({}),
        group({ key: 'd', origin: 'site', title: 'Docker is not running on Build server 2', advice: 'Every run there fails.', ongoing: true, runLink: null, siteLink: '/org/settings/where-work-runs/e2', agent: null }),
        group({ key: 'c', title: 'A chat run ended with an error', count: 1, runLink: null, chatRun: true }),
      ],
    }
    show()
    const errors = within(screen.getByRole('region', { name: 'Recent errors' }))
    expect(errors.getByText('Open the run').getAttribute('href')).toBe('/runs/r1?session=s1')
    expect(errors.getByText('Open the site').getAttribute('href')).toBe('/org/settings/where-work-runs/e2')
    expect(errors.getAllByText(/They renew it in Settings/).length).toBe(2)
    expect(errors.getAllByText(/3 times/).length).toBe(1)
    expect(errors.getByText(/since /)).toBeTruthy()
    expect(errors.getAllByRole('link').length).toBe(2)
    expect(errors.getByText(/its owner's/)).toBeTruthy()
  })

  it('asks for seven days with All · last 7 days @SC-726', () => {
    asAdmin()
    answers.current.getDiagnosticsHealth = health
    answers.current.getRecentErrors = { range: '24h', since: now, groups: [] }
    show()
    fireEvent.click(screen.getByText('All · last 7 days'))
    expect(calls.filter(c => c.name === 'getRecentErrors').pop()?.args).toEqual({ range: '7d' })
  })

  it('Check again asks the sites now and shows what came back @SC-725', async () => {
    asAdmin()
    answers.current.getDiagnosticsHealth = { ...health, checkedAt: new Date(0) }
    answers.current.getRecentErrors = { range: '24h', since: now, groups: [] }
    check.mockResolvedValue({ ...health, sites: [health.sites[0]], sitesAsked: 1 })
    show()
    expect(screen.getAllByRole('link').filter(l => l.getAttribute('href')?.includes('/where-work-runs/')).length).toBe(2)
    fireEvent.click(screen.getByText('Check again'))
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByText('Build server 2')).toBeNull())
  })

  it('offers the logs and the support bundle as buttons', () => {
    asAdmin()
    answers.current.getDiagnosticsHealth = health
    answers.current.getRecentErrors = { range: '24h', since: now, groups: [] }
    show()
    expect(screen.getByText('Logs').closest('a')?.getAttribute('href')).toBe('/org/infrastructure/diagnostics/logs')
    expect(screen.getByText('Download support bundle').closest('a')?.getAttribute('href')).toBe('/org/infrastructure/diagnostics/bundle')
  })
})
