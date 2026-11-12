// @vitest-environment jsdom
/**
 * Settings › Memory (spec decision 11): one list, newest first, each row with its badges; the menus ask for exactly
 * what their badges say; a row, or `?item=<id>`, opens the dialog; nothing adds, edits or pins a memory.
 */
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render as renderBare, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const ops = vi.hoisted(() => ({ useQuery: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: ops.useQuery, useAction: (fn: unknown) => fn, getMemory: 'getMemory', getMemoryChoices: 'getMemoryChoices',
  setMemoryScope: vi.fn(), forgetMemoryItem: vi.fn(),
}))
vi.mock('../../../../settings/pages/SettingsSubpage', () => ({
  SettingsSubpage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
// ui's own icon library would bring its own copy of React into the test; the filters are drawn plainly here.
vi.mock('@agenthix/ui/primitives', async (importOriginal) => ({ ...(await importOriginal<typeof import('@agenthix/ui/primitives')>()),
  SearchField: ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <input type="search" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  FilterSelect: ({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>
  ),
}))
vi.mock('../../../../shared/hooks/useIsAdmin', () => ({ useIsAdmin: () => false }))

import { MemoryPage } from '../MemoryPage'

const render = (url = '/settings/memory') => renderBare(<MemoryRouter initialEntries={[url]}><MemoryPage /></MemoryRouter>)

const ITEM = {
  id: 'm1', key: 'coffee', agent: { id: 'a1', name: 'Kernel' }, place: { type: 'project' as const, id: 'p1', name: 'Shop' },
  savedBy: { id: 'a1', name: 'Kernel' }, savedIn: { type: 'project' as const, id: 'p1', name: 'Shop' },
  title: 'Coffee order', body: 'Takes coffee black with no sugar.', kind: 'RULE' as const, tags: ['food'],
  archived: false, recallCount: 3, usedCount: 2, lastRecalledAt: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
}
const CHOICES = {
  agents: [{ id: 'a1', name: 'Kernel' }, { id: 'a2', name: 'Scout' }],
  places: [{ type: 'project' as const, id: 'p1', name: 'Shop' }, { type: 'user' as const, id: 'u1', name: 'Your space' }],
  tags: ['food', 'tone'],
}

/** The arguments of the list's last read: the dialog reads with an `id`, and the menus with none. */
const lastListArgs = () => ops.useQuery.mock.calls.filter(([op, args]) => op === 'getMemory' && !(args as { id?: string }).id).at(-1)?.[1]

beforeEach(() => {
  vi.clearAllMocks()
  ops.useQuery.mockImplementation((op: string) => (op === 'getMemoryChoices' ? { data: CHOICES, isLoading: false } : { data: [ITEM], isLoading: false }))
})

describe('Settings › Memory @SC-2108', () => {
  it('shows each memory\'s title and its badges: kind, which agents, where, then tags and date', () => {
    render()
    expect(screen.getByText('Coffee order')).toBeTruthy()
    expect(screen.queryByText('Takes coffee black with no sugar.')).toBeNull()
    for (const badge of ['Rule', 'Kernel', 'Shop']) expect(screen.getAllByText(badge, { selector: 'span' }).length).toBeGreaterThan(0)
    expect(screen.getByText(/food · 1 Oct · recalled 3 times/)).toBeTruthy()
  })

  it('names a promoted memory "Every agent" and "Everywhere"', () => {
    ops.useQuery.mockImplementation((op: string) => (op === 'getMemoryChoices' ? { data: CHOICES } : { data: [{ ...ITEM, agent: null, place: null, kind: 'FACT' }], isLoading: false }))
    render()
    expect(screen.getAllByText('Every agent', { selector: 'span' }).length).toBe(1)
    expect(screen.getAllByText('Everywhere', { selector: 'span' }).length).toBe(1)
  })

  it('asks for everything, newest first, until a menu is chosen', () => {
    render()
    expect(lastListArgs()).toEqual({ includeArchived: false })
  })

  it('asks for exactly what each menu\'s badge says', () => {
    render()
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'RULE' } })
    fireEvent.change(screen.getByLabelText('Agent'), { target: { value: 'every' } })
    fireEvent.change(screen.getByLabelText('Place'), { target: { value: 'project:p1' } })
    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'food' } })
    expect(lastListArgs()).toEqual({ kind: 'RULE', agentId: null, place: { type: 'project', id: 'p1' }, tag: 'food', includeArchived: false })
    fireEvent.change(screen.getByLabelText('Agent'), { target: { value: 'a2' } })
    fireEvent.change(screen.getByLabelText('Place'), { target: { value: 'everywhere' } })
    expect(lastListArgs()).toMatchObject({ agentId: 'a2', place: null })
  })

  it('offers the badges\' values in the agent and place menus', () => {
    render()
    const options = (label: string) => Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map(o => o.text)
    expect(options('Agent')).toEqual(['Any agent', 'Every agent', 'Kernel', 'Scout'])
    expect(options('Place')).toEqual(['Any place', 'Everywhere', 'Shop', 'Your space'])
    expect(options('Kind')).toEqual(['Any kind', 'Fact', 'Rule'])
    expect(options('Tag')).toEqual(['Any tag', 'food', 'tone'])
  })

  it('searches by words', () => {
    render()
    fireEvent.change(screen.getByLabelText('Search memory'), { target: { value: 'coffee' } })
    expect(lastListArgs()).toEqual({ words: 'coffee', includeArchived: false })
  })

  it('lists archived memories only when told to', () => {
    render()
    fireEvent.click(screen.getByLabelText('Show archived'))
    expect(lastListArgs()).toEqual({ includeArchived: true })
  })

  it('opens a memory in the dialog when its row is pressed', () => {
    render()
    fireEvent.click(screen.getByRole('button', { name: /Coffee order/ }))
    expect(screen.getByRole('dialog', { name: 'Memory' })).toBeTruthy()
    expect(ops.useQuery).toHaveBeenCalledWith('getMemory', { id: 'm1', includeArchived: true })
  })

  it('opens the memory its address names', () => {
    render('/settings/memory?item=m1&memory=coffee')
    expect(screen.getByRole('dialog', { name: 'Memory' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /All your memory/ })).toBeNull()
  })

  it('opens on the agent an older line\'s address names', () => {
    render('/settings/memory?scope=AGENT_PERSON&agent=a1&memory=coffee')
    expect(lastListArgs()).toEqual({ agentId: 'a1', includeArchived: false })
  })

  it('offers no way to add, edit or pin a memory', () => {
    render()
    for (const word of ['Add', 'Edit', 'Pin', 'Delete']) expect(screen.queryByText(word)).toBeNull()
  })
})
