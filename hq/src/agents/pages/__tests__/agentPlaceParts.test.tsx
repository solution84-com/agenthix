// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { UsageTotals } from '../../usageTotals'

const ops = vi.hoisted(() => ({ role: undefined as string | undefined, loading: false }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: ops.loading ? undefined : { role: ops.role }, isLoading: ops.loading }),
  getUserSettings: 'getUserSettings',
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

import { UsageRows } from '../place/UsageRows'
import { nowCount, usageCount } from '../place/agentPlaceCounts'
import { ManageGate, useOrgAdminState, MANAGE_REFUSAL } from '../manage/ManageGate'
import { ManageMenu } from '../manage/ManageMenu'

afterEach(() => { cleanup(); ops.role = undefined; ops.loading = false })

const totals = (over: Partial<UsageTotals>): UsageTotals => ({
  runCount: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0,
  costUsd: 0, unpricedTokens: 0, energyKwh: 0, ...over,
})

describe('Usage on an agent’s place @SC-580 @SC-1931', () => {
  it('has two rows, Your usage and Organisation usage, each with its estimate', () => {
    render(<UsageRows yours={totals({ runCount: 3, totalTokens: 12_000, costUsd: 4.2 })} organisation={totals({ runCount: 40, totalTokens: 900_000, costUsd: 61.8 })} />)
    const rows = screen.getAllByTestId('usage-row')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('Your usage')).toBeTruthy()
    expect(within(rows[0]).getByText('~$4.20')).toBeTruthy()
    expect(within(rows[1]).getByText('Organisation usage')).toBeTruthy()
    expect(within(rows[1]).getByText('~$61.80')).toBeTruthy()
  })

  it('says so when a row has no usage, and when a model had no price', () => {
    render(<UsageRows yours={totals({})} organisation={totals({ runCount: 1, totalTokens: 10, unpricedTokens: 10 })} />)
    expect(screen.getByText('No usage yet')).toBeTruthy()
    expect(screen.getByText(/no price/)).toBeTruthy()
  })

  it('shows only the organisation’s row on the settings page', () => {
    render(<UsageRows organisation={totals({ runCount: 1, totalTokens: 10, costUsd: 1 })} />)
    expect(screen.getAllByTestId('usage-row')).toHaveLength(1)
  })

  it('writes the tools list’s counts', () => {
    expect(usageCount({ yours: totals({ runCount: 1, costUsd: 4.2 }), organisation: totals({ runCount: 9, costUsd: 61.8 }) })).toBe('yours ~$4.20 · organisation ~$61.80')
    expect(usageCount(undefined)).toBeUndefined()
    expect(nowCount({ needsYouCount: 1, runningCount: 1 })).toEqual({ count: '1 needs you · 1 running', tone: 'needs' })
    expect(nowCount({ needsYouCount: 0, runningCount: 2 })).toEqual({ count: '2 running', tone: 'live' })
    expect(nowCount({ needsYouCount: 0, runningCount: 0 })).toEqual({})
  })
})

function Probe() {
  const state = useOrgAdminState()
  return <ManageGate state={state}><p>the management page</p></ManageGate>
}
const renderProbe = () => render(<MemoryRouter><Probe /></MemoryRouter>)

describe('Organisation › Agents refuses anyone but an organisation admin @SC-581', () => {
  it.each(['MEMBER'])('a %s is told so and sees nothing of the page', (role) => {
    ops.role = role
    renderProbe()
    expect(screen.getByRole('status').textContent).toContain(MANAGE_REFUSAL)
    expect(screen.queryByText('the management page')).toBeNull()
  })

  it('shows nothing, not the page, while the role is not known', () => {
    ops.loading = true
    renderProbe()
    expect(screen.queryByText('the management page')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('an admin gets the page', () => {
    ops.role = 'ADMIN'
    renderProbe()
    expect(screen.getByText('the management page')).toBeTruthy()
  })
})

describe('an agent’s ⋯ menu @SC-581', () => {
  it('has Stop its runs and Delete', () => {
    render(<ManageMenu isKernel={false} onStop={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('More'))
    expect(screen.getByText('Stop its runs')).toBeTruthy()
    expect(screen.getByText('Delete')).toBeTruthy()
  })

  it('has no Delete on the built-in agent', () => {
    render(<ManageMenu isKernel onStop={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('More'))
    expect(screen.getByText('Stop its runs')).toBeTruthy()
    expect(screen.queryByText('Delete')).toBeNull()
  })
})
