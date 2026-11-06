// @vitest-environment jsdom
/** Inside a place, the breadcrumb is plain, from Home; only the project's name ▾ opens Find a project. */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

vi.mock('wasp/client/operations', () => ({
  getProjects: 'getProjects',
  getPins: 'getPins',
  useQuery: (q: string) => ({
    data: q === 'getProjects'
      ? [
          { id: 'p1', key: 'AGX', name: 'Agenthix', isMember: true, personalOwnerId: null },
          { id: 'p2', key: 'WEB', name: 'Website relaunch', isMember: true, personalOwnerId: null },
          { id: 'p3', key: 'CUS', name: 'Customer research', isMember: true, personalOwnerId: null },
          { id: 'p4', key: 'OUT', name: 'Not mine', isMember: false, personalOwnerId: null },
          { id: 'p5', key: 'ME', name: 'Personal', isMember: true, personalOwnerId: 'u1', personalSpace: true },
        ]
      : [{ id: 'x2', kind: 'PROJECT', itemId: 'p2' }, { id: 'x1', kind: 'BOARD', itemId: 'b1' }],
  }),
}))
vi.mock('@agenthix/ui/primitives', () => ({ PlaceAvatar: () => null }))
vi.mock('../useShellCounts', () => ({ useShellCounts: () => ({ tasksNeedingYou: 0 }) }))

import { ScreenBar } from '../ScreenBar'
import { drillCrumbs } from '../../../places/placeNav'
import type { PlaceNav } from '../placeNavTypes'

const nav: PlaceNav = {
  kind: 'project', id: 'p1', name: 'Agenthix', homePath: '/projects/AGX', avatarUrl: null, current: 'boards',
  sections: [
    { id: 'overview', label: 'Overview', href: '/projects/AGX', group: null },
    { id: 'tasks', label: 'Tasks', count: '1 needs you', tone: 'needs', href: '/projects/AGX?tool=tasks', group: 'Work' },
    { id: 'boards', label: 'Boards', count: '3', href: '/projects/AGX?tool=boards', group: 'Work' },
  ],
}

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}

function renderBar(given: PlaceNav = nav) {
  render(
    <MemoryRouter initialEntries={['/projects/AGX?tool=boards']}>
      <ScreenBar breadcrumbs={drillCrumbs([{ label: 'Projects', href: '/projects' }, { label: given.name }], given)} placeNav={given} />
      <Where />
    </MemoryRouter>,
  )
}

const bar = () => within(screen.getByRole('navigation', { name: 'Breadcrumb' }))
const finder = () => screen.queryByRole('dialog', { name: 'Find a project' })

describe('the breadcrumb inside a place @SC-1044', () => {
  it('reads Home / Projects / the project ▾ / the section, with links to Home and Projects and the section as the page', () => {
    renderBar()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent).toBe('Home/Projects/Agenthix/Boards')
    expect(bar().getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/')
    expect(bar().getByRole('link', { name: 'Projects' }).getAttribute('href')).toBe('/projects')
    expect(bar().getByText('Boards').getAttribute('aria-current')).toBe('page')
    expect(bar().getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Agenthix, find a project'])
  })

  it('the project’s name opens Find a project: pinned first, then the others, and switching keeps the section', () => {
    renderBar()
    fireEvent.click(bar().getByRole('button', { name: 'Agenthix, find a project' }))
    const links = within(finder()!).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Website relaunch', '/projects/WEB?tool=boards'],
      ['Agenthixhere', '/projects/AGX?tool=boards'],
      ['Customer research', '/projects/CUS?tool=boards'],
      ['All projects →', '/projects'],
    ])
    fireEvent.click(links[0])
    expect(screen.getByTestId('where').textContent).toBe('/projects/WEB?tool=boards')
    expect(finder()).toBeNull()
  })

  it('closes on Esc, and focus returns to the name', () => {
    renderBar()
    fireEvent.click(bar().getByRole('button', { name: 'Agenthix, find a project' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(finder()).toBeNull()
    expect(document.activeElement).toBe(bar().getByRole('button', { name: 'Agenthix, find a project' }))
  })

  it('an agent’s name is a link, not Find a project', () => {
    renderBar({ ...nav, kind: 'agent', id: 'a1', name: 'Kernel', homePath: '/agents/kernel' })
    expect(bar().getByRole('link', { name: 'Kernel' }).getAttribute('href')).toBe('/agents/kernel')
    expect(bar().queryByRole('button')).toBeNull()
  })
})
