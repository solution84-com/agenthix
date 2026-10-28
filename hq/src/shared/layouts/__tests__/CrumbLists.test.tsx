// @vitest-environment jsdom
/** Drilled into a place, each part of the breadcrumb opens a list of where to go at that level. */
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
      : [{ kind: 'PROJECT', itemId: 'p2' }, { kind: 'BOARD', itemId: 'b1' }],
  }),
}))
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

function renderBar() {
  render(
    <MemoryRouter initialEntries={['/projects/AGX?tool=boards']}>
      <ScreenBar breadcrumbs={drillCrumbs([{ label: 'Projects', href: '/projects' }, { label: 'Agenthix' }], nav)} placeNav={nav} />
      <Where />
    </MemoryRouter>,
  )
}

const open = (name: string) => {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('button', { name }))
  return screen.getByRole('menu', { name })
}
const items = (menu: HTMLElement) => within(menu).getAllByRole('menuitem').map((a) => [a.textContent, a.getAttribute('href')])

describe('the breadcrumb’s lists @SC-1044', () => {
  it('Home ▾ lists the main navigation', () => {
    renderBar()
    expect(items(open('Home')).map(([label]) => label)).toEqual(
      ['Home', 'Chat', 'Your space', 'Projects', 'Tasks', 'Agents', 'Library', 'Organisation', 'Settings'],
    )
  })

  it('Projects ▾ lists the places', () => {
    renderBar()
    expect(items(open('Projects'))).toEqual([['All projects', '/projects'], ['Your space', '/space'], ['Agents', '/agents']])
  })

  it('the place’s name lists your space and your projects, pinned first, and switching keeps the section', () => {
    renderBar()
    const menu = open('Agenthix')
    expect(items(menu)).toEqual([
      ['Your space', '/space?tool=boards'],
      ['Website relaunch', '/projects/WEB?tool=boards'],
      ['Agenthix', '/projects/AGX?tool=boards'],
      ['Customer research', '/projects/CUS?tool=boards'],
    ])
    expect(within(menu).getByText('Pinned')).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { current: 'page' }).textContent).toBe('Agenthix')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Website relaunch' }))
    expect(screen.getByTestId('where').textContent).toBe('/projects/WEB?tool=boards')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('the section lists the place’s sections with their counts, the one shown marked', () => {
    renderBar()
    const menu = open('Boards')
    expect(items(menu)).toEqual([
      ['Overview', '/projects/AGX'], ['Tasks1 needs you', '/projects/AGX?tool=tasks'], ['Boards3', '/projects/AGX?tool=boards'],
    ])
    expect(within(menu).getByRole('menuitem', { current: 'page' }).textContent).toBe('Boards3')
  })

  it('closes on Esc, and focus returns to the part', () => {
    renderBar()
    open('Boards')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Boards' }))
    expect(screen.getByTestId('where').textContent).toBe('/projects/AGX?tool=boards')
  })
})
