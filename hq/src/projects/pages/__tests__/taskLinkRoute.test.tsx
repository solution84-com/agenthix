// @vitest-environment jsdom
/** The task link form on a project's address (spec part 3, *Stable links*): opened in the Tasks tool, never past "not found". */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const h = vi.hoisted(() => ({ search: '', place: null as null | { project: Record<string, unknown>; place: object } }))
vi.mock('react-router', () => ({
  useParams: () => ({ key: 'WEB' }),
  useLocation: () => ({ search: h.search }),
  Navigate: ({ to }: { to: string }) => <p>redirect {to}</p>,
}))
vi.mock('../../place/useProjectPlace', () => ({
  useProjectPlace: () => ({ project: h.place?.project, place: h.place?.place, isLoading: false }),
}))
vi.mock('../../place/ProjectPlaceMissing', () => ({ ProjectPlaceMissing: () => <p>Project not found</p> }))
vi.mock('../../../places/components/PlaceScreen', () => ({ PlaceScreen: () => <p>the project</p> }))
vi.mock('../../../places/components/PlaceMobileHeader', () => ({ PlaceMobileHeader: () => null }))
vi.mock('../../../home/components/WelcomeLine', () => ({ WelcomeLine: () => null }))
vi.mock('../../../conversations/components/NewConversationsList', () => ({ NewConversationsList: () => null }))
vi.mock('../../../chat/chatPlacePaths', () => ({ SPACE_PATH: '/chat' }))

import { ProjectConversationsPage } from '../ProjectConversationsPage'

const place = { breadcrumbs: [{ label: 'Projects' }], backHref: '/projects' }

beforeEach(() => {
  cleanup()
  h.place = null
})

describe('a task link on a project\'s address @SC-1561', () => {
  it('opens the task and its file in the Tasks tool', () => {
    h.search = '?task=WEB-42&file=notes.md'
    h.place = { project: { id: 'p1', name: 'Web', personalSpace: false }, place }
    render(<ProjectConversationsPage />)
    expect(screen.getByText('redirect ?task=WEB-42&file=notes.md&tool=tasks')).toBeTruthy()
  })

  it('gives someone who can\'t see the project its usual "not found", and never the file\'s name', () => {
    h.search = '?task=WEB-42&file=secret-plan.md'
    render(<ProjectConversationsPage />)
    expect(screen.getByText('Project not found')).toBeTruthy()
    expect(document.body.textContent).not.toContain('secret-plan')
  })

  it('in Your space, leads to Chat\'s Tasks tool', () => {
    h.search = '?task=ME-3&file=notes.md'
    h.place = { project: { id: 'p2', name: 'Me', personalSpace: true }, place }
    render(<ProjectConversationsPage />)
    expect(screen.getByText('redirect /chat?task=ME-3&file=notes.md&tool=tasks')).toBeTruthy()
  })

  it('leaves the project\'s own address alone', () => {
    h.search = ''
    h.place = { project: { id: 'p1', name: 'Web', personalSpace: false }, place }
    render(<ProjectConversationsPage />)
    expect(screen.getByText('the project')).toBeTruthy()
  })
})
