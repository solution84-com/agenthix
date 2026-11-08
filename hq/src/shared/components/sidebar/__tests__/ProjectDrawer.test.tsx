// @vitest-environment jsdom
/** On a phone, inside a place: the top bar's ☰ (‹ Back on a view inside a section), its title, and the place's drawer from the right with Find a project in it. */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (q: string) => ({
    data: q === 'getProjects'
      ? [{ id: 'p1', key: 'AGX', name: 'Agenthix', isMember: true }, { id: 'p2', key: 'WEB', name: 'Website relaunch', isMember: true }]
      : q === 'getPins' ? [{ id: 'x', kind: 'PROJECT', itemId: 'p2' }] : undefined,
  }),
  getProjects: 'getProjects',
  getPins: 'getPins',
}))
vi.mock('@agenthix/ui/primitives', () => ({ PlaceAvatar: () => null }))
vi.mock('../../AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('../../../layouts/useShellCounts', () => ({ useShellCounts: () => ({ unreadNotifications: 0, runsInProgress: 0, runsNeedingYou: 0 }) }))
vi.mock('../../../../dock/DockPhoneButton', () => ({ DockPhoneButton: () => <button data-testid="dock-phone-button" /> }))
const openDrawer = vi.hoisted(() => vi.fn())
vi.mock('../../../context/NavDrawerContext', () => ({ useNavDrawer: () => ({ openDrawer, open: false, closeDrawer: () => {}, toggleDrawer: () => {} }) }))

import { PlaceDrillMobileHeader } from '../../../../places/components/PlaceDrillMobileHeader'
import type { PlaceNav } from '../../../layouts/placeNavTypes'

const project: PlaceNav = {
  kind: 'project', id: 'p1', name: 'Agenthix', homePath: '/projects/AGX', avatarUrl: null, current: 'boards',
  sections: [
    { id: 'overview', label: 'Overview', href: '/projects/AGX', group: null },
    { id: 'tasks', label: 'Tasks', href: '/projects/AGX?tool=tasks', group: 'Work' },
    { id: 'boards', label: 'Boards', href: '/projects/AGX?tool=boards', group: 'Work' },
  ],
}

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}

const show = (nav: PlaceNav = project) => render(
  <MemoryRouter initialEntries={['/projects/AGX?tool=boards']}>
    <PlaceDrillMobileHeader nav={nav} backHref="/projects" />
    <Where />
  </MemoryRouter>,
)
const header = () => within(screen.getByTestId('mobile-header'))
const drawer = () => screen.queryByRole('dialog')
const more = () => header().getByRole('button', { name: 'Actions for this screen' })
const openIt = () => {
  fireEvent.click(more())
  fireEvent.click(screen.getByRole('menuitem', { name: 'Agenthix menu ›' }))
}

beforeEach(() => openDrawer.mockClear())

describe('the top bar inside a project', () => {
  it('leads a project’s section with ☰, not ‹ Back, names the section with the project under it, and ends with the chat and one ⋯', () => {
    show()
    fireEvent.click(header().getByRole('button', { name: 'Open menu' }))
    expect(openDrawer).toHaveBeenCalledTimes(1)
    expect(header().queryByRole('link', { name: 'Back' })).toBeNull()
    expect(header().getByText('Boards')).toBeTruthy()
    expect(header().getByText('Agenthix').className).toContain('text-text-muted')
    const end = header().getByTestId('dock-phone-button').parentElement!
    expect([...end.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.dataset.testid)).toEqual(['dock-phone-button', 'Actions for this screen'])
  })

  it('holds the project’s menu as the ⋯’s last item, after the section’s add, which comes first', () => {
    const onAdd = vi.fn()
    render(
      <MemoryRouter initialEntries={['/projects/AGX?tool=tasks']}>
        <PlaceDrillMobileHeader nav={{ ...project, current: 'tasks' }} backHref="/projects" add={{ label: 'New task', onClick: onAdd }} />
      </MemoryRouter>,
    )
    fireEvent.click(more())
    const items = screen.getAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual(['New task', 'Agenthix menu ›'])
    expect(screen.getByRole('separator')).toBeTruthy()
    fireEvent.click(items[0])
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('leads a view opened inside a section (a task) with ‹ Back to the section', () => {
    render(
      <MemoryRouter initialEntries={['/tasks/AGX-1']}>
        <PlaceDrillMobileHeader nav={{ ...project, current: 'tasks' }} backHref="/projects/AGX?tool=tasks" title="AGX-1" />
      </MemoryRouter>,
    )
    expect(header().getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('/projects/AGX?tool=tasks')
    expect(header().queryByRole('button', { name: 'Open menu' })).toBeNull()
    expect(header().getByText('Agenthix · Tasks')).toBeTruthy()
  })

  it('keeps ☰ in your space, one of the app’s own places', () => {
    show({ ...project, kind: 'space', id: null, name: 'Your space', homePath: '/space' })
    fireEvent.click(header().getByRole('button', { name: 'Open menu' }))
    expect(openDrawer).toHaveBeenCalledTimes(1)
    expect(header().queryByRole('link', { name: 'Back' })).toBeNull()
  })
})

describe('the project drawer, from the right', () => {
  it('has the project’s name ▾ on top, then every section, the one shown lit', () => {
    show()
    openIt()
    const d = within(drawer()!)
    expect(drawer()!.getAttribute('aria-label')).toBe('Agenthix menu')
    expect(d.getByRole('button', { name: 'Agenthix, find a project' })).toBeTruthy()
    expect(d.getAllByRole('link').map((a) => a.textContent)).toEqual(['Overview', 'Tasks', 'Boards'])
    expect(d.getByRole('link', { current: 'page' }).textContent).toBe('Boards')
  })

  it('brings up Find a project in the same drawer, with ‹ back to the sections: two layers at most', () => {
    show()
    openIt()
    fireEvent.click(within(drawer()!).getByRole('button', { name: 'Agenthix, find a project' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    const d = within(screen.getByRole('dialog', { name: 'Find a project' }))
    expect(within(d.getByRole('region', { name: 'Pinned' })).getByText('Website relaunch')).toBeTruthy()
    fireEvent.click(d.getByRole('button', { name: "Back to Agenthix's menu" }))
    expect(screen.getByRole('dialog', { name: 'Agenthix menu' })).toBeTruthy()
  })

  it('switches project on the same section, and closes', () => {
    show()
    openIt()
    fireEvent.click(within(drawer()!).getByRole('button', { name: 'Agenthix, find a project' }))
    fireEvent.click(within(drawer()!).getByRole('link', { name: /Website relaunch/ }))
    expect(screen.getByTestId('where').textContent).toBe('/projects/WEB?tool=boards')
    expect(drawer()).toBeNull()
  })

  it.each([
    ['Esc', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['a tap outside', () => fireEvent.click(screen.getByTestId('project-drawer-backdrop'))],
    ['✕', () => fireEvent.click(within(drawer()!).getByRole('button', { name: 'Close' }))],
  ])('closes on %s with nothing moved', (_how, dismiss) => {
    show()
    openIt()
    dismiss()
    expect(drawer()).toBeNull()
    expect(screen.getByTestId('where').textContent).toBe('/projects/AGX?tool=boards')
  })
})
