// @vitest-environment jsdom
/** A kind of the Library (every screen reviewed spec §3): rows marked with their source, a search, a source filter, Export for admins. */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// Where ui has its own copy of lucide-react, the icons ui renders here are stubbed by that path, so no second React
// renders. Where ui shares hq's copy, as on CI and in the image, the path is hq's, and every other icon stays real.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/primitives')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), Search: icon, ChevronDown: icon }
})

import { LibraryKindList } from '../LibraryKindList'
import type { LibraryItem } from '../../packages/packageActions'

const item = (over: Partial<LibraryItem>): LibraryItem => ({ kind: 'agent', id: 'a1', name: 'Wasp developer', description: 'Builds Wasp apps', source: 'BUILT_IN', version: '1', publisher: 'Agenthix', ...over })
const ITEMS: LibraryItem[] = [
  item({}),
  item({ id: 'a2', name: 'Shopify specialist', description: 'Themes and apps', source: 'MARKETPLACE', version: '2.1', publisher: 'Northwind Labs' }),
  item({ id: 'a3', name: 'Shop support', description: 'Answers merchants', source: 'MADE_HERE', publisher: 'Acme Corp' }),
]
const handlers = () => ({ onAddAgent: vi.fn(), onViewBoard: vi.fn(), onViewSkill: vi.fn(), onExport: vi.fn() })
const show = (over: Partial<React.ComponentProps<typeof LibraryKindList>> = {}) =>
  render(<MemoryRouter><LibraryKindList kind="agents" items={ITEMS} isAdmin {...handlers()} {...over} /></MemoryRouter>)
afterEach(cleanup)

describe('the Library’s agents @SC-678', () => {
  it('marks each row Built in, Made here or Marketplace with its publisher and version', () => {
    show()
    const rows = screen.getAllByTestId('library-row').map(r => r.textContent ?? '')
    expect(rows[0]).toContain('Wasp developerBuilds Wasp appsBuilt in')
    expect(rows[1]).toContain('Marketplace · v2.1')
    expect(rows[1]).toContain('by Northwind Labs')
    expect(rows[2]).toContain('Made here')
    expect(screen.getAllByRole('button', { name: 'Add to agents' })).toHaveLength(3)
  })

  it('filters by source and by search', () => {
    show()
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'MADE_HERE' } })
    expect(screen.getAllByTestId('library-row')).toHaveLength(1)
    expect(screen.getByText('Shop support')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText('Search agents'), { target: { value: 'shopify' } })
    expect(screen.getAllByTestId('library-row')).toHaveLength(1)
  })

  it('adds an agent through the handler, and exports through ⋯ for an admin only', () => {
    const h = handlers()
    show(h)
    fireEvent.click(screen.getAllByRole('button', { name: 'Add to agents' })[0])
    expect(h.onAddAgent).toHaveBeenCalledWith('a1')
    fireEvent.click(screen.getByRole('button', { name: 'More about Wasp developer' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Export/ }))
    expect(h.onExport).toHaveBeenCalledWith('agent', 'a1')
  })

  it('disables Export for a member', () => {
    show({ isAdmin: false })
    fireEvent.click(screen.getByRole('button', { name: 'More about Wasp developer' }))
    expect((screen.getByRole('menuitem', { name: /Export/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('says when a kind is empty', () => {
    show({ items: [] })
    expect(screen.getByText('No agents in the library yet.')).toBeTruthy()
  })
})
