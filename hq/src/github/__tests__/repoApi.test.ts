import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  resolveOwnerSiteId: vi.fn(async (): Promise<string | null> => 'site-logical-1'),
  mintForLocation: vi.fn(),
  revokeGateToken: vi.fn(async () => true),
}))

vi.mock('../../storage/ownerSite', () => ({ resolveOwnerSiteId: h.resolveOwnerSiteId }))
vi.mock('../mintGate', () => ({ mintForLocation: h.mintForLocation, revokeGateToken: h.revokeGateToken }))

import { withRepoApi } from '../repoApi'

const target = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: 'w1' }

beforeEach(() => {
  vi.clearAllMocks()
  h.resolveOwnerSiteId.mockResolvedValue('site-logical-1')
  h.mintForLocation.mockResolvedValue({
    token: 'ghs_minted', expiresAt: new Date(), installationId: 5,
    repository: { id: 9, name: 'website', fullName: 'acme/website', ownerId: 3, ownerLogin: 'acme' },
  })
})

describe('withRepoApi @SC-258 @SC-320', () => {
  it('mints through the gate for the target\'s own connection, with only the permissions asked for, and ends the token', async () => {
    const r = await withRepoApi({ target, userId: 'u1', needs: 'read', permissions: { actions: 'read' } }, async (api) => api)
    expect(r).toEqual({ owner: 'acme', repo: 'website', token: 'ghs_minted' })
    expect(h.mintForLocation).toHaveBeenCalledWith({
      place: { type: 'project', id: 'p1' }, siteId: 'site-logical-1', workspaceId: 'w1', person: 'u1', needs: 'read',
      permissions: { actions: 'read' },
    })
    expect(h.revokeGateToken).toHaveBeenCalledWith('ghs_minted')
  })

  it('ends the token when the operation fails', async () => {
    await expect(withRepoApi({ target, userId: 'u1', needs: 'work', permissions: { actions: 'write' } }, async () => { throw new Error('boom') }))
      .rejects.toThrow('boom')
    expect(h.revokeGateToken).toHaveBeenCalledWith('ghs_minted')
  })

  it('refuses when the owner has no resolvable Execution Site, never minting', async () => {
    h.resolveOwnerSiteId.mockResolvedValueOnce(null)
    await expect(withRepoApi({ target, userId: 'u1', needs: 'read', permissions: { actions: 'read' } }, async (a) => a)).rejects.toThrow(/No Execution Site/)
    expect(h.mintForLocation).not.toHaveBeenCalled()
  })
})
