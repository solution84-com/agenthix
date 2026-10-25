// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SearchScopeSwitch } from '../SearchScopeSwitch'
import { SearchResults, orgPageHref } from '../SearchResults'
import { DEFAULT_SCOPE, hitFrom } from '../searchScope'

afterEach(cleanup)

describe('the search switch @SC-1426', () => {
  it('offers This project, Organisation and Both, with Both chosen by default', () => {
    render(<SearchScopeSwitch onChange={() => {}} />)
    const radios = screen.getAllByRole('radio')
    expect(radios.map(r => r.textContent)).toEqual(['This project', 'Organisation', 'Both'])
    expect(DEFAULT_SCOPE).toBe('both')
    expect(screen.getByRole('radio', { name: 'Both' }).getAttribute('aria-checked')).toBe('true')
  })

  it('says Your space where there is no project, and reports a choice', () => {
    const onChange = vi.fn()
    render(<SearchScopeSwitch personal value="this" onChange={onChange} />)
    expect(screen.getByRole('radio', { name: 'Your space' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('radio', { name: 'Organisation' }))
    expect(onChange).toHaveBeenCalledWith('org')
  })
})

describe('search results @SC-1426', () => {
  const hits = [
    { level: 'project', page: 'deploys.md', title: 'Deploys', description: 'How we ship.', matches: [{ line: 4, text: 'Staging deploys' }] },
    { level: 'org', page: 'how-we-work/review.md', title: 'Code review', matches: [] },
  ]

  it('marks each result with where it is from', () => {
    render(<MemoryRouter><SearchResults hits={hits} onOpen={() => {}} /></MemoryRouter>)
    expect(screen.getAllByTestId('hit-from').map(e => e.textContent)).toEqual(['This project', 'Organisation'])
    expect(hitFrom(hits[0], true)).toBe('Your space')
  })

  it('opens a page of the place in the tool, and an organisation page in the organisation\'s Knowledge', () => {
    const onOpen = vi.fn()
    render(<MemoryRouter><SearchResults hits={hits} onOpen={onOpen} /></MemoryRouter>)
    fireEvent.click(within(screen.getByTestId('search-results')).getByRole('button', { name: /Deploys/ }))
    expect(onOpen).toHaveBeenCalledWith('deploys.md')
    expect(screen.getByRole('link', { name: /Code review/ }).getAttribute('href')).toBe(orgPageHref('how-we-work/review.md'))
    expect(orgPageHref('a b/c.md')).toBe('/org/knowledge?tool=knowledge&page=a+b%2Fc.md')
  })

  it('shows a page once: its title, its description and the lines that matched, never a raw front matter line', () => {
    render(<MemoryRouter><SearchResults hits={hits} onOpen={() => {}} /></MemoryRouter>)
    const first = within(screen.getAllByRole('listitem')[0])
    expect(first.getByText('Deploys')).toBeTruthy()
    expect(first.getByText('How we ship.')).toBeTruthy()
    expect(first.getByText('Staging deploys')).toBeTruthy()
    expect(screen.queryByText(/^\d+:/)).toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('says so when nothing matches', () => {
    render(<MemoryRouter><SearchResults hits={[]} onOpen={() => {}} /></MemoryRouter>)
    expect(screen.getByText('No page matches.')).toBeTruthy()
  })
})
