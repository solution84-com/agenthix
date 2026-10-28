import { describe, it, expect, vi, beforeEach } from 'vitest'

const findMany = vi.hoisted(() => vi.fn())
vi.mock('#db', () => ({ prisma: { agentRun: { findMany } } }))

import { protectedPackageDigests } from '../protectedPackages'

beforeEach(() => { vi.resetAllMocks() })

describe('protectedPackageDigests', () => {
  it('protects every digest a pending or running run records, skipping the nulls of runs from before packages', async () => {
    findMany.mockResolvedValue([
      { agentPackageDigest: 'a'.repeat(64), orgPackageDigest: null, platformPackageDigest: 'b'.repeat(64), skillDigests: [] },
      { agentPackageDigest: null, orgPackageDigest: null, platformPackageDigest: null, skillDigests: [] },
    ])
    expect(await protectedPackageDigests()).toEqual(new Set(['a'.repeat(64), 'b'.repeat(64)]))
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: { in: ['PENDING', 'RUNNING'] } } }))
  })

  it('protects the skill content a queued or running run was dispatched with', async () => {
    findMany.mockResolvedValue([
      { agentPackageDigest: 'a'.repeat(64), orgPackageDigest: null, platformPackageDigest: 'b'.repeat(64), skillDigests: ['c'.repeat(64), 'd'.repeat(64)] },
    ])
    expect(await protectedPackageDigests()).toEqual(new Set(['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64)]))
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ skillDigests: true }) }))
  })
})
