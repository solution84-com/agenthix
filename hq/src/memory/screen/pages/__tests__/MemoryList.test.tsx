// @vitest-environment jsdom
/**
 * Given data the list renders it; each control calls the right operation with the right arguments; a refused write
 * and a delete that removed nothing show a message. Refreshing after a write is Wasp's own entity invalidation,
 * which a mock of the operations module cannot run.
 */
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render as renderBare, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const ops = vi.hoisted(() => ({
  useQuery: vi.fn(), saveMemoryItem: vi.fn(), setMemoryPinned: vi.fn(), forgetMemoryItem: vi.fn(),
}))
vi.mock('wasp/client/operations', () => ({
  useQuery: ops.useQuery, useAction: (fn: unknown) => fn, getMemory: 'getMemory',
  saveMemoryItem: ops.saveMemoryItem, setMemoryPinned: ops.setMemoryPinned, forgetMemoryItem: ops.forgetMemoryItem,
}))

import { MemoryList } from '../MemoryList'

const render = (ui: React.ReactElement, url = '/') => renderBare(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>)

const ITEM = {
  id: 'm1', key: 'coffee', scope: 'PERSON' as const, scopeLabel: 'Everyone you work with', agentId: null, placeType: null, placeId: null,
  title: 'Coffee order', body: 'Takes coffee black with no sugar.', kind: 'PREFERENCE' as const, tags: ['food'], pinned: false,
  archived: false, recallCount: 3, usedCount: 2, lastRecalledAt: null, writtenBy: 'Developer', updatedAt: '2026-10-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  ops.useQuery.mockReturnValue({ data: [ITEM], isLoading: false })
  ops.saveMemoryItem.mockResolvedValue(ITEM)
  ops.setMemoryPinned.mockResolvedValue({ ok: true })
  ops.forgetMemoryItem.mockResolvedValue({ ok: true })
})

describe('MemoryList @SC-991', () => {
  it('marks the item a Show in link names, by its key, and no other', () => {
    ops.useQuery.mockReturnValue({ data: [ITEM, { ...ITEM, id: 'm2', key: 'tea', title: 'Tea order' }], isLoading: false })
    const { container } = render(<MemoryList scope={{ scope: 'PERSON' }} />, '/?tool=memory&memory=tea')
    const marked = container.querySelectorAll('[data-marked="true"]')
    expect(marked).toHaveLength(1)
    expect(marked[0]!.textContent).toContain('Tea order')
  })

  it('shows the title, body, kind, tags, hit counts and who wrote it', () => {
    render(<MemoryList scope={{ scope: 'PERSON' }} />)
    expect(screen.getByText('Coffee order')).toBeTruthy()
    expect(screen.getByText('Takes coffee black with no sugar.')).toBeTruthy()
    expect(screen.getByText(/Preference · food · Never recalled · Recalled 3 times, relied on 2 times · Written by Developer/)).toBeTruthy()
  })

  it('asks for archived items only when told to', () => {
    render(<MemoryList scope={{ scope: 'PERSON' }} />)
    expect(ops.useQuery).toHaveBeenLastCalledWith('getMemory', { scope: 'PERSON', includeArchived: false })
    fireEvent.click(screen.getByLabelText('Show archived'))
    expect(ops.useQuery).toHaveBeenLastCalledWith('getMemory', { scope: 'PERSON', includeArchived: true })
  })

  it('pins and unpins', async () => {
    render(<MemoryList scope={{ scope: 'PERSON' }} />)
    fireEvent.click(screen.getByText('Pin'))
    await waitFor(() => expect(ops.setMemoryPinned).toHaveBeenCalledWith({ id: 'm1', pinned: true }))
  })

  it('saves an edit under the item id, in the list\'s scope', async () => {
    render(<MemoryList scope={{ scope: 'AGENT_PERSON', agentId: 'a1' }} />)
    fireEvent.click(screen.getByText('Edit'))
    fireEvent.change(screen.getAllByLabelText('Title')[0], { target: { value: 'Coffee, black' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(ops.saveMemoryItem).toHaveBeenCalledWith({
      scope: 'AGENT_PERSON', agentId: 'a1', id: 'm1',
      title: 'Coffee, black', body: 'Takes coffee black with no sugar.', kind: 'PREFERENCE', tags: ['food'],
    }))
  })

  it('adds a new memory without an id', async () => {
    ops.useQuery.mockReturnValue({ data: [], isLoading: false })
    render(<MemoryList scope={{ scope: 'PERSON' }} />)
    expect(screen.getByText('Nothing is remembered here yet.')).toBeTruthy()
    const [title] = screen.getAllByLabelText('Title')
    fireEvent.change(title, { target: { value: 'Timezone' } })
    fireEvent.change(screen.getByLabelText('What is remembered'), { target: { value: 'Works in London time.' } })
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'work, time' } })
    fireEvent.click(screen.getByText('Add'))
    await waitFor(() => expect(ops.saveMemoryItem).toHaveBeenCalledWith({
      scope: 'PERSON', title: 'Timezone', body: 'Works in London time.', kind: 'FACT', tags: ['work', 'time'],
    }))
  })

  it('deletes, and says so when it was already gone', async () => {
    render(<MemoryList scope={{ scope: 'PERSON' }} />)
    fireEvent.click(screen.getByText('Delete'))
    await waitFor(() => expect(ops.forgetMemoryItem).toHaveBeenCalledWith({ id: 'm1' }))
    ops.forgetMemoryItem.mockResolvedValue({ ok: false })
    fireEvent.click(screen.getByText('Delete'))
    expect((await screen.findByRole('alert')).textContent).toBe('That memory is already gone.')
  })

  it('shows a refused write', async () => {
    ops.saveMemoryItem.mockRejectedValue(new Error('A memory must stand alone'))
    ops.useQuery.mockReturnValue({ data: [], isLoading: false })
    render(<MemoryList scope={{ scope: 'PERSON' }} />)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Thing' } })
    fireEvent.change(screen.getByLabelText('What is remembered'), { target: { value: 'do that' } })
    fireEvent.click(screen.getByText('Add'))
    expect((await screen.findByRole('alert')).textContent).toBe('A memory must stand alone')
  })
})
