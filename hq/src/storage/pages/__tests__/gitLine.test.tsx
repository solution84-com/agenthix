// @vitest-environment jsdom
/** The git status line (spec part 4, G1): each of its states, and no line where there is nothing to say. */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const useQuery = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/operations', () => ({ useQuery, getGitStatus: 'getGitStatus' }))

import { GitLine, commitAge } from '../GitLine'

const target = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: 'ws1' }
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const commit = { id: 'a41f2c9', subject: 'Add Q3 chart page', author: 'Kernel', at: minutesAgo(12) }
const repo = (over: object) => ({
  data: { repository: true, head: { kind: 'branch', name: 'main' }, changed: 0, changedOverflow: false, lastCommit: commit, inProgress: null, ...over },
  error: null,
})
const line = () => screen.getByRole('status', { name: 'Git status' }).textContent

beforeEach(() => vi.clearAllMocks())

describe('the git status line @SC-1549', () => {
  it('reads the folder it sits above, and again when the window has focus', () => {
    useQuery.mockReturnValue(repo({}))
    render(<GitLine target={target} />)
    expect(useQuery).toHaveBeenCalledWith(
      'getGitStatus',
      { target: { ownerType: 'project', ownerId: 'p1', workspaceId: 'ws1', taskId: null } },
      expect.objectContaining({ refetchOnWindowFocus: true }),
    )
  })

  it('clean', () => {
    useQuery.mockReturnValue(repo({}))
    render(<GitLine target={target} />)
    expect(line()).toBe('⎇ main·✓ No changes·Last commit a41f2c9 “Add Q3 chart page” by Kernel, 12 min ago')
  })

  it('changed, and a count that is a floor', () => {
    useQuery.mockReturnValue(repo({ changed: 3, head: { kind: 'branch', name: 'feature/q3-charts' } }))
    const { unmount } = render(<GitLine target={target} />)
    expect(line()).toContain('⎇ feature/q3-charts·● 3 changed·Last commit a41f2c9')
    unmount()
    useQuery.mockReturnValue(repo({ changed: 6500, changedOverflow: true }))
    render(<GitLine target={target} />)
    expect(line()).toContain('● 6,500+ changed')
  })

  it('no commits yet', () => {
    useQuery.mockReturnValue(repo({ changed: 12, lastCommit: null }))
    render(<GitLine target={target} />)
    expect(line()).toBe('⎇ main·● 12 new files·No commits yet')
  })

  it('a merge or rebase stopped halfway, and a detached commit', () => {
    useQuery.mockReturnValue(repo({ changed: 2, inProgress: 'merge' }))
    const { unmount } = render(<GitLine target={target} />)
    expect(line()).toContain('⎇ main·⚠ Merge in progress·Last commit')
    unmount()
    useQuery.mockReturnValue(repo({ inProgress: 'rebase', head: { kind: 'detached', commit: 'a41f2c9' } }))
    render(<GitLine target={target} />)
    expect(line()).toContain('⎇ detached at a41f2c9·⚠ Rebase in progress')
  })

  it('no line for a folder that is not a repository, while it is read, or when the site does not answer', () => {
    for (const answer of [{ data: { repository: false }, error: null }, { data: undefined, error: null }, { data: undefined, error: new Error('The Execution Site did not answer') }]) {
      useQuery.mockReturnValue(answer)
      const { container, unmount } = render(<GitLine target={target} />)
      expect(container.textContent).toBe('')
      unmount()
    }
  })
})

describe('commitAge @SC-1549', () => {
  const now = new Date('2026-10-26T12:00:00Z')
  it('says how long ago, in words a person reads', () => {
    expect(commitAge('2026-10-26T11:59:40Z', now)).toBe('just now')
    expect(commitAge('2026-10-26T11:48:00Z', now)).toBe('12 min ago')
    expect(commitAge('2026-10-26T09:00:00Z', now)).toBe('3 h ago')
    expect(commitAge('2026-10-25T09:00:00Z', now)).toBe('yesterday')
    expect(commitAge('2026-10-22T09:00:00Z', now)).toBe('4 days ago')
    expect(commitAge('2026-09-01T09:00:00Z', now)).toBe('1 Sept 2026')
  })
})
