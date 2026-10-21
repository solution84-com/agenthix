// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

const ops = vi.hoisted(() => ({ useQuery: vi.fn() }))

vi.mock('wasp/client/operations', () => ({
  useQuery: ops.useQuery,
  getSiteDetail: 'getSiteDetail',
  getUserSettings: 'getUserSettings',
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { SitePage } from '../SitePage'
import type { SiteDetail } from '../../siteViews'

const C = { memoryBytesPerContainer: 8 * 1024 ** 3, cpusPerContainer: 4, processesPerContainer: 512, containersAtOnce: 4 }

const detail = (over: Partial<SiteDetail>): SiteDetail => ({
  id: 'row-1', siteId: 'site-1', label: 'Build server', status: 'ONLINE', connected: true, isDefault: false,
  registeredAt: new Date(2026, 8, 3), lastSeenAt: new Date(), protocolVersion: '1.0', hqProtocol: '1.0',
  projectCount: 1, waiting: { runs: 0, changes: 0 }, figures: false, load: { running: 1, maxAtOnce: 4, ceilings: { ceilings: C, machine: C } }, health: null, healthReportedAt: null, removal: null,
  hosting: 'self-hosted', scheduled: null, cause: null,
  group: 'running', problems: [], siteUrl: null, approvedBy: { userId: 'u', name: 'Avery', handle: 'avery', avatarUrl: null, state: 'active' } as never,
  createdById: null, projects: [{ id: 'p', name: 'Mobile app', key: 'MOB' }], hiddenProjects: 0,
  workspaces: { count: 1, named: [{ id: 'w', name: 'release-branch', projectName: 'Mobile app' }] }, peopleWithFiles: 3, runningTasks: [], ...over,
})

function given(site: SiteDetail, role: 'ADMIN' | 'MEMBER' = 'ADMIN') {
  ops.useQuery.mockImplementation((fn: unknown) =>
    fn === 'getSiteDetail' ? { data: site, refetch: vi.fn() } : { data: { role }, isLoading: false })
}

const renderPage = () => render(
  <MemoryRouter initialEntries={['/org/settings/where-work-runs/row-1']}>
    <Routes><Route path="/org/settings/where-work-runs/:executionSiteId" element={<SitePage />} /></Routes>
  </MemoryRouter>,
)

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SitePage — one site, read-only @SC-638', () => {
  it('a busy site says nothing is wrong, lists the runs going and those waiting, and what each run gets', () => {
    given(detail({
      label: 'office-server', load: { running: 4, maxAtOnce: 4, ceilings: { ceilings: C, machine: C } }, waiting: { runs: 0, changes: 0, atCapacity: 3 },
      runningTasks: [{ key: 'ACME-142', title: 'Calibrate gripper', agentName: 'Kernel' }, { key: 'ACME-150', title: 'Retrain detector', agentName: null }],
      projects: [{ id: 'p1', name: 'Robot arm firmware', key: 'RAF' }, { id: 'p2', name: 'Vision pipeline', key: 'VIS' }], projectCount: 2,
    }))
    renderPage()
    expect(screen.getByText('Busy — all 4 runs are going, so new runs wait for a place. Nothing is wrong with the site.')).toBeTruthy()
    expect(screen.getByText('ACME-142 Calibrate gripper · ACME-150 Retrain detector')).toBeTruthy()
    expect(screen.getByText('3 runs, in the order they were asked. They start as runs finish.')).toBeTruthy()
    expect(screen.getByText('8 GB')).toBeTruthy()
    expect(screen.getByText('Robot arm firmware, Vision pipeline')).toBeTruthy()
    expect(screen.getByText('None scheduled')).toBeTruthy()
    expect(screen.getByText('Self-hosted', { selector: 'dd, div' })).toBeTruthy()
  })

  it('shows the scheduled change and tells that members have been told', () => {
    given(detail({ scheduled: { kind: 'upgrade', at: new Date(Date.UTC(2026, 9, 18, 2, 0)), expectedMinutes: 20, detail: null } }))
    renderPage()
    expect(screen.getByText(/Scheduled maintenance: upgrade .* about 20 minutes\. From .* no new runs start there; members of its projects have been told\./)).toBeTruthy()
  })

  it("hq's own site that is not connected names its cause, who acts, and what it stops", () => {
    given(detail({
      label: 'hq-box', isDefault: true, status: 'OFFLINE', connected: false, group: 'needsYou', cause: 'secretTooShort', lastSeenAt: null,
      waiting: { runs: 3, changes: 0 }, projectCount: 2,
      projects: [{ id: 'p1', name: 'Robot arm firmware', key: 'RAF' }, { id: 'p2', name: 'Vision pipeline', key: 'VIS' }],
    }))
    renderPage()
    expect(screen.getByText('Unavailable: its pairing secret is too short')).toBeTruthy()
    expect(screen.getByText(/at least 32 characters/)).toBeTruthy()
    expect(screen.getByText(/Who acts: HQ's machine admin, or your fleet admins\. Your fleet admins have been told\./)).toBeTruthy()
    expect(screen.getByText("Robot arm firmware, Vision pipeline can't run or open their files")).toBeTruthy()
    expect(screen.getByText('3 runs, starting when it connects')).toBeTruthy()
  })

  const health = { takenAt: '', runs: { running: 1, maxAtOnce: 4 }, disk: { freeBytes: 182e9, totalBytes: 500e9 }, docker: { running: true, version: '27' }, agentImage: { name: 'a', present: true, version: '0.4.0' }, ceilings: null, memoryNearlyFull: false }

  it('a fleet admin sees the figures, the versions and the logs under the sentence @SC-638 @SC-939', () => {
    given(detail({ figures: true, health, protocolVersion: '1.0', hqProtocol: '1.0' }))
    renderPage()
    expect(screen.getByText('182 GB free of 500 GB')).toBeTruthy()
    expect(screen.getByText('1.0 — works with HQ')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Logs and diagnostics' })).toBeTruthy()
  })

  it('a member or organisation admin without the role sees none of them', () => {
    given(detail({ figures: false }))
    renderPage()
    expect(screen.queryByText(/GB free|Protocol|Docker/)).toBeNull()
    expect(screen.queryByRole('link', { name: 'Logs and diagnostics' })).toBeNull()
  })

  it('has no control at all, and points to the Fleet Console', () => {
    given(detail({}))
    renderPage()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Sites are looked after by your fleet admins, in the Fleet Console.')).toBeTruthy()
  })

  it('shows a Cloud site as Cloud', () => {
    given(detail({ hosting: 'cloud' }))
    renderPage()
    expect(screen.getAllByText('Cloud').length).toBeGreaterThan(0)
  })

  it('a removed site says who removed it', () => {
    given(detail({ status: 'REVOKED', connected: false, group: 'removed', removal: { at: new Date(2026, 8, 20), by: null, leftByItself: true }, projectCount: 0 }))
    renderPage()
    expect(screen.getByText(/Left by itself on 20 Sep/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows nothing of the site to anyone who is not an admin', () => {
    given(detail({}), 'MEMBER')
    renderPage()
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.queryByText('Mobile app', { exact: false })).toBeNull()
  })
})
