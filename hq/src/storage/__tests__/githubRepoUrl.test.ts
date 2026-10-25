import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  getRepoForTarget: vi.fn(),
  createRepo: vi.fn(),
  connecting: vi.fn(),
  connectRepoOnSite: vi.fn(),
  repoStateOnSite: vi.fn(),
}))

vi.mock('../../github/mintGate', () => ({ revokeGateToken: vi.fn(async () => true) }))
vi.mock('../../github/mintGateConnect', () => ({
  chooseConnectInstallation: vi.fn(async () => ({ id: 'inst-row-1' })), mintForConnecting: h.connecting, mintForCreating: vi.fn(),
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
