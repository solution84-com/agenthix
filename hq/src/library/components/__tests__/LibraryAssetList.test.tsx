// @vitest-environment jsdom
/** The Library's one view: search, the type chips and Needs you, and cards: a shelf per kind under All, a grid under a chip. */
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
import { SAMPLE, row } from './fixtures'

afterEach(cleanup)

function Harness({ onCreateAgent = () => {}, source = SAMPLE, isAdmin = true, canAct = true }: { onCreateAgent?: (id: string) => void; source?: typeof SAMPLE; isAdmin?: boolean; canAct?: boolean }) {
  const [filter, setFilter] = useState<LibraryFilter>({ search: '', type: 'all', needsYou: false })
  return (
    <MemoryRouter>
      <Where />
      <LibraryAssetList rows={source} filter={filter} onFilter={setFilter} isAdmin={isAdmin} canAct={canAct} onCreateAgent={onCreateAgent} onExport={() => {}} onRemove={() => {}} />
    </MemoryRouter>
  )
}
function Where() { return <output data-testid="where">{useLocation().pathname}</output> }
const openMenu = (row: HTMLElement) => fireEvent.click(within(row).getByRole('button', { name: /^More about/ }))
const chip = (name: RegExp) => fireEvent.click(within(screen.getByRole('group', { name: 'Type' })).getByRole('button', { name }))
const rows = () => screen.getAllByTestId('library-card')

describe('the Library view @SC-1628 @SC-1630 @SC-1638', () => {
  it('lists every asset as a card with its name, who it is from, its version and its description', () => {
    render(<Harness source={[{ ...SAMPLE[0]!, description: 'Reviews a change before it merges.' }, ...SAMPLE.slice(1)]} />)
    fireEvent.click(within(screen.getByRole('group', { name: 'Type' })).getByRole('button', { name: /^Skills/ }))
    expect(rows()).toHaveLength(SAMPLE.filter(r => r.kind === 'skill').length)
    const code = rows()[0]!
    expect(within(code).getByText('Code Review')).toBeTruthy()
    expect(within(code).getByText('Reviews a change before it merges.')).toBeTruthy()
    expect(within(code).getByTestId('library-card-publisher').textContent).toBe('From Agenthix · 1.3.0')
    expect(code.textContent).not.toContain('agenthix/dev-code-review')
    expect(within(code).queryByRole('link', { name: 'Update' })).toBeNull()
    openMenu(code)
    expect(within(code).getByRole('menuitem', { name: 'Update' })).toBeTruthy()
    expect(within(rows()[1]!).getByTestId('library-card-publisher').textContent).toBe('Made here · 1.3.0')
    openMenu(rows()[2]!)
    expect(within(rows()[2]!).getByRole('menuitem', { name: 'Add to agents…' })).toBeTruthy()
  })

  it('shows under All a shelf per kind in order, each with its count and a See all that picks the kind', () => {
    render(<Harness />)
    const shelves = screen.getAllByTestId('library-shelf')
    expect(shelves.map(s => s.getAttribute('aria-label'))).toEqual(['Skills', 'Agents and teams', 'Task templates'])
    expect(within(shelves[0]!).getByRole('heading', { name: 'Skills' }).nextSibling!.textContent).toBe('8')
    expect(screen.queryByTestId('library-grid')).toBeNull()
    fireEvent.click(within(shelves[2]!).getByRole('button', { name: 'See all' }))
    expect(screen.getByRole('button', { name: /^Task templates/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryAllByTestId('library-shelf')).toHaveLength(0)
    expect(within(screen.getByTestId('library-grid')).getAllByTestId('library-card')).toHaveLength(1)
  })

  it('shows only one row of cards on a shelf, and a combined shelf has a See all for each kind', () => {
    const skills = Array.from({ length: 5 }, (_, i) => row({ key: `k${i}`, assetId: `k${i}`, title: `Skill ${i}` }))
    render(<Harness source={[...skills, row({ key: 'a1', assetId: 'a1', kind: 'agent', title: 'Researcher' }), row({ key: 't1', assetId: 't1', kind: 'team', title: 'Dev team' })]} />)
    const [skillShelf, mixed] = screen.getAllByTestId('library-shelf')
    expect(within(skillShelf!).getAllByTestId('library-card')).toHaveLength(3)
    expect(within(mixed!).getByRole('heading', { name: 'Agents and teams' }).nextSibling!.textContent).toBe('2')
    fireEvent.click(within(mixed!).getByRole('button', { name: 'See all teams' }))
    expect(screen.getByRole('button', { name: /^Teams/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('shows a grid, not shelves, under Needs you and under a search', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /^Needs you/ }))
    expect(screen.queryAllByTestId('library-shelf')).toHaveLength(0)
    expect(within(screen.getByTestId('library-grid')).getAllByTestId('library-card')).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: /^Needs you/ }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'bug tracking' } })
    expect(screen.queryAllByTestId('library-shelf')).toHaveLength(0)
    expect(within(screen.getByTestId('library-grid')).getAllByTestId('library-card')).toHaveLength(1)
  })

  it('gives a card one tag, only when something needs the person or it is built in', () => {
    render(<Harness source={[
      row({ key: 'u', assetId: 'u', title: 'Upd', statuses: ['update'], updateTo: '2.1.0' }),
      row({ key: 'd', assetId: 'd', title: 'Both', statuses: ['draft', 'update'], updateTo: '2.1.0', draftBy: 'Sam' }),
      row({ key: 'dd', assetId: 'dd', title: 'Dra2', statuses: ['draft'] }),
      row({ key: 'b', assetId: 'b', title: 'Bui', builtIn: true, signer: 'Built in', version: null }),
      row({ key: 'p', assetId: 'p', title: 'Plain' }),
    ]} />)
    chip(/^Skills/)
    const tag = (title: string) => within(rows().find(r => r.textContent?.includes(title))!).queryAllByTestId('library-card-tag').map(t => t.textContent)
    expect(tag('Upd')).toEqual(['Update 2.1.0'])
    expect(tag('Both')).toEqual(['Update 2.1.0'])
    expect(tag('Dra2')).toEqual(['Draft · finish it'])
    expect(tag('Bui')).toEqual(['Built in'])
    expect(tag('Plain')).toEqual([])
    expect(within(rows().find(r => r.textContent?.includes('Bui'))!).getByTestId('library-card-publisher').textContent).toBe('Built in to HQ')
  })

  it('draws who uses a skill or team as the stack, and none for an agent', () => {
    const ada = { id: 'g1', name: 'Ada', avatarUrl: null }
    const kai = { id: 'g2', name: 'Kai', avatarUrl: null }
    render(<Harness source={[
      row({ key: 'e', assetId: 'e', title: 'Everyone', everyAgent: true }),
      row({ key: 's', assetId: 's', title: 'Some', everyAgent: false, agentsUsing: [ada, kai], agentsUsingCount: 3 }),
      row({ key: 'n', assetId: 'n', title: 'Nobody', everyAgent: false }),
      row({ key: 'b', assetId: 'b', kind: 'team', title: 'Crew', everyAgent: false, agentsUsing: [ada], agentsUsingCount: 1 }),
      row({ key: 'a', assetId: 'a', kind: 'agent', title: 'Researcher', everyAgent: false, agentsUsing: [ada], agentsUsingCount: 1 }),
    ]} />)
    const stack = (title: string) => within(rows().find(r => r.textContent?.includes(title))!).queryByRole('img', { name: /use/i })?.getAttribute('aria-label') ?? null
    expect(stack('Everyone')).toBe('Every agent uses it')
    expect(stack('Some')).toBe('Used by 3 agents')
    expect(stack('Nobody')).toBe('No agent uses it')
    expect(stack('Crew')).toBe('Used by Ada')
    expect(stack('Researcher')).toBeNull()
  })

  it("draws an agent's own avatar as its tile, and an icon for the other kinds", () => {
    render(<Harness source={[
      row({ key: 'a', assetId: 'a', kind: 'agent', title: 'Researcher', everyAgent: false }),
      row({ key: 'b', assetId: 'b', kind: 'task-template', title: 'Bug tracking', everyAgent: false }),
      row({ key: 't', assetId: 't', kind: 'team', title: 'Team', everyAgent: false }),
    ]} />)
    const tile = (title: string, id: string) => within(rows().find(r => r.textContent?.includes(title))!).getByTestId(id)
    expect(tile('Researcher', 'kind-tile-agent')).toBeTruthy()
    expect(tile('Bug tracking', 'kind-tile-task-template')).toBeTruthy()
    expect(tile('Team', 'kind-tile-team')).toBeTruthy()
  })

  it('gives a built-in card a ⋯ menu too, with only what applies', () => {
    render(<Harness source={[row({ key: 'b', assetId: 'b', title: 'Working with git', builtIn: true, signer: 'Built in', version: null })]} />)
    openMenu(rows()[0]!)
    expect(within(rows()[0]!).getAllByRole('menuitem').map(i => i.textContent)).toEqual([expect.stringMatching(/^Open/)])
  })

  it('reads the name apart from the publisher, so a screen reader does not run them together', () => {
    render(<Harness />)
    expect(within(rows()[0]!).getByRole('link').textContent).toBe('Code Review')
  })

  it('makes the whole card open the asset, through its title link covering the card', () => {
    render(<Harness />)
    const title = within(rows()[0]!).getByRole('link', { name: /Code Review/ })
    expect(title.className).toContain('after:inset-0')
    expect(rows()[0]!.className).toContain('relative')
    expect(rows()[0]!.className).toContain('hover:-translate-y-0.5')
  })

  it('has one target and the ⋯ menu for every action, and says the full state when pointed at', () => {
    render(<Harness />)
    const code = rows()[0]!
    expect(within(code).getAllByRole('link')).toHaveLength(1)
    expect(within(code).getAllByRole('button')).toHaveLength(1)
    expect(code.getAttribute('title')).toBe('From Agenthix · version 1.3.0 · every agent uses it · Update available · 1.4.0')
  })

  it('narrows by Type, and the chips say how many each holds', () => {
    render(<Harness />)
    const type = screen.getByRole('group', { name: 'Type' })
    expect(within(type).getByRole('button', { name: /^All 10/ })).toBeTruthy()
    fireEvent.click(within(type).getByRole('button', { name: /^Task templates/ }))
    expect(rows()).toHaveLength(1)
    expect(rows()[0]!.textContent).toContain('Bug tracking')
    fireEvent.click(within(type).getByRole('button', { name: /^All/ }))
    expect(screen.getAllByTestId('library-shelf')).toHaveLength(3)
  })

  it('has one state filter, Needs you, in place of six, and toggles it off', () => {
    render(<Harness />)
    expect(screen.queryByRole('group', { name: 'Show' })).toBeNull()
    for (const gone of ['Waiting for review', 'Update available', 'No agent yet', 'Set aside', 'Unsigned']) expect(screen.queryByRole('button', { name: new RegExp(`^${gone}`) })).toBeNull()
    const needs = screen.getByRole('button', { name: /^Needs you 5/ })
    fireEvent.click(needs)
    expect(rows()).toHaveLength(5)
    expect(rows().map(r => r.textContent).join(' ')).toContain('Proposed by Ada for Avery Chen')
    fireEvent.click(needs)
    expect(screen.getAllByTestId('library-shelf')).toHaveLength(3)
  })

  it('opens a proposal waiting for review from its menu', () => {
    render(<Harness />)
    chip(/^Skills/)
    const proposal = rows().find(r => r.textContent?.includes('Accessibility Check'))!
    openMenu(proposal)
    fireEvent.click(within(proposal).getByRole('menuitem', { name: 'Review' }))
    expect(screen.getByTestId('where').textContent).toBe('/library/proposals/p1')
  })

  it('leaves Needs you off when nothing needs the person, and for someone who cannot act on it', () => {
    render(<Harness source={[row({ key: 's9', assetId: 's9' })]} />)
    expect(screen.queryByRole('button', { name: /^Needs you/ })).toBeNull()
    cleanup()
    render(<Harness canAct={false} />)
    expect(screen.queryByRole('button', { name: /^Needs you/ })).toBeNull()
  })

  it('searches across every kind and says when nothing matches', () => {
    render(<Harness />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'bug tracking' } })
    expect(rows()).toHaveLength(1)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(screen.getByText('Nothing matches.')).toBeTruthy()
  })

  it('says a set-aside skill is replaced by the own copy and offers it back', () => {
    render(<Harness />)
    chip(/^Skills/)
    const aside = rows().find(r => r.getAttribute('title')?.includes('replaced by your copy'))!
    expect(aside.getAttribute('title')).toContain('Set aside, replaced by your copy fernhill/code-review')
    openMenu(aside)
    fireEvent.click(within(aside).getByRole('menuitem', { name: 'Use this again' }))
    expect(screen.getByTestId('where').textContent).toBe('/library/s5')
  })

  it("shows a copy and the original it replaced as one row, which says what it replaced", () => {
    render(<Harness />)
    chip(/^Skills/)
    const copy = rows().find(r => r.textContent?.includes('Release Checklist'))!
    expect(copy.getAttribute('title')).toContain("Your copy of Acme's Release Checklist 2.0.0, which is set aside")
    expect(rows().filter(r => r.textContent?.includes('acme/release-checklist'))).toHaveLength(0)
  })

  it("shows the original with its copy set aside under it, and the copy's draft", () => {
    render(<Harness />)
    chip(/^Skills/)
    const original = rows().find(r => r.textContent?.includes('Changelog'))!
    expect(original.getAttribute('title')).toContain('Your copy fernhill/changelog 1.1.0 is set aside')
    expect(original.getAttribute('title')).toContain('Draft of your copy by Sam')
    expect(within(original).getByRole('link', { name: /Changelog/ }).getAttribute('href')).toBe('/library/s7')
  })

  it('opens an agent template into Create an agent', () => {
    const create = vi.fn()
    render(<Harness onCreateAgent={create} />)
    const template = rows().find(r => r.textContent?.includes('Project manager'))!
    openMenu(template)
    fireEvent.click(within(template).getByRole('menuitem', { name: 'Create an agent' }))
    expect(create).toHaveBeenCalledWith('a1')
  })

  it("opens a team template into its review, with no task behind it", () => {
    render(<Harness source={[row({ key: 't1', assetId: 't1', kind: 'team', title: 'Support desk', identity: 'agenthix/support-desk' })]} />)
    const team = rows()[0]!
    openMenu(team)
    fireEvent.click(within(team).getByRole('menuitem', { name: /^Use this team/ }))
    expect(screen.getByTestId('where').textContent).toBe('/workforce-templates/review')
  })

  it('leaves Use this team off for someone who is not an administrator', () => {
    render(<Harness isAdmin={false} source={[row({ key: 't1', assetId: 't1', kind: 'team', title: 'Support desk', identity: 'agenthix/support-desk' })]} />)
    const team = rows()[0]!
    openMenu(team)
    expect((within(team).getByRole('menuitem', { name: /^Use this team/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})
