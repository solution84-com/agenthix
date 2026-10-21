import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetRepoFor = vi.hoisted(() => vi.fn(async () => ({ repoUrl: 'https://github.com/acme/website' })))
const mockResolveOwnerSiteId = vi.hoisted(() => vi.fn(async (): Promise<string | null> => 'site-logical-1'))

vi.mock('../../storage/repoAttachmentService', () => ({
  getRepoFor: mockGetRepoFor,
}))
vi.mock('../../storage/ownerSite', () => ({
  resolveOwnerSiteId: mockResolveOwnerSiteId,
}))
vi.mock('../githubApp', () => ({ getTokenFor: vi.fn(async () => 'ghs_minted') }))

import { resolveRepoApi } from '../repoApi'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetRepoFor.mockResolvedValue({ repoUrl: 'https://github.com/acme/website' })
  mockResolveOwnerSiteId.mockResolvedValue('site-logical-1')
})

describe('resolveRepoApi @SC-258 @SC-320', () => {
  it('resolves owner/repo + a minted token (no PAT)', async () => {
    const r = await resolveRepoApi({ ownerType: 'project', ownerId: 'p1', workspaceId: null } as any)
    expect(r).toEqual({ owner: 'acme', repo: 'website', token: 'ghs_minted' })
    expect(mockResolveOwnerSiteId).toHaveBeenCalledWith('project', 'p1')
    expect(mockGetRepoFor).toHaveBeenCalledWith('site-logical-1', { ownerType: 'project', ownerId: 'p1', workspaceId: null })
  })

  // R-099: rows linked before the canonical form was enforced keep the pasted URL.
  it.each([
    'http://github.com/acme/website',
    'https://www.github.com/acme/website',
    'https://github.com/acme/website.git/',
    'git@github.com:acme/website.git',
  ])('resolves a repo stored as %j', async (stored) => {
    mockGetRepoFor.mockResolvedValueOnce({ repoUrl: stored })
    const r = await resolveRepoApi({ ownerType: 'project', ownerId: 'p1', workspaceId: null } as any)
    expect(r).toEqual({ owner: 'acme', repo: 'website', token: 'ghs_minted' })
  })

  it('still refuses a stored URL that is not a github.com repo', async () => {
    mockGetRepoFor.mockResolvedValueOnce({ repoUrl: 'https://evil.example/acme/website' })
    await expect(
      resolveRepoApi({ ownerType: 'project', ownerId: 'p1', workspaceId: null } as any),
    ).rejects.toThrow(/Invalid GitHub repo URL/)
  })

  it('refuses when the owner has no resolvable Execution Site, never calling getRepoFor', async () => {
    mockResolveOwnerSiteId.mockResolvedValueOnce(null)
    await expect(
      resolveRepoApi({ ownerType: 'project', ownerId: 'p1', workspaceId: null } as any),
    ).rejects.toThrow(/No Execution Site/)
    expect(mockGetRepoFor).not.toHaveBeenCalled()
  })
})
