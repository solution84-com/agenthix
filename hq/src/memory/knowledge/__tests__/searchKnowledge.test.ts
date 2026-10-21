import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LOCATION_FILE_METHODS } from '@agenthix/core'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../../sites/channel', async () => {
  const { ChannelRequestFailed } = await import('../../../sites/channel/pendingRequests')
  return { siteChannelRegistry: { request }, ChannelRequestFailed }
})
const resolveStorageSite = vi.hoisted(() => vi.fn())
vi.mock('../../../storage/storageSite', () => ({ resolveStorageSite }))
const siteRow = vi.hoisted(() => ({ label: 'Local site', status: 'offline', protocolVersion: '1.0' as string | null }))
vi.mock('wasp/server', () => ({
  prisma: {
    executionSite: { findUnique: async () => siteRow },
    project: { findUnique: async () => ({ name: 'Atlas' }) },
  },
}))

import { ChannelRequestFailed } from '../../../sites/channel/pendingRequests'
import { searchKnowledge } from '../searchKnowledge'

const project = { type: 'project' as const, id: 'p1' }

beforeEach(() => {
  vi.clearAllMocks()
  resolveStorageSite.mockResolvedValue('site-logical-1')
  siteRow.protocolVersion = '1.0'
  siteRow.status = 'offline'
})

describe('SearchKnowledge @SC-993', () => {
  it('asks the place\'s site with the owner, the query and the budget, and returns what it answers', async () => {
    const excerpts = [{ path: 'INDEX.md', startLine: 1, endLine: 3, text: 'deploys' }]
    request.mockResolvedValue({ excerpts, cut: ['b.md'], truncated: false })
    expect(await searchKnowledge(project, 'deploys', 500)).toEqual({ excerpts, cut: ['b.md'], unavailable: null })
    expect(resolveStorageSite).toHaveBeenCalledWith({ ownerType: 'project', ownerId: 'p1' })
    expect(request).toHaveBeenCalledWith('site-logical-1', LOCATION_FILE_METHODS.searchKnowledge, {
      ownerType: 'project', ownerId: 'p1', query: 'deploys', maxChars: 500,
    })
  })

  it('says the place\'s knowledge is unavailable when its site cannot be reached', async () => {
    request.mockRejectedValue(new ChannelRequestFailed('site is offline', 'offline'))
    expect(await searchKnowledge(project, 'x', 500)).toEqual({
      excerpts: [], cut: [], unavailable: "Atlas's knowledge is unavailable from its site",
    })
  })

  it('names a person\'s own space plainly', async () => {
    request.mockRejectedValue(new ChannelRequestFailed('timed out', 'timeout'))
    const answer = await searchKnowledge({ type: 'user', id: 'u1' }, 'x', 500)
    expect(answer.unavailable).toBe("Your space's knowledge is unavailable from its site")
  })

  it('answers unavailable from a site that does not know the method, whether or not it has said its version', async () => {
    request.mockRejectedValue(new ChannelRequestFailed('unknown method', 'unknown_method'))
    expect((await searchKnowledge(project, 'x', 500)).unavailable).toMatch(/unavailable from its site/)
    siteRow.protocolVersion = null
    expect((await searchKnowledge(project, 'x', 500)).unavailable).toMatch(/unavailable from its site/)
  })

  it('does not hide a failure that is not about the site being away', async () => {
    request.mockRejectedValue(new Error('boom'))
    await expect(searchKnowledge(project, 'x', 500)).rejects.toThrow('boom')
  })
})
