// @vitest-environment jsdom
/** The Library's one view: search, Type and Show chips, and a row for each asset with its states in words. */
import React, { useState } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

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
      <Where />
      <LibraryAssetList rows={SAMPLE} filter={filter} onFilter={setFilter} isAdmin onCreateAgent={onCreateAgent} onExport={() => {}} onRemove={() => {}} />
    </MemoryRouter>
  )
}
function Where() { return <output data-testid="where">{useLocation().pathname}</output> }
const openMenu = (row: HTMLElement) => fireEvent.click(within(row).getByRole('button', { name: /^More about/ }))
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
    expect(within(code).queryByRole('link', { name: 'Update' })).toBeNull()
    openMenu(code)
    expect(within(code).getByRole('menuitem', { name: 'Update' })).toBeTruthy()
    expect(rows()[1]!.textContent).toContain('Draft by Sam')
    expect(rows()[1]!.textContent).toContain('Made here · Ada has it')
    expect(rows()[2]!.textContent).toContain('No agent has it yet')
    openMenu(rows()[2]!)
    expect(within(rows()[2]!).getByRole('menuitem', { name: 'Add to agents…' })).toBeTruthy()
  })

  it('makes the whole row open the asset, through its title link covering the row', () => {
    render(<Harness />)
    const title = within(rows()[0]!).getByRole('link', { name: /Code Review/ })
    expect(title.className).toContain('after:inset-0')
    expect(rows()[0]!.className).toContain('relative')
  })

  it('puts the states on a line of their own and every action in the menu, so the row has one target', () => {
    render(<Harness />)
    const code = rows()[0]!
    const states = within(code).getByTestId('library-row-states')
    expect(states.parentElement).toBe(within(code).getByRole('link', { name: /Code Review/ }).parentElement!.parentElement)
    expect(within(code).getAllByRole('link')).toHaveLength(1)
    expect(within(code).getAllByRole('button')).toHaveLength(1)
  })

  it('narrows by Type, and the chips say how many each holds', () => {
    render(<Harness />)
    const type = screen.getByRole('group', { name: 'Type' })
    expect(within(type).getByRole('button', { name: /^All 10/ })).toBeTruthy()
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
    openMenu(rows()[0]!)
    fireEvent.click(within(rows()[0]!).getByRole('menuitem', { name: 'Review' }))
    expect(screen.getByTestId('where').textContent).toBe('/library/proposals/p1')
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
    openMenu(aside)
    fireEvent.click(within(aside).getByRole('menuitem', { name: 'Use this again' }))
    expect(screen.getByTestId('where').textContent).toBe('/library/s5')
  })

  it("shows a copy and the original it replaced as one row, which says what it replaced", () => {
    render(<Harness />)
    const copy = rows().find(r => r.textContent?.includes('Release Checklist'))!
    expect(copy.textContent).toContain("Made here · Your copy of Acme's Release Checklist 2.0.0 · Lin has it")
    expect(within(copy).getByText('Original set aside')).toBeTruthy()
    expect(rows().filter(r => r.textContent?.includes('acme/release-checklist'))).toHaveLength(0)
  })

  it("shows the original with its copy set aside under it, and the copy's draft", () => {
    render(<Harness />)
    const original = rows().find(r => r.textContent?.includes('Changelog'))!
    expect(original.textContent).toContain('Your copy fernhill/changelog 1.1.0 is set aside')
    expect(within(original).getByText('Your copy set aside')).toBeTruthy()
    expect(within(original).getByText('Draft of your copy by Sam')).toBeTruthy()
    expect(within(original).getByRole('link', { name: /Changelog/ }).getAttribute('href')).toBe('/library/s7')
  })

  it('a Set aside filter finds each entry through what is set aside under it', () => {
    render(<Harness />)
    fireEvent.click(within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: /^Set aside 3/ }))
    expect(rows()).toHaveLength(3)
  })

  it('opens an agent template into Create an agent', () => {
    const create = vi.fn()
    render(<Harness onCreateAgent={create} />)
    const template = rows().find(r => r.textContent?.includes('Project manager'))!
    openMenu(template)
    fireEvent.click(within(template).getByRole('menuitem', { name: 'Create an agent' }))
    expect(create).toHaveBeenCalledWith('a1')
  })
})
