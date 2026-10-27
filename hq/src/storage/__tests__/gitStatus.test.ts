/**
 * hq's git status query (spec part 4, R6): read from the site that holds the folder, checked against the person's
 * access first, a workspace or a place's `files/` only, and the site's refusals as HTTP errors.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GIT_STATUS_METHOD, GIT_STATUS_TIMEOUT_MS, RepoWorkError } from '@agenthix/core'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../sites/channel', async () => {
  const { ChannelRequestFailed } = await import('../../sites/channel/pendingRequests')
  return { siteChannelRegistry: { request }, ChannelRequestFailed }
})
const resolveStorageSite = vi.hoisted(() => vi.fn())
vi.mock('../storageSite', () => ({ resolveStorageSite }))
const assertLocationAccess = vi.hoisted(() => vi.fn())
vi.mock('../locationAccess', () => ({ assertLocationAccess }))

import { getGitStatusQuery } from '../gitStatus'

const clean = {
  repository: true, head: { kind: 'branch', name: 'main' }, changed: 0, changedOverflow: false, inProgress: null,
  lastCommit: { id: 'a41f2c9', subject: 'Add Q3 chart page', author: 'Kernel', at: '2026-10-26T10:00:00Z' },
}
const user = { user: { id: 'u1' } }

beforeEach(() => {
  vi.clearAllMocks()
  resolveStorageSite.mockResolvedValue('site-1')
  assertLocationAccess.mockResolvedValue(undefined)
})

describe('getGitStatus @SC-1549', () => {
  it('asks the site holding the workspace, after checking the person may read it', async () => {
    request.mockResolvedValue(clean)
    const target = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: 'ws1', taskId: 't-ignored' }
    expect(await getGitStatusQuery({ target }, user)).toEqual(clean)
    const loc = { ownerType: 'project', ownerId: 'p1', workspaceId: 'ws1', taskId: null }
    expect(assertLocationAccess).toHaveBeenCalledWith(loc, 'u1', 'read')
    expect(request).toHaveBeenCalledWith('site-1', GIT_STATUS_METHOD, { loc }, GIT_STATUS_TIMEOUT_MS)
  })

  it('asks nothing of a site for someone not signed in, or not entitled', async () => {
    await expect(getGitStatusQuery({ target: { ownerType: 'user', ownerId: 'u1' } }, {})).rejects.toMatchObject({ statusCode: 401 })
    assertLocationAccess.mockRejectedValue(Object.assign(new Error('Not found'), { statusCode: 404 }))
    await expect(getGitStatusQuery({ target: { ownerType: 'user', ownerId: 'u2' } }, user)).rejects.toMatchObject({ statusCode: 404 })
    expect(request).not.toHaveBeenCalled()
  })

  it('turns a site refusal into an HTTP error carrying only its detail', async () => {
    request.mockRejectedValue(new Error(new RepoWorkError('git_timeout', 'git.status ran past this site\'s budget').message))
    await expect(getGitStatusQuery({ target: { ownerType: 'project', ownerId: 'p1' } }, user))
      .rejects.toMatchObject({ message: 'git.status ran past this site\'s budget' })
  })
})
