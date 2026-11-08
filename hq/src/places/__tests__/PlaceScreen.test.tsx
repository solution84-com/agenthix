// @vitest-environment jsdom
import React, { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Link, useLocation } from 'react-router'
import { ViewHeaderRow } from '@agenthix/ui/primitives'

// The shell draws the place's sections in the left panel; here a list of links stands for it.
vi.mock('../../shared/layouts/AppShell', () => ({
  AppShell: ({ children, screenBarRight, placeNav }: { children: React.ReactNode; screenBarRight: React.ReactNode; placeNav?: PlaceNav | null }) => (
    <div>
      <div data-testid="bar-right">{screenBarRight}</div>
      {placeNav && (
        <nav aria-label={`${placeNav.name} sections`}>
          {placeNav.sections.map((x) => (
            <Link key={x.id} to={x.href} aria-current={x.id === placeNav.current ? 'page' : undefined}>{x.label}{x.count}</Link>
          ))}
        </nav>
      )}
      {children}
    </div>
  ),
}))

import { PlaceScreen } from '../components/PlaceScreen'
import { useInToolPanel } from '../toolPanelContext'
import { usePlaceOwnTalk } from '../placeCrumb'
import type { Place } from '../placeTypes'
import type { PlaceNav } from '../../shared/layouts/placeNavTypes'
import { testPlace } from './placeFixture'

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}

function renderAt(path: string, { place = testPlace(), section, conversations = <div>the conversations</div>, isPlace }: {
  place?: Place
  section?: string
  conversations?: React.ReactNode
  isPlace?: boolean
} = {}) {
  const screenOf = <PlaceScreen place={place} breadcrumbs={[]} mobileHeader={null} conversations={conversations} section={section} isPlace={isPlace} />
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/AGX" element={screenOf} />
        <Route path="/projects/AGX/t/:id" element={screenOf} />
      </Routes>
      <Where />
    </MemoryRouter>,
  )
}

const sections = () => screen.getByRole('navigation', { name: 'Agenthix sections' })
const currentSection = () => within(sections()).getAllByRole('link').find((a) => a.getAttribute('aria-current') === 'page')?.textContent
const where = () => screen.getByTestId('where').textContent

describe('a place’s sections, from its address @SC-1021', () => {
  it('opens Overview at the place’s own address', () => {
    renderAt('/projects/AGX')
    expect(currentSection()).toBe('Overview')
    expect(screen.getByTestId('place-overview')).toBeTruthy()
    expect(screen.queryByText('the conversations')).toBeNull()
  })

  it('lists each section, in the place’s order, each linking to its address', () => {
    renderAt('/projects/AGX')
    const links = within(sections()).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual(
      ['Overview', 'Conversations', 'Tasks1 needs you · 12', 'Boards3', 'Timeline', 'Runs2', 'Members6', 'Settings'],
    )
    expect(links.map((a) => a.getAttribute('href')).slice(0, 3)).toEqual(
      ['/projects/AGX', '/projects/AGX?tool=conversations', '/projects/AGX?tool=tasks'],
    )
  })

  it('shows the place’s conversations at ?tool=conversations', () => {
    renderAt('/projects/AGX?tool=conversations')
    expect(currentSection()).toBe('Conversations')
    expect(screen.getByText('the conversations')).toBeTruthy()
  })

  it('shows one tool across the canvas at its ?tool=', () => {
    renderAt('/projects/AGX?tool=boards')
    expect(currentSection()).toBe('Boards3')
    expect(screen.getByText('the boards view')).toBeTruthy()
    expect(screen.queryByText('the tasks view')).toBeNull()
    expect(screen.queryByTestId('place-overview')).toBeNull()
  })

  it('shows Members at the former ?tool=people and ?tool=agents', () => {
    for (const tool of ['people', 'agents']) {
      const view = renderAt(`/projects/AGX?tool=${tool}`)
      expect(currentSection()).toBe('Members6')
      expect(screen.getByText('the members view')).toBeTruthy()
      view.unmount()
    }
  })

  it('shows Overview for a tool the place does not have', () => {
    renderAt('/projects/AGX?tool=nonsense')
    expect(currentSection()).toBe('Overview')
  })

  it('stays on Conversations on a conversation’s own page', () => {
    renderAt('/projects/AGX/t/c1', { section: 'conversations', conversations: <div>one conversation</div> })
    expect(currentSection()).toBe('Conversations')
    expect(screen.getByText('one conversation')).toBeTruthy()
  })

  it('opens a section from its row on Overview', () => {
    renderAt('/projects/AGX')
    fireEvent.click(within(screen.getByTestId('place-overview')).getByRole('button', { name: /Boards/ }))
    expect(where()).toBe('/projects/AGX?tool=boards')
    expect(screen.getByText('the boards view')).toBeTruthy()
  })
})

describe('a tool in its section @SC-1021', () => {
  it('tells the tool it is drawn as a section, so a page inside it draws no second shell', () => {
    function Probe() { return <span>{useInToolPanel() ? 'inside' : 'outside'}</span> }
    const place = testPlace({ toolGroups: [{ label: 'Work', tools: [{ id: 'probe', label: 'Probe', render: () => <Probe /> }] }] })
    renderAt('/projects/AGX?tool=probe', { place })
    expect(screen.getByText('inside')).toBeTruthy()
  })

  it('draws a view’s own header row across the top of the section', () => {
    function View() {
      const [inner, setInner] = useState(true)
      return inner
        ? <ViewHeaderRow><button type="button" onClick={() => setInner(false)}>‹ Tasks</button><h4>Backlog</h4></ViewHeaderRow>
        : <span>the list</span>
    }
    const place = testPlace({ toolGroups: [{ label: 'Work', tools: [{ id: 'tasks', label: 'Tasks', render: () => <View /> }] }] })
    renderAt('/projects/AGX?tool=tasks', { place })
    expect(screen.getByRole('heading', { name: 'Backlog' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '‹ Tasks' }))
    expect(screen.getByText('the list')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Backlog' })).toBeNull()
  })
})

describe('Talk about <place> @SC-1024', () => {
  // With a root shell it starts a conversation in the dock (`dock/__tests__/dockActions.test.tsx`).
  it('sits in the screen bar, and where there is no dock opens the Conversations section', async () => {
    renderAt('/projects/AGX?tool=tasks')
    const talk = within(screen.getByTestId('bar-right')).getByRole('button', { name: 'Talk about Agenthix' })
    await act(async () => { fireEvent.click(talk) })
    expect(where()).toBe('/projects/AGX?tool=conversations')
  })

  it('leaves the screen bar while the view shown has its own Talk about button in its heading', () => {
    function OwnTalk() { usePlaceOwnTalk(true); return <div>tasks with their own Talk about tasks</div> }
    const place = testPlace({
      toolGroups: [{ label: 'Work', tools: [{ id: 'tasks', label: 'Tasks', render: () => <OwnTalk /> }, { id: 'boards', label: 'Boards', render: () => <div>the boards view</div> }] }],
    })
    renderAt('/projects/AGX?tool=tasks', { place })
    expect(within(screen.getByTestId('bar-right')).queryByRole('button', { name: 'Talk about Agenthix' })).toBeNull()
    fireEvent.click(within(sections()).getByRole('link', { name: 'Boards' }))
    expect(within(screen.getByTestId('bar-right')).getByRole('button', { name: 'Talk about Agenthix' })).toBeTruthy()
  })
})

describe('Chat, which is not a place’s sections', () => {
  it('shows only the conversations and hands the shell no place', () => {
    renderAt('/projects/AGX', { isPlace: false, section: 'conversations' })
    expect(screen.queryByRole('navigation', { name: 'Agenthix sections' })).toBeNull()
    expect(screen.getByText('the conversations')).toBeTruthy()
  })
})
