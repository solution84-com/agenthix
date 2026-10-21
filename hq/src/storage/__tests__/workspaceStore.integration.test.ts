// The workspace store's calls that read hq's own tables, against the real test
// database: a failed call names its site from the ExecutionSite row (@SC-322),
// and a call naming a bare workspace id finds its site through the
// WorkspacePlacement index (@SC-320). The channel to the site is the stand-in.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../sites/channel', async () => {
  const { ChannelRequestFailed } = await import('../../sites/channel/pendingRequests')
  return { siteChannelRegistry: { request }, ChannelRequestFailed }
})
vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma }
})

import { ChannelRequestFailed } from '../../sites/channel/pendingRequests'
import {
  listAllWorkspaces, getWorkspace, setWorkspaceAllowedTools, deleteWorkspace, deleteWorkspaceAt,
  recordPlacement, removePlacement, SiteUnreachableError, WorkspaceNotPlacedError, DanglingPlacementError,
} from '../workspaceStore'

beforeEach(() => { request.mockReset() })

const boxOne = (data: Record<string, unknown> = {}) =>
  prisma.executionSite.create({ data: { siteId: 'site-logical-1', label: 'Box One', status: 'ONLINE', ...data } })

async function placed(data: Record<string, unknown> = {}) {
  const site = await boxOne(data)
  await recordPlacement('w1', site.id)
  return site
}

describe('site-unreachable mapping @SC-322', () => {
  it('offline, timeout and disconnected each become a SiteUnreachableError naming the site label', async () => {
    await boxOne({ status: 'OFFLINE' })
    for (const code of ['offline', 'timeout', 'disconnected'] as const) {
      request.mockRejectedValueOnce(new ChannelRequestFailed('gone', code))
      const err = await listAllWorkspaces('site-logical-1').catch((e) => e)
      expect(err).toBeInstanceOf(SiteUnreachableError)
      expect(err).toMatchObject({
        siteLabel: 'Box One',
        logicalSiteId: 'site-logical-1',
        revoked: false,
        message: 'Execution Site "Box One" is unreachable — its runs and workspaces are unavailable until it reconnects',
      })
    }
  })

  it('a revoked site gets the revoked-specific message, not the "reconnects" one', async () => {
    await boxOne({ status: 'REVOKED' })
    request.mockRejectedValue(new ChannelRequestFailed('offline', 'offline'))
    await expect(listAllWorkspaces('site-logical-1')).rejects.toMatchObject({
      revoked: true,
      message: 'Execution Site "Box One" has been revoked — its workspaces are unavailable',
    })
  })

  it('a version-mismatched site gets the version_mismatch reason, naming its protocol version', async () => {
    await boxOne({ status: 'VERSION_MISMATCH', protocolVersion: '6.3' })
    request.mockRejectedValue(new ChannelRequestFailed('offline', 'offline'))
    await expect(listAllWorkspaces('site-logical-1')).rejects.toMatchObject({
      reason: 'version_mismatch', revoked: false, protocolVersion: '6.3', message: expect.stringContaining('6.3'),
    })
  })

  it('falls back to the logical siteId as the label when the ExecutionSite row is gone', async () => {
    request.mockRejectedValue(new ChannelRequestFailed('offline', 'offline'))
    await expect(listAllWorkspaces('site-logical-1')).rejects.toMatchObject({ siteLabel: 'site-logical-1' })
  })

  it('a database failure resolving the label still yields SiteUnreachableError, not the database error', async () => {
    request.mockRejectedValue(new ChannelRequestFailed('offline', 'offline'))
    const lookup = vi.spyOn(prisma.executionSite, 'findUnique').mockRejectedValueOnce(new Error('connection pool exhausted'))
    try {
      const err = await listAllWorkspaces('site-logical-1').catch((e) => e)
      expect(err).toBeInstanceOf(SiteUnreachableError)
      expect(err).toMatchObject({ siteLabel: 'site-logical-1' })
    } finally {
      lookup.mockRestore()
    }
  })

  it('a refusal from the site, and a non-channel error, propagate unchanged', async () => {
    const refused = new ChannelRequestFailed('Workspace not found', 'handler_failed')
    request.mockRejectedValueOnce(refused)
    await expect(listAllWorkspaces('site-logical-1')).rejects.toBe(refused)

    const boom = new Error('boom')
    request.mockRejectedValueOnce(boom)
    await expect(listAllWorkspaces('site-logical-1')).rejects.toBe(boom)
  })
})

describe('bare-id calls resolve placement @SC-320', () => {
  it("getWorkspace, setWorkspaceAllowedTools and deleteWorkspace ask the site the placement names, by its logical id", async () => {
    await placed()
    request.mockResolvedValueOnce({ id: 'w1', name: 'web' })
    expect(await getWorkspace('w1')).toEqual({ id: 'w1', name: 'web' })
    await setWorkspaceAllowedTools('w1', ['bash'])
    await deleteWorkspace('w1')

    expect(request.mock.calls.map((c) => c.slice(0, 3))).toEqual([
      ['site-logical-1', 'workspace.get', { id: 'w1' }],
      ['site-logical-1', 'workspace.setAllowedTools', { id: 'w1', allowedTools: ['bash'] }],
      ['site-logical-1', 'workspace.delete', { id: 'w1' }],
    ])
  })

  it('an unplaced id is no workspace to getWorkspace and WorkspaceNotPlacedError to the writes, and the site is never asked', async () => {
    expect(await getWorkspace('w1')).toBeNull()
    await expect(setWorkspaceAllowedTools('w1', ['bash'])).rejects.toBeInstanceOf(WorkspaceNotPlacedError)
    await expect(deleteWorkspace('w1')).rejects.toBeInstanceOf(WorkspaceNotPlacedError)
    expect(request).not.toHaveBeenCalled()
  })

  it('a placement naming a site that no longer exists is a DanglingPlacementError, and the site is never asked', async () => {
    await recordPlacement('w1', 'exec-site-gone')
    await expect(getWorkspace('w1')).rejects.toMatchObject({ workspaceId: 'w1', executionSiteId: 'exec-site-gone' })
    await expect(getWorkspace('w1')).rejects.toBeInstanceOf(DanglingPlacementError)
    await expect(setWorkspaceAllowedTools('w1', ['bash'])).rejects.toBeInstanceOf(DanglingPlacementError)
    await expect(deleteWorkspace('w1')).rejects.toBeInstanceOf(DanglingPlacementError)
    expect(request).not.toHaveBeenCalled()
  })

  it('deleteWorkspaceAt asks the given site directly, with no placement at all', async () => {
    request.mockResolvedValue({ ok: true })
    await deleteWorkspaceAt('site-logical-1', 'w1')
    expect(request).toHaveBeenCalledWith('site-logical-1', 'workspace.delete', { id: 'w1' })
  })

  it("a bare-id call that goes offline names the placement's site, and a revoked one says so", async () => {
    const site = await placed()
    request.mockRejectedValue(new ChannelRequestFailed('offline', 'offline'))
    await expect(getWorkspace('w1')).rejects.toMatchObject({ siteLabel: 'Box One', logicalSiteId: 'site-logical-1' })

    await prisma.executionSite.update({ where: { id: site.id }, data: { status: 'REVOKED' } })
    await expect(getWorkspace('w1')).rejects.toMatchObject({
      revoked: true,
      message: 'Execution Site "Box One" has been revoked — its workspaces are unavailable',
    })
  })
})

describe('placement writes @SC-320', () => {
  it('recordPlacement indexes a workspace at a site, and removePlacement removes it — twice is no error', async () => {
    const site = await boxOne()
    await recordPlacement('w1', site.id)
    expect(await prisma.workspacePlacement.findUnique({ where: { workspaceId: 'w1' } })).toMatchObject({ siteId: site.id })

    await removePlacement('w1')
    await removePlacement('w1')
    expect(await prisma.workspacePlacement.count()).toBe(0)
  })
})
