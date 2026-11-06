/**
 * Which workspace a lead's brief may name (owner decision, area 7): one of the place's own, which the person may work
 * in. Anything else is refused in the lead's words.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  class HttpError extends Error { constructor(public statusCode: number, message: string) { super(message) } }
  class SiteUnreachableError extends Error {}
  return {
    HttpError, SiteUnreachableError,
    located: null as null | { ref: { ownerType: string; ownerId: string; workspaceId: string }; name: string } | Error,
    reach: null as null | Error,
  }
})
vi.mock('wasp/server', () => ({ HttpError: h.HttpError }))
vi.mock('../../../../storage/workspaceStore', () => ({ SiteUnreachableError: h.SiteUnreachableError }))
vi.mock('../../../../branches/workspaceLocation', () => ({
  locateWorkspace: vi.fn(async () => { if (h.located instanceof Error) throw h.located; return h.located }),
}))
const reach = vi.hoisted(() => vi.fn(async () => { if (h.reach) throw h.reach; return {} }))
vi.mock('../../../../branches/workspaceAccess', () => ({ reachWorkspace: reach }))

import { workspaceForBrief } from '../briefWorkspace'

const shop = { type: 'project' as const, id: 'p1', name: 'Shop' }
const inShop = { ref: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' }, name: 'shop-app' }

beforeEach(() => { h.located = inShop; h.reach = null; reach.mockClear() })

describe("the workspace a lead's brief names", () => {
  it("is admitted when it is the place's own and the person may work in it", async () => {
    expect(await workspaceForBrief('u1', shop, 'w1')).toEqual({ workspaceId: 'w1' })
    expect(reach).toHaveBeenCalledWith('w1', 'u1', 'work')
  })

  it("is refused when it is another place's, without asking whether the person may work there", async () => {
    h.located = { ...inShop, ref: { ...inShop.ref, ownerId: 'p2' } }
    expect(await workspaceForBrief('u1', shop, 'w1')).toEqual({ refusal: expect.stringContaining('there is no workspace with the id "w1" in Shop') })
    h.located = null
    expect(await workspaceForBrief('u1', shop, 'w1')).toEqual({ refusal: expect.stringContaining('in Shop') })
    expect(reach).not.toHaveBeenCalled()
  })

  it('is refused for a person who may only read it', async () => {
    h.reach = new h.HttpError(403, 'Viewer')
    expect(await workspaceForBrief('u1', shop, 'w1')).toEqual({ refusal: 'you can only read shop-app, not change it' })
  })

  it("says so when the workspace's site can't be reached", async () => {
    h.located = new h.SiteUnreachableError('down')
    expect(await workspaceForBrief('u1', { type: 'user', id: 'u1', name: 'your space' }, 'w1'))
      .toEqual({ refusal: "the site that holds the workspaces of your space can't be reached right now" })
  })
})
