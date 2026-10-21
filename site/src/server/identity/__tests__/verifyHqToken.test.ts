/**
 * SC-348's missing link (spec review): mcp/handler.test.ts and
 * git/gitCredentialApi.test.ts both prove the fail-closed BEHAVIOUR — a
 * capability that fails verification 401s — but they mock `verifyHqToken`
 * itself, so neither proves audience pinning is what's actually happening
 * underneath. tokenVerify.test.ts proves `verifyWithKeySet` correctly
 * ENFORCES a given audience; this test is the missing middle link: that
 * `verifyHqToken` actually PASSES `SiteConfig.siteId` as that audience,
 * closing the chain from "a foreign-audience capability is refused" all the
 * way down to the real mechanism.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockHqConnectionFindFirst = vi.hoisted(() => vi.fn())
const mockSiteConfigFindFirst = vi.hoisted(() => vi.fn())
vi.mock('#db', () => ({
  prisma: {
    hqConnection: { findFirst: mockHqConnectionFindFirst },
    siteConfig: { findFirst: mockSiteConfigFindFirst },
  },
}))

const SENTINEL_KEY_SET = { __sentinel: 'remote-jwks' }
const mockCreateRemoteJWKSet = vi.hoisted(() => vi.fn())
vi.mock('jose', () => ({ createRemoteJWKSet: mockCreateRemoteJWKSet }))

const mockVerifyWithKeySet = vi.hoisted(() => vi.fn())
vi.mock('../tokenVerify', () => ({ verifyWithKeySet: mockVerifyWithKeySet }))

import { verifyHqToken } from '../verifyHqToken'

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateRemoteJWKSet.mockReturnValue(SENTINEL_KEY_SET)
  mockHqConnectionFindFirst.mockResolvedValue({ hqUrl: 'https://hq.example.com' })
})

describe('verifyHqToken passes SiteConfig.siteId as the audience @SC-348', () => {
  it('forwards this installation\'s own siteId to verifyWithKeySet as expectedAudience', async () => {
    mockSiteConfigFindFirst.mockResolvedValue({ siteId: 'this-site-uuid' })
    mockVerifyWithKeySet.mockResolvedValue({ sub: 'u1', tokenType: 'capability' })

    await verifyHqToken('a-jwt', 'capability')

    expect(mockVerifyWithKeySet).toHaveBeenCalledWith('a-jwt', SENTINEL_KEY_SET, 'capability', 'this-site-uuid')
  })

  it('a different installation forwards ITS OWN siteId — never a hardcoded or cached value', async () => {
    mockSiteConfigFindFirst.mockResolvedValue({ siteId: 'sibling-site-uuid' })
    mockVerifyWithKeySet.mockResolvedValue({ sub: 'u1', tokenType: 'capability' })

    await verifyHqToken('a-jwt', 'capability')

    expect(mockVerifyWithKeySet).toHaveBeenCalledWith('a-jwt', SENTINEL_KEY_SET, 'capability', 'sibling-site-uuid')
  })

  it('refuses to verify at all when SiteConfig is missing — never falls back to no audience', async () => {
    mockSiteConfigFindFirst.mockResolvedValue(null)

    await expect(verifyHqToken('a-jwt', 'capability')).rejects.toThrow(/SiteConfig/)
    expect(mockVerifyWithKeySet).not.toHaveBeenCalled()
  })
})
