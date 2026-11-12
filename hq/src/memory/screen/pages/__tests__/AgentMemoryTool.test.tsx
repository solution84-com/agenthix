// @vitest-environment jsdom
/** An agent's page › Memory (spec decision 5): its own memories, then, folded, what every agent knows; the same dialog. */
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const ops = vi.hoisted(() => ({ useQuery: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: ops.useQuery, useAction: (fn: unknown) => fn, getMemory: 'getMemory', getMemoryChoices: 'getMemoryChoices',
  setMemoryScope: vi.fn(), forgetMemoryItem: vi.fn(),
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

import { AgentMemoryTool } from '../AgentMemoryTool'

const item = (id: string, title: string, agent: { id: string; name: string } | null) => ({
  id, key: id, agent, place: null, savedBy: { id: 'a1', name: 'Kernel' }, savedIn: null, title, body: 'b', kind: 'FACT' as const,
  tags: [], archived: false, recallCount: 0, usedCount: 0, lastRecalledAt: null, createdAt: '2026-11-01T10:00:00', updatedAt: '2026-11-01T10:00:00',
})

beforeEach(() => {
  vi.clearAllMocks()
  ops.useQuery.mockImplementation((op: string, args?: { agentId?: string | null; id?: string }) => {
    if (op === 'getMemoryChoices') return { data: { agents: [], places: [], tags: [] } }
    if (args?.id) return { data: [item(args.id, 'Opened', null)], isLoading: false }
    return { data: args?.agentId ? [item('m1', 'Secret word', { id: 'a1', name: 'Kernel' })] : [item('m2', 'Call me Avery', null)], isLoading: false }
  })
})

describe("an agent's page › Memory @SC-2111", () => {
  it('lists its own memories, and folds what every agent knows, with its count', () => {
    render(<MemoryRouter><AgentMemoryTool agentId="a1" agentName="Kernel" /></MemoryRouter>)
    expect(ops.useQuery).toHaveBeenCalledWith('getMemory', { agentId: 'a1', includeArchived: false })
    expect(ops.useQuery).toHaveBeenCalledWith('getMemory', { agentId: null, includeArchived: false })
    expect(screen.getByText('Secret word')).toBeTruthy()
    expect(screen.queryByText('Call me Avery')).toBeNull()
    const fold = screen.getByRole('button', { name: /Also known to every agent/ })
    expect(fold.textContent).toContain('1')
    fireEvent.click(fold)
    expect(screen.getByText('Call me Avery')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'All your memory ›' }).getAttribute('href')).toBe('/settings/memory')
  })

  it('opens a memory in the dialog, with a way to all your memory', () => {
    render(<MemoryRouter><AgentMemoryTool agentId="a1" agentName="Kernel" /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /Secret word/ }))
    expect(screen.getByRole('dialog', { name: 'Memory' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'All your memory ›' })).toHaveLength(2)
  })
})
