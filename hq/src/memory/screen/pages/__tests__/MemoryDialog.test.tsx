// @vitest-environment jsdom
/**
 * The memory dialog (spec decisions 6, 11, 12): the two switches, each press saved at once; what the memory says,
 * read only; who saved it where; Forget behind a confirm; *All your memory ›* only when opened outside the screen.
 */
import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render as renderBare, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const ops = vi.hoisted(() => ({ useQuery: vi.fn(), setMemoryScope: vi.fn(), forgetMemoryItem: vi.fn(), toast: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: ops.useQuery, useAction: (fn: unknown) => fn, getMemory: 'getMemory',
  setMemoryScope: ops.setMemoryScope, forgetMemoryItem: ops.forgetMemoryItem,
}))
vi.mock('@agenthix/ui/attention', async () => {
  const actual = await vi.importActual<typeof import('@agenthix/ui/attention')>('@agenthix/ui/attention')
  return { ...actual, toast: ops.toast }
})

import { MemoryDialog } from '../MemoryDialog'

const render = (ui: React.ReactElement) => renderBare(<MemoryRouter>{ui}</MemoryRouter>)

const ITEM = {
  id: 'm1', key: 'tables', agent: { id: 'a1', name: 'Kernel' }, place: { type: 'project' as const, id: 'p1', name: 'Shop' },
  savedBy: { id: 'a1', name: 'Kernel' }, savedIn: { type: 'project' as const, id: 'p1', name: 'Shop' }, savedInConversationId: null as string | null,
  title: 'Use a table when comparing options', body: 'One row per option, columns for cost and risk.', kind: 'RULE' as const,
  tags: ['format'], archived: false, recallCount: 9, usedCount: 4, lastRecalledAt: null,
  createdAt: '2026-11-06T14:02:00', updatedAt: '2026-11-06T14:02:00',
}

const radio = (group: string, name: string) => within(screen.getByRole('radiogroup', { name: group })).getByRole('radio', { name })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-12T20:00:00'))
  ops.useQuery.mockReturnValue({ data: [ITEM], isLoading: false })
  ops.setMemoryScope.mockResolvedValue({ itemId: 'm1' })
  ops.forgetMemoryItem.mockResolvedValue({ ok: true })
})

afterEach(() => { vi.useRealTimers() })

describe('the memory dialog @SC-2109', () => {
  it('reads the one memory, archived or not, of the person', () => {
    render(<MemoryDialog itemId="m1" onClose={() => {}} />)
    expect(ops.useQuery).toHaveBeenLastCalledWith('getMemory', { id: 'm1', includeArchived: true })
  })

  it('shows the two switches on the memory\'s own agent and place', () => {
    render(<MemoryDialog itemId="m1" onClose={() => {}} />)
    expect(radio('Which agents remember it', 'Kernel').getAttribute('aria-checked')).toBe('true')
    expect(radio('Which agents remember it', 'Every agent').getAttribute('aria-checked')).toBe('false')
    expect(radio('Where', 'Shop').getAttribute('aria-checked')).toBe('true')
    expect(radio('Where', 'Everywhere').getAttribute('aria-checked')).toBe('false')
  })

  it('shows a promoted memory on Every agent and Everywhere, still naming where it came from', () => {
    ops.useQuery.mockReturnValue({ data: [{ ...ITEM, agent: null, place: null }], isLoading: false })
    render(<MemoryDialog itemId="m1" onClose={() => {}} />)
    expect(radio('Which agents remember it', 'Every agent').getAttribute('aria-checked')).toBe('true')
    expect(radio('Where', 'Everywhere').getAttribute('aria-checked')).toBe('true')
    expect(radio('Which agents remember it', 'Kernel')).toBeTruthy()
    expect(radio('Where', 'Shop')).toBeTruthy()
  })

  it('saves each switch at once, keeping the other as it is', async () => {
    render(<MemoryDialog itemId="m1" onClose={() => {}} />)
    fireEvent.click(radio('Which agents remember it', 'Every agent'))
    await waitFor(() => expect(ops.setMemoryScope).toHaveBeenCalledWith({ id: 'm1', agent: 'every', place: 'saved' }))
    fireEvent.click(radio('Where', 'Everywhere'))
    await waitFor(() => expect(ops.setMemoryScope).toHaveBeenLastCalledWith({ id: 'm1', agent: 'saved', place: 'everywhere' }))
  })

  it('follows the memory when promoting joined it into another', async () => {
    ops.setMemoryScope.mockResolvedValue({ itemId: 'm2' })
    render(<MemoryDialog itemId="m1" onClose={() => {}} />)
    fireEvent.click(radio('Where', 'Everywhere'))
    await waitFor(() => expect(ops.useQuery).toHaveBeenLastCalledWith('getMemory', { id: 'm2', includeArchived: true }))
  })

  it('says so when a switch was not saved', async () => {
    ops.setMemoryScope.mockRejectedValue(new Error('That memory is already gone.'))
    render(<MemoryDialog itemId="m1" onClose={() => {}} />)
    fireEvent.click(radio('Where', 'Everywhere'))
    expect((await screen.findByRole('alert')).textContent).toBe('That memory is already gone.')
  })

  it('shows what it says, read only, and who saved it where', () => {
    render(<MemoryDialog itemId="m1" onClose={() => {}} />)
    expect(screen.getByText('Use a table when comparing options')).toBeTruthy()
    expect(screen.getByText('One row per option, columns for cost and risk.')).toBeTruthy()
    expect(screen.getByText('Rule')).toBeTruthy()
    expect(screen.getByText('format')).toBeTruthy()
    expect(screen.getByText('Kernel saved this in Shop, 6 Nov, 14:02 · recalled 9 times')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    for (const word of ['Edit', 'Save', 'Pin', 'Delete']) expect(screen.queryByText(word)).toBeNull()
  })

  it('links its saved line to the conversation it was saved in, when there is one', () => {
    ops.useQuery.mockReturnValue({ data: [{ ...ITEM, savedInConversationId: 'c 1' }], isLoading: false })
    const onClose = vi.fn()
    render(<MemoryDialog itemId="m1" onClose={onClose} />)
    const link = screen.getByRole('link', { name: 'the conversation' })
    expect(link.getAttribute('href')).toBe('/chat/t/c%201')
    expect(link.parentElement!.textContent).toBe('Kernel saved this in Shop, 6 Nov, 14:02 · recalled 9 times · the conversation')
    fireEvent.click(link)
    expect(onClose).toHaveBeenCalled()
  })

  it('names no conversation for a memory a run saved, or whose conversation is gone', () => {
    render(<MemoryDialog itemId="m1" onClose={() => {}} />)
    expect(screen.queryByRole('link', { name: 'the conversation' })).toBeNull()
  })

  it('names an agent since deleted, and refuses keeping the memory for it', () => {
    ops.useQuery.mockReturnValue({ data: [{ ...ITEM, agent: null, savedBy: null }], isLoading: false })
    render(<MemoryDialog itemId="m1" onClose={() => {}} />)
    expect(screen.getByText(/^An agent since deleted saved this in Shop/)).toBeTruthy()
    fireEvent.click(radio('Which agents remember it', 'Its agent'))
    expect(ops.setMemoryScope).not.toHaveBeenCalled()
  })

  it('forgets only after the person confirms, then closes', async () => {
    const onClose = vi.fn()
    render(<MemoryDialog itemId="m1" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Forget' }))
    expect(ops.forgetMemoryItem).not.toHaveBeenCalled()
    const confirm = screen.getByRole('dialog', { name: 'Forget this memory?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Forget' }))
    await waitFor(() => expect(ops.forgetMemoryItem).toHaveBeenCalledWith({ id: 'm1' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(ops.toast).not.toHaveBeenCalled()
  })

  it('says it was forgotten when opened outside the memory screen, which would not show it', async () => {
    render(<MemoryDialog itemId="m1" onClose={() => {}} fromOutside />)
    fireEvent.click(screen.getByRole('button', { name: 'Forget' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Forget this memory?' })).getByRole('button', { name: 'Forget' }))
    await waitFor(() => expect(ops.toast).toHaveBeenCalledWith('Memory forgotten'))
  })

  it('offers all your memory only when opened outside the memory screen', () => {
    const { unmount } = render(<MemoryDialog itemId="m1" onClose={() => {}} />)
    expect(screen.queryByRole('link', { name: /All your memory/ })).toBeNull()
    unmount()
    render(<MemoryDialog itemId="m1" onClose={() => {}} fromOutside />)
    expect(screen.getByRole('link', { name: /All your memory/ }).getAttribute('href')).toBe('/settings/memory')
  })

  it('says a memory that is gone is gone, not that nothing was found', () => {
    ops.useQuery.mockReturnValue({ data: [], isLoading: false })
    render(<MemoryDialog itemId="m1" onClose={() => {}} />)
    expect(screen.getByText(/This memory is no longer here/)).toBeTruthy()
  })

  it('draws nothing while no memory is chosen', () => {
    render(<MemoryDialog itemId={null} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
