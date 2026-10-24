/** Connecting a repository (workflows spec part 4): checked before anything is created, undone when a later step fails, and an existing one never overwritten. */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('wasp/server', () => ({
  prisma: {},
  HttpError: class extends Error { constructor(readonly statusCode: number, message: string) { super(message) } },
}))
vi.mock('../workspaceStore', () => ({ getRepoForTarget: vi.fn(), createRepo: vi.fn() }))
vi.mock('../repoWorkStore', () => ({ connectRepoOnSite: vi.fn(), repoStateOnSite: vi.fn() }))
vi.mock('../../github/mintGate', () => ({ revokeGateToken: vi.fn() }))
vi.mock('../../github/mintGateConnect', () => ({ mintForConnecting: vi.fn(), mintForCreating: vi.fn() }))
vi.mock('../../github/connectChecks', () => ({ checkConnect: vi.fn() }))
vi.mock('../../github/connectNewRepository', () => ({ createRepositoryFor: vi.fn(), undoCreatedRepository: vi.fn() }))

import { RepoWorkError } from '@agenthix/core'
import { connectRepo, type ConnectDeps } from '../repoAttachmentService'

const SITE = 'site-1'
const target = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: 'ws1' }
const account = { id: 'inst-row-1', login: 'org' }
const okCheck = { ok: true, account, problem: null, useExisting: null }

let deps: ConnectDeps
let order: string[]

beforeEach(() => {
  order = []
  deps = {
    getAttachment: vi.fn(async () => null),
    check: vi.fn(async () => okCheck),
    repoState: vi.fn(async () => ({ isGitRepo: false, hasFiles: false })),
    createRepository: vi.fn(async () => { order.push('create'); return { id: 900 } }),
    mintForConnecting: vi.fn(async ({ repositoryName }) => ({
      token: 'ghs_x', expiresAt: new Date(), installationId: 101,
      repository: { id: 900, name: repositoryName, fullName: `org/${repositoryName}`, ownerId: 7, ownerLogin: 'org' },
    })),
    connectOnSite: vi.fn(async () => { order.push('site'); return { connected: true as const } }),
    createRow: vi.fn(async () => ({ id: 'att-1' })) as unknown as ConnectDeps['createRow'],
    undo: vi.fn(async () => 'The repository org/web, which had just been created, was deleted again.'),
    revoke: vi.fn(async () => true),
  }
})

describe('a new repository', () => {
  it('is created only after the checks passed, then pushed to, and stored with GitHub\'s ids', async () => {
    deps.check = vi.fn(async () => { order.push('check'); return okCheck })
    const res = await connectRepo(SITE, { target, mode: 'init', name: 'Web', userId: 'u1' }, deps)
    expect(order).toEqual(['check', 'create', 'site'])
    expect(deps.mintForConnecting).toHaveBeenCalledWith(expect.objectContaining({ repositoryName: 'web', permissions: { contents: 'write' } }))
    expect(deps.connectOnSite).toHaveBeenCalledWith(SITE, target, 'push', 'https://github.com/org/web', 'ghs_x')
    expect(deps.createRow).toHaveBeenCalledWith(SITE, expect.objectContaining({ repositoryId: 900, accountId: 7, accountLogin: 'org', installationId: 101 }))
    expect(deps.revoke).toHaveBeenCalledWith('ghs_x')
    expect(res).toEqual({ repoUrl: 'https://github.com/org/web', attachmentId: 'att-1' })
  })

  it('creates nothing when the checks refuse, and says what to do', async () => {
    const words = 'acme gives the App only the selected repositories. In that account\'s GitHub App settings set Repository access to All repositories. Nothing was changed.'
    deps.check = vi.fn(async () => ({ ok: false, account, problem: { kind: 'selected_repositories' as const, words }, useExisting: null }))
    await expect(connectRepo(SITE, { target, mode: 'init', name: 'web', userId: 'u1' }, deps)).rejects.toThrow(words)
    expect(deps.createRepository).not.toHaveBeenCalled()
    expect(deps.mintForConnecting).not.toHaveBeenCalled()
  })

  it('is deleted, and that is said, when the push fails', async () => {
    deps.connectOnSite = vi.fn(async () => { throw new Error('the site went away') })
    await expect(connectRepo(SITE, { target, mode: 'init', name: 'web', userId: 'u1' }, deps))
      .rejects.toThrow(/the site went away\. The repository org\/web, which had just been created, was deleted again\./)
    expect(deps.undo).toHaveBeenCalledWith(expect.objectContaining({ login: 'org', installationRowId: 'inst-row-1' }), 'web')
    expect(deps.createRow).not.toHaveBeenCalled()
    expect(deps.revoke).toHaveBeenCalledWith('ghs_x')
  })

  it('is deleted when storing the connection fails', async () => {
    deps.createRow = vi.fn(async () => { throw new Error('the site refused the row') }) as unknown as ConnectDeps['createRow']
    await expect(connectRepo(SITE, { target, mode: 'init', name: 'web', userId: 'u1' }, deps)).rejects.toThrow(/refused the row.*deleted again/)
    expect(deps.undo).toHaveBeenCalledTimes(1)
  })

  it('is deleted, and the answer names it, when the token reaches another repository than the one made', async () => {
    deps.createRepository = vi.fn(async () => ({ id: 901 }))
    await expect(connectRepo(SITE, { target, mode: 'init', name: 'web', userId: 'u1' }, deps)).rejects.toThrow(/another repository/)
    expect(deps.connectOnSite).not.toHaveBeenCalled()
    expect(deps.undo).toHaveBeenCalledTimes(1)
  })

  it('names the repository it could not delete', async () => {
    deps.connectOnSite = vi.fn(async () => { throw new Error('git failed') })
    deps.undo = vi.fn(async () => 'The repository org/web, which had just been created, could not be deleted (GitHub did not allow it) and is still on GitHub.')
    await expect(connectRepo(SITE, { target, mode: 'init', name: 'web', userId: 'u1' }, deps)).rejects.toThrow(/org\/web.*could not be deleted/)
  })
})

describe('an existing repository', () => {
  const asked = { target, mode: 'existing' as const, repoUrl: 'https://github.com/org/x', userId: 'u1' }

  it('is checked out into an empty workspace with a read token, and nothing is deleted on failure', async () => {
    await connectRepo(SITE, asked, deps)
    expect(deps.mintForConnecting).toHaveBeenCalledWith(expect.objectContaining({ repositoryName: 'x', permissions: { contents: 'read' } }))
    expect(deps.connectOnSite).toHaveBeenCalledWith(SITE, target, 'pull', 'https://github.com/org/x', 'ghs_x')
    expect(deps.createRepository).not.toHaveBeenCalled()
    deps.connectOnSite = vi.fn(async () => { throw new Error('git failed') })
    await expect(connectRepo(SITE, asked, deps)).rejects.toThrow('git failed')
    expect(deps.undo).not.toHaveBeenCalled()
  })

  it('receives a workspace\'s files with a write token', async () => {
    deps.repoState = vi.fn(async () => ({ isGitRepo: false, hasFiles: true }))
    await connectRepo(SITE, asked, deps)
    expect(deps.mintForConnecting).toHaveBeenCalledWith(expect.objectContaining({ permissions: { contents: 'write' } }))
    expect(deps.connectOnSite).toHaveBeenCalledWith(SITE, target, 'push', 'https://github.com/org/x', 'ghs_x')
  })

  it('is refused plainly, never overwritten, when it has history the files do not share', async () => {
    deps.repoState = vi.fn(async () => ({ isGitRepo: false, hasFiles: true }))
    deps.connectOnSite = vi.fn(async () => { throw new RepoWorkError('push_rejected', 'x') })
    await expect(connectRepo(SITE, asked, deps)).rejects.toThrow(/org\/x already has its own history, which the files in this location do not share, so nothing was pushed/)
    expect(deps.createRow).not.toHaveBeenCalled()
    expect(deps.undo).not.toHaveBeenCalled()
  })

  it('is refused when the token reaches a repository under another owner', async () => {
    deps.mintForConnecting = vi.fn(async () => ({
      token: 'ghs_x', expiresAt: new Date(), installationId: 101,
      repository: { id: 1, name: 'x', fullName: 'other/x', ownerId: 8, ownerLogin: 'other' },
    }))
    await expect(connectRepo(SITE, { ...asked, repoUrl: 'https://github.com/other/x' }, deps)).rejects.toThrow(/not a repository of the GitHub account chosen/)
    expect(deps.connectOnSite).not.toHaveBeenCalled()
  })

  it('is not connected twice to one location', async () => {
    deps.getAttachment = vi.fn(async () => ({ id: 'there' })) as unknown as ConnectDeps['getAttachment']
    await expect(connectRepo(SITE, asked, deps)).rejects.toThrow(/already has a connected repository/)
    expect(deps.check).not.toHaveBeenCalled()
  })

  it('stops at the checks when the address is not GitHub\'s', async () => {
    deps.check = vi.fn(async () => ({ ok: false, account: null, problem: { kind: 'bad_name' as const, words: 'Invalid GitHub repo URL: x. Nothing was changed.' }, useExisting: null }))
    await expect(connectRepo(SITE, { ...asked, repoUrl: 'x' }, deps)).rejects.toThrow(/Invalid GitHub repo URL/)
    expect(deps.repoState).not.toHaveBeenCalled()
    expect(deps.mintForConnecting).not.toHaveBeenCalled()
  })
})
