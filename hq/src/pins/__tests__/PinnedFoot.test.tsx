// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const pins = [
  { id: 'p1', kind: 'PROJECT', itemId: 'proj', name: 'Agenthix', href: '/projects/AGX', avatarUrl: null },
  { id: 'p2', kind: 'BOARD', itemId: 'board', name: 'Sprint 4', href: '/projects/AGX/boards/b1', avatarUrl: null },
  { id: 'p3', kind: 'AGENT', itemId: 'agent', name: 'Project manager', href: '/agents/pm', avatarUrl: null },
]
const query: { data: unknown } = { data: pins }

vi.mock('wasp/client/operations', () => ({
  getPins: { name: 'getPins' },
  reorderPins: { name: 'reorderPins' },
  unpinItem: { name: 'unpinItem' },
  useQuery: () => query,
  useAction: () => vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../shared/components/AuthedAgentAvatar', () => ({
  AuthedAgentAvatar: ({ name }: { name: string }) => React.createElement('span', { 'data-testid': `agent-avatar-${name}` }),
}))

import { PinnedFoot } from '../components/PinnedFoot'

function renderAt(path: string, props: React.ComponentProps<typeof PinnedFoot> = {}) {
  return render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(PinnedFoot, props)))
}
const row = () => screen.getByRole('region', { name: 'Pinned' })
const rowLink = () => within(row()).getAllByRole('link')[0]
const stored = () => JSON.parse(localStorage.getItem('pinnedFoot') ?? '{}')

beforeEach(() => {
  query.data = pins
  localStorage.clear()
})

describe('PinnedFoot, the Pinned row @SC-1045', () => {
  it('is not shown when there are no pins', () => {
    query.data = []
    const { container } = renderAt('/')
    expect(container.innerHTML).toBe('')
  })

  it('is one row: the first pin before any is used, with the count, and the list closed', () => {
    renderAt('/')
    expect(rowLink().textContent).toContain('Agenthix')
    expect(rowLink().getAttribute('href')).toBe('/projects/AGX')
    const button = screen.getByRole('button', { name: 'Pinned, 3' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('pinned-list')).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('shows the pin used last that is not where you are', () => {
    localStorage.setItem('pinnedFoot', JSON.stringify({ open: false, recent: ['p3', 'p2'] }))
    const { unmount } = renderAt('/')
    expect(rowLink().textContent).toContain('Project manager')
    unmount()
    renderAt('/agents/pm')
    expect(rowLink().textContent).toContain('Sprint 4')
  })

  it('remembers a pin when it is followed', () => {
    renderAt('/')
    fireEvent.click(rowLink())
    expect(stored().recent).toEqual(['p1'])
  })

  it('opens the list, marks where you are, and remembers it open', () => {
    const first = renderAt('/projects/AGX/boards/b1')
    fireEvent.click(screen.getByRole('button', { name: 'Pinned, 3' }))
    const list = screen.getByTestId('pinned-list')
    expect(within(list).getAllByRole('link').map((l) => l.textContent)).toEqual(['AAgenthix', 'Sprint 4', 'Project manager'])
    expect(within(list).getByRole('link', { name: /Sprint 4/ }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'Pinned, 3' }).getAttribute('aria-expanded')).toBe('true')
    expect(stored().open).toBe(true)
    first.unmount()

    renderAt('/')
    expect(screen.getByTestId('pinned-list')).toBeTruthy()
  })

  it('stays open when a pin is chosen, an Esc is pressed or the page is clicked; only the button closes it', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: 'Pinned, 3' }))
    fireEvent.click(within(screen.getByTestId('pinned-list')).getByRole('link', { name: /Sprint 4/ }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.mouseDown(document.body)
    expect(screen.getByTestId('pinned-list')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Pinned, 3' }))
    expect(screen.queryByTestId('pinned-list')).toBeNull()
    expect(stored().open).toBe(false)
  })

  it('never moves when you choose a pin: the same row, in the same place', () => {
    const { container } = renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: 'Pinned, 3' }))
    const before = { node: row(), parent: row().parentElement, index: [...container.children].indexOf(row()) }

    fireEvent.click(within(screen.getByTestId('pinned-list')).getByRole('link', { name: /Sprint 4/ }))

    expect(row()).toBe(before.node)
    expect(row().parentElement).toBe(before.parent)
    expect([...container.children].indexOf(row())).toBe(before.index)
    // What the row offers moves on to the next pin, not the one you are in.
    expect(rowLink().textContent).toContain('Agenthix')
  })

  it('keeps Edit in the list: pins can be moved and unpinned there', () => {
    renderAt('/')
    fireEvent.click(screen.getByRole('button', { name: 'Pinned, 3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('button', { name: 'Unpin Sprint 4' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
  })

  it('calls onNavigate when a pin is followed, from the row or the list', () => {
    const onNavigate = vi.fn()
    renderAt('/', { onNavigate })
    fireEvent.click(rowLink())
    fireEvent.click(screen.getByRole('button', { name: 'Pinned, 3' }))
    fireEvent.click(within(screen.getByTestId('pinned-list')).getByRole('link', { name: /Sprint 4/ }))
    expect(onNavigate).toHaveBeenCalledTimes(2)
  })

  it('at icon width is the pin’s avatar, named on hover, and its list opens beside it for one choice', () => {
    renderAt('/', { collapsed: true })
    expect(rowLink().getAttribute('title')).toBe('Agenthix')
    expect(screen.queryByText('Agenthix')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Pinned, 3' }))
    const list = screen.getByTestId('pinned-list')
    fireEvent.click(within(list).getByRole('link', { name: /Sprint 4/ }))
    expect(screen.queryByTestId('pinned-list')).toBeNull()
    expect(stored().open).not.toBe(true)
  })
})
