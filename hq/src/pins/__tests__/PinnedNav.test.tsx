// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const pins = [
  { id: 'p1', kind: 'PROJECT', itemId: 'proj', name: 'Agenthix', href: '/projects/AGX', avatarUrl: null },
  { id: 'p2', kind: 'BOARD', itemId: 'board', name: 'Sprint 4', href: '/projects/AGX/boards/b1', avatarUrl: null },
  { id: 'p3', kind: 'AGENT', itemId: 'agent', name: 'Project manager', href: '/agents/pm', avatarUrl: null },
]
const query: { data: unknown } = { data: pins }
const unpin = vi.fn().mockResolvedValue(undefined)
const reorder = vi.fn().mockResolvedValue(undefined)

vi.mock('wasp/client/operations', () => ({
  getPins: { name: 'getPins' },
  reorderPins: { name: 'reorderPins' },
  unpinItem: { name: 'unpinItem' },
  useQuery: () => query,
  useAction: (op: { name: string }) => (op.name === 'unpinItem' ? unpin : reorder),
}))
vi.mock('../../shared/components/AuthedAgentAvatar', () => ({
  AuthedAgentAvatar: ({ name }: { name: string }) => React.createElement('span', { 'data-testid': `agent-avatar-${name}` }),
}))

import { PinnedNav } from '../components/PinnedNav'

function renderAt(path: string, props: React.ComponentProps<typeof PinnedNav> = {}) {
  return render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(PinnedNav, props)))
}

beforeEach(() => {
  query.data = pins
  unpin.mockClear()
  reorder.mockClear()
})

describe('PinnedNav @SC-492', () => {
  it('lists the pins in order as links, each with its avatar', () => {
    renderAt('/')
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['AAgenthix', 'Sprint 4', 'Project manager'])
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/projects/AGX', '/projects/AGX/boards/b1', '/agents/pm'])
    expect(screen.getByTestId('agent-avatar-Project manager')).toBeTruthy()
  })

  it('highlights the pin of the page that is open, the most specific one', () => {
    renderAt('/projects/AGX/boards/b1')
    expect(screen.getByRole('link', { name: /Sprint 4/ }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: /Agenthix/ }).getAttribute('aria-current')).toBeNull()
  })

  it('shows nothing when there are no pins', () => {
    query.data = []
    const { container } = renderAt('/')
    expect(container.innerHTML).toBe('')
  })

  it('shows only avatars when collapsed, named by their title', () => {
    renderAt('/', { collapsed: true })
    expect(screen.getByTitle('Sprint 4')).toBeTruthy()
    expect(screen.queryByText('Sprint 4')).toBeNull()
  })

  it('while editing, offers a handle to move each pin and a button to unpin it', () => {
    renderAt('/', { editing: true })
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Move Agenthix' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Unpin Sprint 4' }))

    expect(unpin).toHaveBeenCalledWith({ kind: 'BOARD', itemId: 'board' })
  })
})
