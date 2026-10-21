import { describe, it, expect } from 'vitest'
import { manifestNeedsApproval, buildApprovedManifest } from '../manifestParser'

// ── manifestNeedsApproval ─────────────────────────────────────────────────────

describe('manifestNeedsApproval @SC-122', () => {
  it('returns false when both arrays are empty', () => {
    expect(manifestNeedsApproval({ extendedTools: [], extendedBashPatterns: [] })).toBe(false)
  })

  it('returns true when extendedTools is non-empty', () => {
    expect(manifestNeedsApproval({
      extendedTools: [{ name: 'Agent', reason: 'needs agent' }],
      extendedBashPatterns: [],
    })).toBe(true)
  })

  it('returns true when extendedBashPatterns is non-empty', () => {
    expect(manifestNeedsApproval({
      extendedTools: [],
      extendedBashPatterns: [{ pattern: 'git push', reason: 'push' }],
    })).toBe(true)
  })

  it('returns true when both arrays are non-empty', () => {
    expect(manifestNeedsApproval({
      extendedTools: [{ name: 'WebFetch', reason: 'fetch' }],
      extendedBashPatterns: [{ pattern: 'curl ', reason: 'curl' }],
    })).toBe(true)
  })
})

// ── buildApprovedManifest ─────────────────────────────────────────────────────

describe('buildApprovedManifest', () => {
  const base = { tools: ['Read', 'Bash'], bashPatterns: ['git '] }

  it('merges base tools with extended tool names', () => {
    const result = buildApprovedManifest(base, {
      extendedTools: [{ name: 'WebFetch', reason: 'r' }],
      extendedBashPatterns: [],
    })
    expect(result.tools).toEqual(['Read', 'Bash', 'WebFetch'])
  })

  it('merges base bash patterns with extended patterns', () => {
    const result = buildApprovedManifest(base, {
      extendedTools: [],
      extendedBashPatterns: [{ pattern: 'npm ', reason: 'r' }],
    })
    expect(result.bashPatterns).toEqual(['git ', 'npm '])
  })

  it('sets approvedAt as an ISO date string', () => {
    const result = buildApprovedManifest(base, { extendedTools: [], extendedBashPatterns: [] })
    expect(() => new Date(result.approvedAt)).not.toThrow()
    expect(result.approvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('returns only base values when request has empty arrays', () => {
    const result = buildApprovedManifest(base, { extendedTools: [], extendedBashPatterns: [] })
    expect(result.tools).toEqual(base.tools)
    expect(result.bashPatterns).toEqual(base.bashPatterns)
  })
})
