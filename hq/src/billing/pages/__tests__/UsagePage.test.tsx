// @vitest-environment jsdom
/** The Usage page: the month, the time zone, totals with each currency and basis apart, and the export. */
import React from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({
  data: {} as Record<string, unknown>, error: undefined as Error | undefined, args: [] as unknown[],
  actions: {} as Record<string, ReturnType<typeof vi.fn>>, get: vi.fn(),
}))
vi.mock('wasp/client/operations', () => ({
  getBillingProfiles: 'getBillingProfiles', getUsageReport: 'getUsageReport', setOrganisationTimeZone: 'setOrganisationTimeZone',
  useQuery: (op: string, args: unknown) => { if (op === 'getUsageReport') h.args.push(args); return { data: h.data[op], error: h.error, refetch: vi.fn() } },
  useAction: (op: string) => (h.actions[op] ??= vi.fn().mockResolvedValue({})),
}))
vi.mock('wasp/client/api', () => ({ api: { get: (...a: unknown[]) => h.get(...a) } }))
vi.mock('../../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

import { UsagePage } from '../UsagePage'

const total = (basis: string, amountMicros: number | null, currency: string | null = 'USD', calls = 3) => ({ basis, amountMicros, currency, calls })
const report = {
  month: '2026-10', timeZone: 'Europe/Paris', from: '', to: '', groupBy: 'profile',
  rows: [
    { billingProfileId: 'p1', billingProfileName: 'Fernhill', key: null, name: 'Fernhill', totals: [
      total('ACTUAL', 41_200_000), total('ESTIMATED', 6_100_000), total('ESTIMATED', 2_000_000, 'EUR'), total('INCLUDED', null, null, 12), total('UNPRICED', null, null, 1)] },
    { billingProfileId: 'p2', billingProfileName: 'Client X', key: null, name: 'Client X', totals: [total('AWAITING_ACTUAL', null, null, 5)] },
  ],
}
const profiles = { month: '2026-10', timeZone: 'Europe/Paris', profiles: [{ id: 'p1', name: 'Fernhill' }, { id: 'p2', name: 'Client X' }] }
const show = () => render(<MemoryRouter><UsagePage /></MemoryRouter>)
const act = (n: string) => (h.actions[n] ??= vi.fn().mockResolvedValue({}))

beforeEach(() => { h.data = { getBillingProfiles: profiles, getUsageReport: report }; h.args = [] })
afterEach(() => { cleanup(); h.data = {}; h.error = undefined; h.actions = {}; h.get.mockReset() })

describe('the Usage page', () => {
  it('opens on the current month and keeps each currency and basis apart', () => {
    show()
    expect(screen.getByRole('heading', { name: 'Usage · October 2026' })).toBeTruthy()
    const row = screen.getByRole('row', { name: /Fernhill/ })
    expect(within(row).getByText('$41.20')).toBeTruthy()
    expect(within(row).getByText('$6.10')).toBeTruthy()
    expect(within(row).getByText('€2.00')).toBeTruthy()
    expect(within(row).getByText('12 calls')).toBeTruthy()
    expect(within(row).getByText('1 call')).toBeTruthy()
    expect(within(screen.getByRole('row', { name: /Client X/ })).getByText('5 calls')).toBeTruthy()
  })

  it('explains each basis in words', () => {
    show()
    for (const label of ['Actual', 'Estimated', 'Awaiting Agenthix Cloud', 'Included in subscriptions', 'Unpriced']) {
      expect(screen.getByRole('columnheader', { name: label })).toBeTruthy()
    }
    expect(screen.getByText(/It matches Agenthix Cloud's bill/)).toBeTruthy()
    expect(screen.getByText(/They are counted, but have no cost here/)).toBeTruthy()
  })

  it('asks for the previous month and the chosen grouping', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'person' } })
    expect(h.args.at(-1)).toEqual({ month: '2026-09', groupBy: 'person' })
    expect((screen.getByRole('button', { name: 'Next month' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('cannot go past the current month', () => {
    show()
    expect((screen.getByRole('button', { name: 'Next month' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows the time zone and changes it', async () => {
    show()
    const zone = screen.getByLabelText(/time zone/) as HTMLSelectElement
    expect(zone.value).toBe('Europe/Paris')
    fireEvent.change(zone, { target: { value: 'UTC' } })
    await waitFor(() => expect(act('setOrganisationTimeZone')).toHaveBeenCalledWith({ timeZone: 'UTC' }))
  })

  it('exports the month as CSV, for the chosen profile', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    h.get.mockReturnValue({ blob: () => Promise.resolve(new Blob(['a'])) })
    show()
    fireEvent.change(screen.getByLabelText('Billing profile'), { target: { value: 'p2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
    await waitFor(() => expect(h.get).toHaveBeenCalledWith('api/v1/usage/export', { searchParams: { month: '2026-10', profile: 'p2' } }))
  })

  it('says when the export fails', async () => {
    h.get.mockReturnValue({ blob: () => Promise.reject(new Error('x')) })
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
    expect((await screen.findByRole('alert')).textContent).toContain('did not finish')
  })

  it('says when nothing was used, and when it is loading or refused', () => {
    h.data = { getBillingProfiles: profiles, getUsageReport: { ...report, rows: [] } }
    show()
    expect(screen.getByText('Nothing was used this month.')).toBeTruthy()
    cleanup()
    h.data = {}
    show()
    expect(screen.getByText('Loading…')).toBeTruthy()
    cleanup()
    h.error = new Error('Only an organisation admin sees usage.')
    show()
    expect(screen.getAllByRole('alert')[0].textContent).toContain('Only an organisation admin')
  })
})
