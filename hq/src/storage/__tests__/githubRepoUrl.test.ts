import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  getRepoForTarget: vi.fn(),
  createRepo: vi.fn(),
  getTokenFor: vi.fn(),
  connectRepoOnSite: vi.fn(),
  repoStateOnSite: vi.fn(),
}))

vi.mock('../../github/githubApp', () => ({
  getTokenFor: h.getTokenFor,
  getOrgToken: vi.fn(),
  refreshInstallations: vi.fn(),
}))
vi.mock('../workspaceStore', () => ({
  getRepoForTarget: h.getRepoForTarget,
  createRepo: h.createRepo,
  deleteRepo: vi.fn(),
  findRepoByUrl: vi.fn(),
}))
vi.mock('../repoWorkStore', () => ({
  connectRepoOnSite: h.connectRepoOnSite,
  repoStateOnSite: h.repoStateOnSite,
}))

import { parseRepo } from '../github'
import { connectRepo } from '../repoAttachmentService'

const filesTarget = { ownerType: 'project' as const, ownerId: 'p1' }

describe('parseRepo', () => {
  it.each([
    ['https://github.com/acme/store', { owner: 'acme', name: 'store' }],
    ['https://github.com/acme/store.git', { owner: 'acme', name: 'store' }],
    ['git@github.com:acme/store.git', { owner: 'acme', name: 'store' }],
    ['git@github.com:acme/store', { owner: 'acme', name: 'store' }],
    ['https://github.com/my-org/my.repo_name-2', { owner: 'my-org', name: 'my.repo_name-2' }],
  ])('parses %j', (url, expected) => {
    expect(parseRepo(url)).toEqual(expected)
  })

  it.each([
    'https://evil.example/github.com/acme/store',
    'https://evil.example/x/github.com:acme/store',
    'https://github.com.evil.example/acme/store',
    'https://github.com@evil.example/acme/store',
    'https://github.com:443@evil.example/acme/store',
    'git@evil.example:github.com/acme/store',
    'http://github.com/acme/store',
    'ssh://git@github.com/acme/store',
    'file:///tmp/github.com/acme/store',
    'ext::sh -c touch% /tmp/pwned github.com/acme/store',
    'https://github.com/acme/store/../../other/repo',
    'https://github.com/acme/../store',
    'https://github.com/acme/..',
    'https://github.com/acme/.',
    'https://github.com/-acme/store',
    'https://github.com/acme/store?x=1',
    'https://github.com/acme/store#readme',
    'https://github.com/acme/store/',
    'https://github.com/acme',
    ' https://github.com/acme/store',
    'https://github.com/acme/store\nhttps://evil.example/a/b',
  ])('refuses %j', (url) => {
    expect(() => parseRepo(url)).toThrow(/Invalid GitHub repo URL/)
  })
})

describe('connectRepo link — repository URL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.getRepoForTarget.mockResolvedValue(null)
    h.repoStateOnSite.mockResolvedValue({ isGitRepo: false, hasFiles: false })
    h.getTokenFor.mockResolvedValue('ghs_minted')
    h.createRepo.mockResolvedValue({ id: 'att-1' })
    h.connectRepoOnSite.mockResolvedValue({ connected: true })
  })

  it.each([
    'https://evil.example/github.com/acme/store',
    'https://github.com:443@evil.example/acme/store',
    'https://github.com/acme/store/../../other',
  ])('refuses %j before asking the site, minting a token or running git', async (repoUrl) => {
    await expect(connectRepo('site-1', { target: filesTarget, mode: 'link', repoUrl })).rejects.toThrow(/Invalid GitHub repo URL/)
    expect(h.repoStateOnSite).not.toHaveBeenCalled()
    expect(h.getTokenFor).not.toHaveBeenCalled()
    expect(h.connectRepoOnSite).not.toHaveBeenCalled()
    expect(h.createRepo).not.toHaveBeenCalled()
  })

  it('points git at the github.com URL rebuilt from owner and name, and records that URL', async () => {
    const result = await connectRepo('site-1', { target: filesTarget, mode: 'link', repoUrl: '  git@github.com:acme/store.git ' })
    expect(h.getTokenFor).toHaveBeenCalledWith({ owner: 'acme', name: 'store' })
    expect(h.connectRepoOnSite).toHaveBeenCalledWith('site-1', filesTarget, 'pull', 'https://github.com/acme/store', 'ghs_minted')
    expect(h.createRepo).toHaveBeenCalledWith('site-1', {
      ownerType: 'project', ownerId: 'p1', workspaceId: null, repoUrl: 'https://github.com/acme/store',
    })
    expect(result).toEqual({ repoUrl: 'https://github.com/acme/store', attachmentId: 'att-1' })
  })
})
