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
const gate = vi.hoisted(() => ({
  choose: vi.fn(),
  connecting: vi.fn(),
  creating: vi.fn(),
  revoke: vi.fn(async (_token: string) => true),
}))
vi.mock('../../github/mintGate', () => ({ revokeGateToken: gate.revoke }))
vi.mock('../../github/mintGateConnect', () => ({
  chooseConnectInstallation: gate.choose, mintForConnecting: gate.connecting, mintForCreating: gate.creating,
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

import { disconnectRepo, getRepoFor, findAttachmentByRepoUrl } from '../repoAttachmentService'

const SITE = 'site-logical-1'
const wsTarget = { ownerType: 'project', ownerId: 'p1', workspaceId: 'ws1' } as any
const filesTarget = { ownerType: 'project', ownerId: 'p1' } as any

beforeEach(() => {
  vi.clearAllMocks()
  mockStoreGetRepoForTarget.mockResolvedValue(null)
  mockStoreCreateRepo.mockResolvedValue({ id: 'att1' })
  mockStoreDeleteRepo.mockResolvedValue(undefined)
  mockStoreFindRepoByUrl.mockResolvedValue(null)
  gate.choose.mockResolvedValue({ id: 'inst-row-1', installationId: 101, accountId: 7, accountLogin: 'org', accountType: 'Organization' })
  gate.creating.mockResolvedValue({ token: 'ghs_admin', installation: {} })
  gate.connecting.mockImplementation(async ({ repositoryName }: { repositoryName: string }) => ({
    token: 'ghs_x', expiresAt: new Date(), installationId: 101,
    repository: { id: 900, name: repositoryName, fullName: `org/${repositoryName}`, ownerId: 7, ownerLogin: 'org' },
  }))
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
