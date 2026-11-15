/**
 * One of main's versions' own changes, as hq asks its site for them: a commit id only, the site's refusal of a commit
 * off main's line given in words. Access is the read rule every
 * branch read has (`versionReads.integration.test.ts` reads it against the database).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BranchWorkError, type SiteMethodName } from '@agenthix/core'

vi.mock('../workspaceAccess', () => ({
  requireUser: (c: { user?: { id: string } | null }) => { if (!c.user) throw new Error('no user'); return c.user.id },
  reachWorkspace: vi.fn(async () => ({ ref: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' }, name: 'web', logicalSiteId: 'site-1', executionSiteId: 'es-1', canAct: false })),
}))
const site = vi.hoisted(() => ({ calls: [] as { method: string; params: Record<string, unknown> }[], answer: null as null | ((p: Record<string, unknown>) => unknown) }))
vi.mock('../siteCalls', () => ({
  siteCall: vi.fn(async (_s: string, method: SiteMethodName, params: Record<string, unknown>) => {
    site.calls.push({ method, params })
    return site.answer!(params)
  }),
}))

import { getMainVersionChanges } from '../versionReads'

const V2 = '2'.repeat(40)
const V1 = '1'.repeat(40)
const ctx = { user: { id: 'u1' } }
const answer = { base: V1, head: V2, overflow: false, files: [{ path: 'a.txt', status: 'modified', from: null, additions: 1, deletions: 0 }] }

beforeEach(() => {
  site.calls.length = 0
  site.answer = () => answer
})

describe("one of main's versions' own changes @SC-1726", () => {
  it('asks the site for the version by its commit and answers its changes against the version before it', async () => {
    expect(await getMainVersionChanges({ workspaceId: 'w1', version: V2 }, ctx)).toEqual(answer)
    expect(site.calls).toEqual([{ method: 'git.versionChanges', params: { workspace: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' }, version: V2 } }])
  })

  it('refuses anything but a full commit id, and asks nothing', async () => {
    for (const version of ['v2', 'main', 'HEAD~1', V2.slice(0, 12), `${V2}^`]) {
      await expect(getMainVersionChanges({ workspaceId: 'w1', version }, ctx)).rejects.toMatchObject({ statusCode: 400 })
    }
    expect(site.calls).toEqual([])
  })

  it("gives the site's refusal of a commit off main's line as not found", async () => {
    site.answer = () => { throw new BranchWorkError('not_found', 'not on main') }
    await expect(getMainVersionChanges({ workspaceId: 'w1', version: V2 }, ctx)).rejects.toMatchObject({ statusCode: 404 })
  })
})
