import { describe, it, expect } from 'vitest'
import { runPackageColumns } from '../runPackages'

describe('runPackageColumns @SC-446', () => {
  it('records every digest, with nulls for a missing org package', () => {
    expect(runPackageColumns({
      agent: { kind: 'agent', key: 'a1', digest: 'a'.repeat(64) },
      org: null,
      platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
    })).toEqual({
      agentPackageDigest: 'a'.repeat(64),
      orgPackageDigest: null,
      platformPackageDigest: 'b'.repeat(64),
    })
  })
})
