// @vitest-environment jsdom
/** The Billing profiles page: the list with its default, make/rename/archive, and archived profiles apart. */
import { withFeature } from '@agenthix/core/testing'
import React from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/tasks')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => ({ ...(await importOriginal<object>()), MoreHorizontal: () => null }))

const h = vi.hoisted(() => ({ data: {} as Record<string, unknown>, error: undefined as Error | undefined, actions: {} as Record<string, ReturnType<typeof vi.fn>> }))
vi.mock('wasp/client/operations', async () => {
  const { featuresAnswer } = await import('../../../test/featuresAnswer')
  const names = ['getBillingProfiles', 'createBillingProfile', 'renameBillingProfile', 'makeDefaultBillingProfile', 'archiveBillingProfile', 'getFeatures']
  return {
    ...Object.fromEntries(names.map(n => [n, n])),
    useQuery: (op: string) => op === 'getFeatures' ? { data: featuresAnswer() } : ({ data: h.data[op], error: h.error, dataUpdatedAt: Date.now(), refetch: vi.fn() }),
    useAction: (op: string) => (h.actions[op] ??= vi.fn().mockResolvedValue({})),
  }
})
vi.mock('../../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

import { BillingProfilesPage } from '../BillingProfilesPage'

const profile = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, isDefault: false, createdAt: '2026-10-01T00:00:00Z', archivedAt: null, projectCount: 0, projects: [], thisMonth: [], ...extra,
})
const fern = profile('p1', 'Fernhill', { isDefault: true, projectCount: 1, projects: [{ id: 'a', name: 'Bookkeeping' }], thisMonth: [
  { currency: 'USD', basis: 'ACTUAL', amountMicros: 41_200_000 }, { currency: 'USD', basis: 'ESTIMATED', amountMicros: 6_100_000 }] })
const clientX = profile('p2', 'Client X', { projectCount: 2, projects: [{ id: 'b', name: 'Website relaunch' }, { id: 'c', name: 'Onboarding' }] })
const old = profile('p3', 'Old lab', { archivedAt: '2026-09-01T00:00:00Z' })

const act = (n: string) => (h.actions[n] ??= vi.fn().mockResolvedValue({}))
const show = () => render(<MemoryRouter><BillingProfilesPage /></MemoryRouter>)
beforeEach(() => { h.data = { getBillingProfiles: { month: '2026-10', timeZone: 'UTC', profiles: [fern, clientX, old] } } })
afterEach(() => { cleanup(); h.data = {}; h.error = undefined; h.actions = {} })

describe('the Billing profiles page and Agenthix Cloud (adr-0189)', () => {
  it('names no Cloud while its flag is off, in the key or in a new profile\'s name hint', () => {
    show()
    expect(document.body.textContent).not.toContain('Agenthix Cloud')
    fireEvent.click(screen.getByRole('button', { name: 'New billing profile' }))
    expect(document.body.textContent).toContain('Shown on cost reports.')
    expect(document.body.textContent).not.toContain('Agenthix Cloud')
  })

  withFeature('cloud', () => {
    it('says which basis is through Agenthix Cloud, and that a profile\'s name reaches its bill', () => {
      show()
      expect(document.body.textContent).toContain('through Agenthix Cloud')
      fireEvent.click(screen.getByRole('button', { name: 'New billing profile' }))
      expect(document.body.textContent).toContain("to Agenthix Cloud on your bill's lines")
    })
  })
})

describe('the Billing profiles page @SC-1216 @SC-1935', () => {
  it('says nothing about a failed read while the profiles on screen are fresh, and says it in place when there are none', () => {
    h.error = new Error('down')
    const { unmount } = show()
    expect(screen.getByText('Fernhill', { selector: 'h3' })).toBeTruthy()
    expect(screen.queryByText(/could not be read/)).toBeNull()
    unmount()
    h.data = {}
    show()
    expect(screen.getByRole('status').textContent).toContain('The billing profiles could not be read')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText('Loading…')).toBeNull()
  })

  it('lists the profiles, marks the default, and gives this month per basis', () => {
    show()
    const line = screen.getByText('Fernhill', { selector: 'h3' }).closest('li')!
    expect(within(line).getByText('Default')).toBeTruthy()
    expect(within(line).getByText(/This month: \$41\.20 actual · \$6\.10 estimated/)).toBeTruthy()
    expect(within(line).queryByRole('button', { name: 'Make default' })).toBeNull()
    const other = screen.getByText('Client X', { selector: 'h3' }).closest('li')!
    expect(within(other).getByText(/2 projects: Website relaunch, Onboarding/)).toBeTruthy()
    expect(within(other).getByText(/Nothing yet/)).toBeTruthy()
  })

  it('shows archived profiles apart, with no actions', () => {
    show()
    const archived = screen.getByRole('region', { name: 'Archived billing profiles' })
    expect(within(archived).getByText(/Old lab/)).toBeTruthy()
    expect(screen.queryByText('Old lab', { selector: 'h3' })).toBeNull()
  })

  it('makes another profile the default', async () => {
    show()
    fireEvent.click(within(screen.getByText('Client X', { selector: 'h3' }).closest('li')!).getByRole('button', { name: 'Make default' }))
    await waitFor(() => expect(act('makeDefaultBillingProfile')).toHaveBeenCalledWith({ id: 'p2' }))
  })

  it('makes a profile with the projects picked for it', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'New billing profile' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'R&D' } })
    fireEvent.click(screen.getByLabelText(/Bookkeeping/))
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(act('createBillingProfile')).toHaveBeenCalledWith({ name: 'R&D', projectIds: ['a'] }))
  })

  it('archives one after choosing where its projects go, and says what is refused', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'More about Client X' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))
    expect(screen.getByText(/Its 2 projects move to another billing profile/)).toBeTruthy()
    expect((screen.getByLabelText('Move its projects to') as HTMLSelectElement).value).toBe('p1')
    act('archiveBillingProfile').mockRejectedValueOnce(new Error('A project still uses it'))
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(await screen.findByText('A project still uses it')).toBeTruthy()
    act('archiveBillingProfile').mockResolvedValueOnce({})
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(act('archiveBillingProfile')).toHaveBeenLastCalledWith({ id: 'p2', moveProjectsTo: 'p1' }))
  })

  it('does not offer to archive the default, and renames', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'More about Fernhill' }))
    expect(screen.queryByRole('menuitem', { name: 'Archive' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Fernhill Ltd' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(act('renameBillingProfile')).toHaveBeenCalledWith({ id: 'p1', name: 'Fernhill Ltd' }))
  })

  it('says it is loading, and shows a refusal', () => {
    h.data = {}
    show()
    expect(screen.getByText('Loading…')).toBeTruthy()
    cleanup()
    h.error = new Error('Only an organisation admin sees billing profiles.')
    show()
    expect(screen.getByText('The billing profiles could not be read')).toBeTruthy()
    expect(screen.getByText('HQ did not answer.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
