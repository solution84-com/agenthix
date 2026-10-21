import { describe, it, expect, vi, beforeEach } from 'vitest'

const findMany = vi.hoisted(() => vi.fn())
vi.mock('#db', () => ({ prisma: { agentRun: { findMany } } }))

import { protectedPackageDigests } from '../protectedPackages'

beforeEach(() => { vi.resetAllMocks() })

describe('protectedPackageDigests', () => {
  it('protects every digest a pending or running run records, skipping the nulls of runs from before packages', async () => {
    findMany.mockResolvedValue([
      { agentPackageDigest: 'a'.repeat(64), orgPackageDigest: null, platformPackageDigest: 'b'.repeat(64) },
      { agentPackageDigest: null, orgPackageDigest: null, platformPackageDigest: null },
    ])
    expect(await protectedPackageDigests()).toEqual(new Set(['a'.repeat(64), 'b'.repeat(64)]))
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: { in: ['PENDING', 'RUNNING'] } } }))
  })
})
