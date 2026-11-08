// @vitest-environment jsdom
/**
 * On a phone the Runs panel is a screen of its own (the Runs panel design): the shared top bar with ‹ Back out of it,
 * its title, the chat, and Open Workrooms › in its ⋯ rather than a text link in the header.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

const useQuery = vi.hoisted(() => vi.fn())
const close = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/operations', () => ({ useQuery, useAction: () => vi.fn(), getMyRuns: 'getMyRuns' }))
vi.mock('wasp/client/webSocket', () => ({ useSocketListener: vi.fn() }))
vi.mock('../../../context/useShellPanels', () => ({ useShellPanels: () => ({ close }) }))
vi.mock('../../../hooks/useIsMobile', () => ({ useIsMobile: () => true }))
vi.mock('../../../hooks/useAgentImageUrl', () => ({ useAgentImageUrl: () => null }))
vi.mock('../../../hooks/useMayWork', () => ({ useMayWork: () => true, useMayWorkWhere: () => () => true, VIEWER_CANNOT_WORK: '' }))
vi.mock('../../../layouts/useShellCounts', () => ({ useShellCounts: () => ({ unreadNotifications: 0, runsInProgress: 0, runsNeedingYou: 0 }) }))
vi.mock('../../../../dock/DockPhoneButton', () => ({ DockPhoneButton: () => <button type="button" aria-label="Chat" /> }))

import { RunsPanelList } from '../RunsPanelList'

function Where() {
  const { pathname } = useLocation()
  return <output data-testid="where">{pathname}</output>
}

beforeEach(() => {
  vi.clearAllMocks()
  useQuery.mockImplementation(() => ({ data: [], isLoading: false, refetch: vi.fn() }))
})

describe('the Runs panel on a phone', () => {
  it('has the shared top bar: Back, Runs, the chat and ⋯ holding Open Workrooms ›', () => {
    render(<MemoryRouter><RunsPanelList onOpenRequest={vi.fn()} /><Where /></MemoryRouter>)
    const bar = within(screen.getByTestId('mobile-header'))
    expect(bar.getByText('Runs')).toBeTruthy()
    expect(bar.getByRole('button', { name: 'Chat' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Open Workrooms ›' })).toBeNull()
    fireEvent.click(bar.getByRole('button', { name: 'Actions for this screen' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open Workrooms ›' }))
    expect(screen.getByTestId('where').textContent).toBe('/workrooms')
  })

  it('closes from its Back', () => {
    render(<MemoryRouter><RunsPanelList onOpenRequest={vi.fn()} /></MemoryRouter>)
    fireEvent.click(within(screen.getByTestId('mobile-header')).getByRole('button', { name: 'Back' }))
    expect(close).toHaveBeenCalledTimes(1)
  })
})
