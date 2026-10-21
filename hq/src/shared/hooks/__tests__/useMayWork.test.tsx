// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseQuery = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/operations', () => ({
  useQuery: mockUseQuery,
  getProjects: 'getProjects',
}))

import { useMayWork, useMayWorkWhere } from '../useMayWork'

const projects = [
  { id: 'viewer', key: 'VIEW', isMember: true, myRole: 'VIEWER' },
  { id: 'member', key: 'MEMB', isMember: true, myRole: 'MEMBER' },
  { id: 'admin', key: 'ADMN', isMember: true, myRole: 'ADMIN' },
  { id: 'mine', key: 'MINE', isMember: true, myRole: null },
  { id: 'open-not-joined', key: 'OPEN', isMember: false, myRole: null },
]

describe('useMayWork: whether the signed-in person works in a project (adr-0102) @SC-627', () => {
  it.each([
    ['viewer', false],
    ['member', true],
    ['admin', true],
    ['mine', true],
    ['open-not-joined', false],
  ])('%s -> %s', (projectId, expected) => {
    mockUseQuery.mockReturnValue({ data: projects })
    expect(renderHook(() => useMayWork(projectId)).result.current).toBe(expected)
  })

  it('leaves the controls enabled until the projects have loaded, or when no project is known yet', () => {
    mockUseQuery.mockReturnValue({ data: undefined })
    expect(renderHook(() => useMayWork('viewer')).result.current).toBe(true)
    mockUseQuery.mockReturnValue({ data: projects })
    expect(renderHook(() => useMayWork(undefined)).result.current).toBe(true)
  })

  it('answers for each project in a list', () => {
    mockUseQuery.mockReturnValue({ data: projects })
    const mayWork = renderHook(() => useMayWorkWhere()).result.current
    expect(['viewer', 'member', 'mine'].map(mayWork)).toEqual([false, true, true])
    const byKey = renderHook(() => useMayWorkWhere('key')).result.current
    expect(['VIEW', 'MEMB', null].map(byKey)).toEqual([false, true, true])
  })
})
