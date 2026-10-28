// @vitest-environment jsdom
/** The Library's one view: search, Type and Show chips, and a row for each asset with its states in words. */
import React, { useState } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// Where ui has its own copy of lucide-react, the icons ui renders here are stubbed by that path, so no second React
// renders. Where ui shares hq's copy, the path is hq's, and every other icon stays real.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/primitives')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), Search: icon, ChevronDown: icon }
})

import { LibraryAssetList } from '../LibraryAssetList'
import type { LibraryFilter } from '../libraryFilters'
import { SAMPLE } from './fixtures'

afterEach(cleanup)

function Harness({ onCreateAgent = () => {} }: { onCreateAgent?: (id: string) => void }) {
  const [filter, setFilter] = useState<LibraryFilter>({ search: '', type: 'all', status: null })
  return (
    <MemoryRouter>
      <LibraryAssetList rows={SAMPLE} filter={filter} onFilter={setFilter} isAdmin onCreateAgent={onCreateAgent} onExport={() => {}} onRemove={() => {}} />
    </MemoryRouter>
  )
}
const rows = () => screen.getAllByTestId('library-row')

describe('the Library view', () => {
  it('lists every asset with its kind, identity, version, signer, who has it and state', () => {
    render(<Harness />)
    expect(rows()).toHaveLength(SAMPLE.length)
    const code = rows()[0]!
    expect(within(code).getByText('Code Review')).toBeTruthy()
    expect(code.textContent).toContain('skill · agenthix/dev-code-review · 1.3.0')
    expect(code.textContent).toContain('Signed by Agenthix · Every agent has it')
    expect(within(code).getByText('Update available · 1.4.0')).toBeTruthy()
    expect(within(code).getByRole('link', { name: 'Update' })).toBeTruthy()
    expect(rows()[1]!.textContent).toContain('Draft by Sam')
    expect(rows()[1]!.textContent).toContain('Made here · Ada has it')
    expect(rows()[2]!.textContent).toContain('No agent has it yet')
    expect(within(rows()[2]!).getByRole('link', { name: 'Add to agents…' })).toBeTruthy()
  })

  it('narrows by Type, and the chips say how many each holds', () => {
    render(<Harness />)
    const type = screen.getByRole('group', { name: 'Type' })
    expect(within(type).getByRole('button', { name: /^All 8/ })).toBeTruthy()
    fireEvent.click(within(type).getByRole('button', { name: /^Boards/ }))
    expect(rows()).toHaveLength(1)
    expect(rows()[0]!.textContent).toContain('Sprint board')
    expect(rows()[0]!.textContent).toContain('Used by 2 projects')
    fireEvent.click(within(type).getByRole('button', { name: /^All/ }))
    expect(rows()).toHaveLength(SAMPLE.length)
  })

  it('narrows by state and toggles it off', () => {
    render(<Harness />)
    const show = screen.getByRole('group', { name: 'Show' })
    for (const label of ['Waiting for review', 'Update available', 'Draft', 'No agent yet', 'Set aside', 'Unsigned']) {
      expect(within(show).getByRole('button', { name: new RegExp(`^${label}`) })).toBeTruthy()
    }
    fireEvent.click(within(show).getByRole('button', { name: /^Waiting for review/ }))
    expect(rows()).toHaveLength(1)
    expect(rows()[0]!.textContent).toContain('Proposed by Ada for Avery Chen')
    expect(within(rows()[0]!).getByRole('link', { name: 'Review' }).getAttribute('href')).toBe('/library/proposals/p1')
    fireEvent.click(within(show).getByRole('button', { name: /^Waiting for review/ }))
    expect(rows()).toHaveLength(SAMPLE.length)
  })

  it('searches across every kind and says when nothing matches', () => {
    render(<Harness />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sprint' } })
    expect(rows()).toHaveLength(1)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(screen.getByText('Nothing matches.')).toBeTruthy()
  })

  it('says a set-aside skill is replaced by the own copy and offers it back', () => {
    render(<Harness />)
    const aside = rows().find(r => r.textContent?.includes('replaced by your copy'))!
    expect(aside.textContent).toContain('replaced by your copy, fernhill/code-review')
    expect(within(aside).getByRole('link', { name: 'Use this again' }).getAttribute('href')).toBe('/library/s5')
  })

  it('opens an agent template into Create an agent', () => {
    const create = vi.fn()
    render(<Harness onCreateAgent={create} />)
    fireEvent.click(screen.getByRole('button', { name: 'Create an agent' }))
    expect(create).toHaveBeenCalledWith('a1')
  })
})
