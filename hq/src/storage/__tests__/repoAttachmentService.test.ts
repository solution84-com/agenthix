import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockStoreGetRepoForTarget = vi.hoisted(() => vi.fn())
const mockStoreCreateRepo = vi.hoisted(() => vi.fn())
const mockStoreDeleteRepo = vi.hoisted(() => vi.fn())
const mockStoreFindRepoByUrl = vi.hoisted(() => vi.fn())

vi.mock('../workspaceStore', () => ({
  getRepoForTarget: mockStoreGetRepoForTarget,
  createRepo: mockStoreCreateRepo,
  deleteRepo: mockStoreDeleteRepo,
  findRepoByUrl: mockStoreFindRepoByUrl,
}))
vi.mock('../../github/githubApp', () => ({
  getTokenFor: vi.fn(async () => 'ghs_x'),
  refreshInstallations: vi.fn(),
}))
vi.mock('../repoWorkStore', () => ({
  connectRepoOnSite: vi.fn(),
  repoStateOnSite: vi.fn().mockResolvedValue({ isGitRepo: false, hasFiles: false }),
}))
vi.mock('../github', () => ({
  createGitHubRepo: vi.fn(),
  parseRepo: vi.fn((url: string) => {
    const m = url.match(/github\.com\/([^/]+)\/(.+)/)
    return m ? { owner: m[1], name: m[2] } : { owner: 'org', name: 'web' }
  }),
  toRepoSlug: (s: string) => s.toLowerCase(),
}))

import { getTokenFor } from '../../github/githubApp'
import { connectRepoOnSite, repoStateOnSite } from '../repoWorkStore'
import { createGitHubRepo } from '../github'
import { connectRepo, disconnectRepo, getRepoFor, findAttachmentByRepoUrl } from '../repoAttachmentService'

const SITE = 'site-logical-1'
const wsTarget = { ownerType: 'project', ownerId: 'p1', workspaceId: 'ws1' } as any
const filesTarget = { ownerType: 'project', ownerId: 'p1' } as any

beforeEach(() => {
  vi.clearAllMocks()
  mockStoreGetRepoForTarget.mockResolvedValue(null)
  mockStoreCreateRepo.mockResolvedValue({ id: 'att1' })
  mockStoreDeleteRepo.mockResolvedValue(undefined)
  mockStoreFindRepoByUrl.mockResolvedValue(null)
  ;(repoStateOnSite as any).mockResolvedValue({ isGitRepo: false, hasFiles: false })
})

describe('connectRepo init @SC-259', () => {
  it('creates an empty repo, pushes up via App token, and attaches it to a workspace', async () => {
    ;(createGitHubRepo as any).mockResolvedValue('https://github.com/org/web')
    const res = await connectRepo(SITE, { target: wsTarget, mode: 'init', name: 'web' })
    expect(res.repoUrl).toBe('https://github.com/org/web')
    expect(connectRepoOnSite).toHaveBeenCalledWith(SITE, wsTarget, 'push', 'https://github.com/org/web', 'ghs_x')
    expect(getTokenFor).toHaveBeenCalled()
    expect(mockStoreCreateRepo).toHaveBeenCalledWith(SITE, {
      ownerType: 'project', ownerId: 'p1', workspaceId: 'ws1', repoUrl: 'https://github.com/org/web',
    })
  })
})

describe('connectRepo link @SC-259', () => {
  it('pulls an existing repo into an empty files location (workspaceId null)', async () => {
    await connectRepo(SITE, { target: filesTarget, mode: 'link', repoUrl: 'https://github.com/org/x' })
    expect(connectRepoOnSite).toHaveBeenCalledWith(SITE, filesTarget, 'pull', 'https://github.com/org/x', 'ghs_x')
    expect(mockStoreCreateRepo.mock.calls[0][1].workspaceId).toBeNull()
  })

  it('rejects link when the location already has files', async () => {
    ;(repoStateOnSite as any).mockResolvedValue({ isGitRepo: false, hasFiles: true })
    await expect(connectRepo(SITE, { target: filesTarget, mode: 'link', repoUrl: 'u' })).rejects.toThrow(/already has files/)
  })
})

describe('connectRepo uniqueness @SC-243', () => {
  it('rejects when the target already has a repo', async () => {
    mockStoreGetRepoForTarget.mockResolvedValue({ id: 'existing' })
    await expect(connectRepo(SITE, { target: wsTarget, mode: 'init', name: 'web' })).rejects.toThrow(/already has a connected repo/)
  })
})

describe('disconnectRepo @SC-259', () => {
  it('deletes the attachment; the location stays (no key revoke)', async () => {
    mockStoreGetRepoForTarget.mockResolvedValue({ id: 'att1', repoUrl: 'https://github.com/org/web' })
    await disconnectRepo(SITE, wsTarget)
    expect(mockStoreDeleteRepo).toHaveBeenCalledWith(SITE, 'att1')
  })

  it('rejects when no repo is connected', async () => {
    await expect(disconnectRepo(SITE, wsTarget)).rejects.toThrow(/No repo is connected/)
  })
})

describe('findAttachmentByRepoUrl @SC-263', () => {
  it('matches an attachment by owner/repo regardless of a .git suffix', async () => {
    mockStoreFindRepoByUrl.mockResolvedValue({ id: 'att1', ownerId: 'p1', repoUrl: 'https://github.com/acme/website' })
    const found = await findAttachmentByRepoUrl(SITE, 'acme', 'website')
    expect(mockStoreFindRepoByUrl).toHaveBeenCalledWith(SITE, 'https://github.com/acme/website')
    expect(found?.ownerId).toBe('p1')
  })

  it('strips a .git suffix from the repo name before querying', async () => {
    mockStoreFindRepoByUrl.mockResolvedValue({ id: 'att1', ownerId: 'p1', repoUrl: 'https://github.com/acme/website' })
    await findAttachmentByRepoUrl(SITE, 'acme', 'website.git')
    expect(mockStoreFindRepoByUrl).toHaveBeenCalledWith(SITE, 'https://github.com/acme/website')
  })
})

describe('getRepoFor @SC-259', () => {
  it('resolves repoUrl for Operations (no pat)', async () => {
    mockStoreGetRepoForTarget.mockResolvedValue({ repoUrl: 'https://github.com/org/x' })
    expect(await getRepoFor(SITE, filesTarget)).toEqual({ repoUrl: 'https://github.com/org/x' })
  })

  it('returns null when no attachment exists', async () => {
    expect(await getRepoFor(SITE, filesTarget)).toBeNull()
  })
})

describe('getAttachment target shape @SC-320', () => {
  it("a workspace target sends workspaceId; an owner's-files target omits the key entirely", async () => {
    mockStoreGetRepoForTarget.mockResolvedValue(null)
    const { getAttachment } = await import('../repoAttachmentService')

    await getAttachment(SITE, wsTarget)
    expect(mockStoreGetRepoForTarget).toHaveBeenLastCalledWith(SITE, { ownerType: 'project', ownerId: 'p1', workspaceId: 'ws1' })

    await getAttachment(SITE, filesTarget)
    const params = mockStoreGetRepoForTarget.mock.calls[1][1]
    expect(params).toEqual({ ownerType: 'project', ownerId: 'p1' })
    expect(Object.prototype.hasOwnProperty.call(params, 'workspaceId')).toBe(false)
  })
})
