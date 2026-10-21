// Creating and deleting a workspace across two databases (@SC-238, @SC-254,
// @SC-314, @SC-320, @SC-321): the row on its site, the placement index in hq's
// own. Against the real test database for the placement; the site's row and
// directory are the stand-ins, and what the site was asked is the behaviour.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { ensureExecutionSite } from '../../test/factories'

const site = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  deleteWorkspaceAt: vi.fn(),
  deleteWorkspace: vi.fn(),
  ensureDirOnSite: vi.fn(),
  calls: [] as string[],
}))

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma }
})
vi.mock('../workspaceStore', async () => {
  const actual = await vi.importActual<typeof import('../workspaceStore')>('../workspaceStore')
  return {
    ...actual,
    createWorkspace: site.createWorkspace,
    deleteWorkspaceAt: site.deleteWorkspaceAt,
    deleteWorkspace: site.deleteWorkspace,
    removePlacement: async (id: string) => { site.calls.push('removePlacement'); await actual.removePlacement(id) },
  }
})
vi.mock('../locationFileStore', () => ({ ensureDirOnSite: site.ensureDirOnSite }))

import { createWorkspace, deleteWorkspace } from '../workspaceService'

const ws = { id: 'ws1', ownerType: 'project', ownerId: 'p1', name: 'web', siteId: 'site-logical' }
const params = (executionSiteId: string) =>
  ({ name: '  web  ', ownerType: 'project' as const, ownerId: 'p1', executionSiteId, logicalSiteId: 'site-logical' })

beforeEach(() => {
  site.calls.length = 0
  site.createWorkspace.mockReset().mockResolvedValue(ws)
  site.deleteWorkspaceAt.mockReset().mockResolvedValue(undefined)
  site.deleteWorkspace.mockReset().mockImplementation(async () => { site.calls.push('deleteWorkspace') })
  site.ensureDirOnSite.mockReset().mockResolvedValue({ created: true })
})

describe('createWorkspace', () => {
  it('creates the row on the site (by logical id), indexes it at the site (by ExecutionSite.id), then asks the site for its directory', async () => {
    const s = await ensureExecutionSite()

    expect(await createWorkspace(params(s.id))).toEqual(ws)

    expect(site.createWorkspace).toHaveBeenCalledWith('site-logical', { name: 'web', ownerType: 'project', ownerId: 'p1' })
    expect(await prisma.workspacePlacement.findUnique({ where: { workspaceId: 'ws1' } })).toMatchObject({ siteId: s.id })
    // A site creates a workspace's directory only when a container starts in
    // it, so without this ask every read of a new workspace fails until
    // something first runs there.
    expect(site.ensureDirOnSite).toHaveBeenCalledWith({ ownerType: 'project', ownerId: 'p1', workspaceId: 'ws1' })
  })

  it('compensates a failed placement insert by deleting the just-created site-side row, then rethrows', async () => {
    const s = await ensureExecutionSite()
    // The placement already exists, so indexing the new row fails on the unique key.
    await prisma.workspacePlacement.create({ data: { workspaceId: 'ws1', siteId: s.id } })

    await expect(createWorkspace(params(s.id))).rejects.toThrow()

    expect(site.deleteWorkspaceAt).toHaveBeenCalledWith('site-logical', 'ws1')
    expect(site.ensureDirOnSite).not.toHaveBeenCalled()
  })

  it('never lets a failed compensating delete mask the placement error', async () => {
    const s = await ensureExecutionSite()
    await prisma.workspacePlacement.create({ data: { workspaceId: 'ws1', siteId: s.id } })
    site.deleteWorkspaceAt.mockRejectedValue(new Error('compensation also failed'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const err = await createWorkspace(params(s.id)).catch((e: Error) => e)

    expect((err as Error).message).not.toMatch(/compensation also failed/)
  })
})

describe('deleteWorkspace', () => {
  it('deletes the site-side row first, then the placement row', async () => {
    const s = await ensureExecutionSite()
    await prisma.workspacePlacement.create({ data: { workspaceId: 'ws1', siteId: s.id } })

    await deleteWorkspace('ws1')

    expect(site.deleteWorkspace).toHaveBeenCalledWith('ws1')
    expect(site.calls).toEqual(['deleteWorkspace', 'removePlacement'])
    expect(await prisma.workspacePlacement.count()).toBe(0)
  })

  it('keeps the placement when the site-side delete fails, so a retry can find the site', async () => {
    const s = await ensureExecutionSite()
    await prisma.workspacePlacement.create({ data: { workspaceId: 'ws1', siteId: s.id } })
    site.deleteWorkspace.mockRejectedValue(new Error('site down'))

    await expect(deleteWorkspace('ws1')).rejects.toThrow('site down')

    expect(await prisma.workspacePlacement.count()).toBe(1)
  })
})
