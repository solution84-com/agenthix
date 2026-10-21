import { describe, it, expect, vi, beforeEach } from 'vitest'

// The workspace store's owner-scoped calls: what each one puts on the wire.
// Mapping a failed call, and the calls that resolve a workspace's site from its
// placement row, are workspaceStore.integration.test.ts.

const request = vi.hoisted(() => vi.fn())
vi.mock('../../sites/channel', async () => {
  const { ChannelRequestFailed } = await import('../../sites/channel/pendingRequests')
  return { siteChannelRegistry: { request }, ChannelRequestFailed }
})

import {
  listWorkspacesByOwner,
  listWorkspacesByIds,
  listAllWorkspaces,
  listAllRepos,
  createWorkspace,
  getRepoForTarget,
  findRepoByUrl,
  createRepo,
  deleteRepo,
  WorkspacePlacementMismatchError,
} from '../workspaceStore'

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Owner-scoped calls: pinned request args ────────────────────────────────

describe('owner-scoped calls @SC-320', () => {
  it('listWorkspacesByOwner calls workspace.listByOwner with the logical siteId and exact params', async () => {
    request.mockResolvedValue([{ id: 'w1' }])
    await listWorkspacesByOwner('site-logical-1', 'project', 'p1', 'caps')
    expect(request).toHaveBeenCalledWith('site-logical-1', 'workspace.listByOwner', {
      ownerType: 'project',
      ownerId: 'p1',
      select: 'caps',
    })
  })

  it('listWorkspacesByOwner with no select passes select: undefined', async () => {
    request.mockResolvedValue([])
    await listWorkspacesByOwner('site-logical-1', 'project', 'p1')
    expect(request).toHaveBeenCalledWith('site-logical-1', 'workspace.listByOwner', {
      ownerType: 'project',
      ownerId: 'p1',
      select: undefined,
    })
  })

  it('listWorkspacesByIds always sends select: caps', async () => {
    request.mockResolvedValue([{ id: 'w1', allowedTools: null }, { id: 'w2', allowedTools: null }])
    await listWorkspacesByIds('site-logical-1', ['w1', 'w2'])
    expect(request).toHaveBeenCalledWith('site-logical-1', 'workspace.listByIds', { ids: ['w1', 'w2'], select: 'caps' })
  })

  it('listWorkspacesByIds returns the rows when every id comes back', async () => {
    const rows = [{ id: 'w1', allowedTools: null }, { id: 'w2', allowedTools: ['bash'] }]
    request.mockResolvedValue(rows)
    await expect(listWorkspacesByIds('site-logical-1', ['w1', 'w2'])).resolves.toEqual(rows)
  })

  it('listWorkspacesByIds fails closed on a partial answer, naming the missing id', async () => {
    request.mockResolvedValue([{ id: 'w1', allowedTools: null }])

    await expect(listWorkspacesByIds('site-logical-1', ['w1', 'w2'])).rejects.toBeInstanceOf(WorkspacePlacementMismatchError)
    await expect(listWorkspacesByIds('site-logical-1', ['w1', 'w2'])).rejects.toMatchObject({
      missingIds: ['w2'],
      logicalSiteId: 'site-logical-1',
      message: expect.stringContaining('w2'),
    })
    expect(request).toHaveBeenCalledWith('site-logical-1', 'workspace.listByIds', { ids: ['w1', 'w2'], select: 'caps' })
  })

  it('listAllWorkspaces calls workspace.list with empty params', async () => {
    request.mockResolvedValue([])
    await listAllWorkspaces('site-logical-1')
    expect(request).toHaveBeenCalledWith('site-logical-1', 'workspace.list', {})
  })

  it('listAllRepos calls repo.list with empty params', async () => {
    request.mockResolvedValue([])
    await listAllRepos('site-logical-1')
    expect(request).toHaveBeenCalledWith('site-logical-1', 'repo.list', {})
  })

  it('createWorkspace calls workspace.create with the exact params', async () => {
    request.mockResolvedValue({ id: 'w1' })
    await createWorkspace('site-logical-1', { name: 'web', ownerType: 'project', ownerId: 'p1' })
    expect(request).toHaveBeenCalledWith('site-logical-1', 'workspace.create', {
      name: 'web',
      ownerType: 'project',
      ownerId: 'p1',
    })
  })

  it('getRepoForTarget calls repo.getForTarget with the target (workspace target)', async () => {
    request.mockResolvedValue(null)
    await getRepoForTarget('site-logical-1', { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' })
    expect(request).toHaveBeenCalledWith('site-logical-1', 'repo.getForTarget', {
      ownerType: 'project',
      ownerId: 'p1',
      workspaceId: 'w1',
    })
  })

  it("getRepoForTarget: owner's-files target (no workspaceId) sends only ownerType/ownerId on the wire", async () => {
    request.mockResolvedValue(null)
    await getRepoForTarget('site-logical-1', { ownerType: 'user', ownerId: 'u1' })

    const params = request.mock.calls[0][2] as Record<string, unknown>
    expect(params).toEqual({ ownerType: 'user', ownerId: 'u1' })
    // Not merely `undefined` — the key must be absent, matching what
    // JSON.stringify does to an `undefined` property when the message actually
    // crosses the socket.
    expect(Object.prototype.hasOwnProperty.call(params, 'workspaceId')).toBe(false)
  })

  it('findRepoByUrl calls repo.findByUrl with repoUrl', async () => {
    request.mockResolvedValue(null)
    await findRepoByUrl('site-logical-1', 'https://github.com/x/y')
    expect(request).toHaveBeenCalledWith('site-logical-1', 'repo.findByUrl', { repoUrl: 'https://github.com/x/y' })
  })

  it('createRepo calls repo.create with the exact params', async () => {
    request.mockResolvedValue({ id: 'r1' })
    await createRepo('site-logical-1', {
      ownerType: 'project',
      ownerId: 'p1',
      workspaceId: 'w1',
      repoUrl: 'https://github.com/x/y',
    })
    expect(request).toHaveBeenCalledWith('site-logical-1', 'repo.create', {
      ownerType: 'project',
      ownerId: 'p1',
      workspaceId: 'w1',
      repoUrl: 'https://github.com/x/y',
    })
  })

  it('deleteRepo calls repo.delete with the id', async () => {
    request.mockResolvedValue({ ok: true })
    await deleteRepo('site-logical-1', 'r1')
    expect(request).toHaveBeenCalledWith('site-logical-1', 'repo.delete', { id: 'r1' })
  })
})
