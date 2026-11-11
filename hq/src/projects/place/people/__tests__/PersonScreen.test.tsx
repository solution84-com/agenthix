// @vitest-environment jsdom
/** A failed read of a person is not "not in this project": only a final answer says that. */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const q = vi.hoisted(() => ({ person: {} as Record<string, unknown> }))
vi.mock('wasp/client/operations', () => ({
  getProjectPerson: 'getProjectPerson', getProjectTeams: 'getProjectTeams', setProjectMemberRole: 'setProjectMemberRole',
  useQuery: (op: string) => (op === 'getProjectPerson' ? q.person : { data: undefined }),
  useAction: () => vi.fn(),
}))
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@agenthix/ui/people', () => ({ ProjectPersonView: () => <div>the person's page</div>, isLastAdmin: () => false }))
vi.mock('../../../../people/AuthedPersonAvatar', () => ({ personAvatarOf: () => null }))
vi.mock('../../../../people/PersonProfileCard', () => ({ PersonProfileTrigger: () => null }))
vi.mock('../../../../people/orgPeoplePaths', () => ({ orgPeoplePath: () => '/' }))
vi.mock('../useProjectPeopleView', () => ({ PEOPLE_REFRESH_MS: 15_000, useProjectPeopleView: () => ({ view: undefined }) }))
vi.mock('../usePeopleToolUrl', () => ({ usePeopleToolUrl: () => ({ openTool: vi.fn() }) }))

import { PersonScreen } from '../PersonScreen'

const props = { projectId: 'p1', userId: 'u1', onBack: vi.fn(), onRemove: vi.fn(), onLeave: vi.fn() }
const detail = { person: { userId: 'u1' } }
beforeEach(() => cleanup())

describe('a person that could not be read @SC-1935', () => {
  it('says it could not be read, with Try again, when the first read failed', () => {
    q.person = { data: undefined, isLoading: false, error: new Error('down'), dataUpdatedAt: 0, refetch: vi.fn() }
    render(<PersonScreen {...props} />)
    expect(screen.getByText('The person could not be read')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText('That person is not in this project.')).toBeNull()
  })

  it('says the person is not in this project only for a final answer', () => {
    q.person = { data: undefined, isLoading: false, error: Object.assign(new Error('x'), { statusCode: 404 }), dataUpdatedAt: 0, refetch: vi.fn() }
    render(<PersonScreen {...props} />)
    expect(screen.getByText('That person is not in this project.')).toBeTruthy()
    expect(screen.getByRole('button', { name: '‹ People' })).toBeTruthy()
  })

  it('keeps the page when a refetch fails with the person held', () => {
    q.person = { data: detail, isLoading: false, error: new Error('down'), dataUpdatedAt: Date.now(), refetch: vi.fn() }
    render(<PersonScreen {...props} />)
    expect(screen.getByText("the person's page")).toBeTruthy()
    expect(screen.queryByText('That person is not in this project.')).toBeNull()
  })
})
