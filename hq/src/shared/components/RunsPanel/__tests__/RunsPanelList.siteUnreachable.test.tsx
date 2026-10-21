// @vitest-environment jsdom
/**
 * The Runs panel mapped a session whose site could not be asked to
 * an empty run list, so it read as a session that never ran. The panel now
 * names the site that could not be asked.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const useQuery = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/operations', () => ({
  useQuery,
  useAction: () => vi.fn(),
  getMyRuns: 'getMyRuns',
  stopTaskSession: 'stopTaskSession',
  stopTask: 'stopTask',
  approveManifest: 'approveManifest',
  getNotifications: 'getNotifications',
  getTaskByKey: vi.fn(), getTaskSession: vi.fn(), getSessionPendingManifest: vi.fn(),
}))
vi.mock('wasp/client/webSocket', () => ({ useSocketListener: vi.fn() }))
vi.mock('../../../context/useShellPanels', () => ({ useShellPanels: () => ({ close: vi.fn() }) }))
vi.mock('../../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../../hooks/useAgentImageUrl', () => ({ useAgentImageUrl: () => null }))
vi.mock('../../../hooks/useMayWork', () => ({ useMayWork: () => true, useMayWorkWhere: () => () => true, VIEWER_CANNOT_WORK: '' }))

import { RunsPanelList } from '../RunsPanelList'
import { run } from './runFixtures'

function answer(runs: unknown[]) {
  useQuery.mockImplementation(() => ({ data: runs, isLoading: false, refetch: vi.fn() }))
}

const renderPanel = () => render(<MemoryRouter><RunsPanelList onOpenRequest={vi.fn()} /></MemoryRouter>)

beforeEach(() => vi.clearAllMocks())

describe('the Runs panel when a run’s site could not be asked @SC-530 @SC-418 @SC-646 @SC-647', () => {
  it('names the site that could not be asked, once however many of its runs are affected', () => {
    const silence = { siteId: 'site-down', label: 'Laptop', reason: 'offline' as const, detail: 'Not connected to hq, so it could not be asked.' }
    answer([run('s1', { siteSilence: silence }), run('s2', { siteSilence: silence }), run('s3')])
    renderPanel()

    const notice = screen.getByRole('status')
    expect(notice.textContent).toContain('One Execution Site could not be asked')
    expect(notice.textContent).toContain('Laptop')
  })

  it('shows no notice when every site answered', () => {
    answer([run('s1')])
    renderPanel()

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('leads to the Runs screen from Show all ›', () => {
    answer([run('s1')])
    renderPanel()

    expect(screen.getByRole('link', { name: 'Show all ›' }).getAttribute('href')).toBe('/runs')
  })
})
