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
      skillDigests: [],
    })
  })

  it('records the content of each installed and personal skill dispatched, once, so eviction keeps it while queued', () => {
    const packages = {
      agent: { kind: 'agent' as const, key: 'a1', digest: 'a'.repeat(64) },
      org: null,
      platform: { kind: 'platform' as const, key: 'platform', digest: 'b'.repeat(64) },
    }
    const ref = (d: string) => ({ kind: 'skill', key: 'v1', digest: d.repeat(64) })
    const entry = (d: string, extra: object = {}) => ({ identity: 'acme/x', version: '1.0.0', digest: d.repeat(64), ref: ref(d), ...extra })
    expect(runPackageColumns(packages, {
      installedSkills: [entry('c', { level: 'org' }), entry('d', { level: 'agent' }), entry('c', { level: 'agent' })],
      personSkills: [entry('e')],
    }).skillDigests).toEqual(['c'.repeat(64), 'd'.repeat(64), 'e'.repeat(64)])
  })

  it('records nothing for an entry with no skill ref, or a malformed one', () => {
    const packages = {
      agent: { kind: 'agent' as const, key: 'a1', digest: 'a'.repeat(64) },
      org: null,
      platform: { kind: 'platform' as const, key: 'platform', digest: 'b'.repeat(64) },
    }
    expect(runPackageColumns(packages, {
      installedSkills: [
        { identity: 'acme/x', version: '1', digest: 'c'.repeat(64) },
        { ref: { kind: 'agent', key: 'a', digest: 'd'.repeat(64) } },
        { ref: { kind: 'skill', key: '../x', digest: 'e'.repeat(64) } },
        null, 'junk',
      ] as unknown[],
      personSkills: 'not a list' as unknown,
    }).skillDigests).toEqual([])
  })
})
