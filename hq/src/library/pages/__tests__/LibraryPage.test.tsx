// @vitest-environment jsdom
/** The Library page: one ＋ Add menu for what the person may do, and for a member only the line to Your space. */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import type { LibraryAssets } from '../../assetList/types'
import { SAMPLE } from '../../components/__tests__/fixtures'

const state: { data: LibraryAssets; remove: () => Promise<unknown> } = { data: undefined as never, remove: async () => ({ removed: true }) }

vi.mock('wasp/client/operations', () => ({
  getLibraryAssets: { name: 'getLibraryAssets' },
  removeLibraryAsset: { name: 'removeLibraryAsset' },
  useQuery: () => ({ data: state.data, error: undefined, refetch: () => {} }),
  useAction: () => (...args: unknown[]) => (state.remove as (...a: unknown[]) => Promise<unknown>)(...args),
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({
  AppLayout: ({ action, children, subtitle }: { action?: React.ReactNode; children: React.ReactNode; subtitle?: string }) => (
    <div><p>{subtitle}</p><div data-testid="header-actions">{action}</div>{children}</div>
  ),
}))
vi.mock('../../../assets/pages/review/ProposalsWaiting', () => ({ LibraryReviewLink: () => null }))
vi.mock('../../components/AddAgentDialog', () => ({ AddAgentDialog: () => null }))
vi.mock('../../components/useLibraryTransfer', () => ({ useLibraryTransfer: () => ({ dialog: null, exportOne: async () => {} }) }))
vi.mock('../../components/LibraryAssetList', () => ({
  LibraryAssetList: ({ canAct, filter, onRemove }: { canAct: boolean; filter: { needsYou: boolean }; onRemove: (r: { assetId: string; title: string }) => void }) => (
    <div><p data-testid="list">{`canAct=${canAct} needsYou=${filter.needsYou}`}</p><button onClick={() => onRemove({ assetId: 'a9', title: 'release-notes' })}>remove it</button></div>
  ),
}))

import { LibraryPage } from '../LibraryPage'

afterEach(cleanup)

const admin: LibraryAssets = { rows: SAMPLE, isAdmin: true, mayAdd: true, mayAddFromAgenthix: true, mayAddFromOutside: true, mayMake: true, marketplace: false }
const member: LibraryAssets = { rows: SAMPLE, isAdmin: false, mayAdd: false, mayAddFromAgenthix: false, mayAddFromOutside: false, mayMake: false, marketplace: false }

function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname}{l.search}</output> }
const open = (data: LibraryAssets, at = '/library') => {
  state.data = data
  render(<MemoryRouter initialEntries={[at]}><Where /><LibraryPage /></MemoryRouter>)
}

describe('the Library page @SC-1609 @SC-1630', () => {
  it('gives an administrator one ＋ Add menu holding New skill and the three ways in, and no other Add or New skill button', () => {
    open(admin)
    const header = screen.getByTestId('header-actions')
    expect(within(header).queryByRole('link', { name: /New skill|Add skill/ })).toBeNull()
    fireEvent.click(within(header).getByRole('button', { name: /Add/ }))
    expect(screen.getAllByRole('menuitem')).toHaveLength(4)
    expect(screen.getByRole('menuitem', { name: /^New skill/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /^From Agenthix/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /^Upload a package/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: /^From a link/ }))
    expect(screen.getByTestId('where').textContent).toBe('/library/add?from=link')
  })

  it('opens New skill from the menu', () => {
    open(admin)
    fireEvent.click(within(screen.getByTestId('header-actions')).getByRole('button', { name: /Add/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /^New skill/ }))
    expect(screen.getByTestId('where').textContent).toBe('/library/new-skill')
  })

  it('offers a Library maintainer who may add only from Agenthix just that way, and New skill', () => {
    open({ ...admin, isAdmin: false, mayAddFromOutside: false })
    fireEvent.click(within(screen.getByTestId('header-actions')).getByRole('button', { name: /Add/ }))
    expect(screen.getAllByRole('menuitem').map(i => i.textContent)).toEqual([expect.stringMatching(/^New skill/), expect.stringMatching(/^From Agenthix/)])
  })

  it('shows a member no Add or New skill, but one line to Your space', () => {
    open(member)
    expect(screen.queryByRole('button', { name: /Add/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /New skill|Add/ })).toBeNull()
    const line = screen.getByTestId('library-member-line')
    expect(line.textContent).toContain('Organisation skills are added by admins and Library maintainers.')
    expect(within(line).getByRole('link', { name: 'Your space ›' }).getAttribute('href')).toBe('/space?tool=skills')
    expect(screen.getByTestId('list').textContent).toBe('canAct=false needsYou=false')
  })

  it('says nothing to those who can add, and keeps Needs you in the address', () => {
    open(admin, '/library?show=needs-you')
    expect(screen.queryByTestId('library-member-line')).toBeNull()
    expect(screen.getByTestId('list').textContent).toBe('canAct=true needsYou=true')
  })

  it('keeps Settings in the header on a wide screen and in the ⋮ menu on a phone, for an administrator only', () => {
    open(admin)
    const header = screen.getByTestId('header-actions')
    expect(within(header).getByRole('link', { name: 'Settings' }).className).toContain('hidden lg:inline-block')
    const more = within(screen.getByTestId('library-header-more'))
    expect(more.getByRole('button', { name: 'More' })).toBeTruthy()
    fireEvent.click(more.getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }))
    expect(screen.getByTestId('where').textContent).toBe('/admin/settings/library')
    cleanup()
    open(member)
    expect(screen.queryByTestId('library-header-more')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull()
  })

  it('puts a second ＋ Add at the foot for a phone', () => {
    open(admin)
    expect(screen.getAllByRole('button', { name: /Add/ })).toHaveLength(2)
  })
})

describe('a message is never part of the Library page (owner, 6 November)', () => {
  it('opens a failure to remove in a dialog with Try again, and leaves no line in the page', async () => {
    const remove = vi.fn().mockRejectedValueOnce(new Error('Only administrators remove skills. Nothing was changed.')).mockResolvedValue({ removed: true })
    state.remove = remove
    open(admin)
    fireEvent.click(screen.getByText('remove it'))
    const dialog = await screen.findByRole('dialog', { name: 'release-notes was not removed' })
    expect(dialog.textContent).toContain('Only administrators remove skills. Nothing was changed.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('says nothing after a removal that worked: the list shows it', async () => {
    const remove = vi.fn().mockResolvedValue({ removed: true })
    state.remove = remove
    open(admin)
    fireEvent.click(screen.getByText('remove it'))
    await waitFor(() => expect(remove).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(/was removed from the Library/)).toBeNull()
  })
})
