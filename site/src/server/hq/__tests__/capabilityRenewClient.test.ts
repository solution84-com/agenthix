import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sealed } from './testCredential'

const mockSiteConfigFindFirst = vi.hoisted(() => vi.fn())
const mockHqFindFirst = vi.hoisted(() => vi.fn())
vi.mock('#db', () => ({
  prisma: {
    siteConfig: { findFirst: mockSiteConfigFindFirst },
    hqConnection: { findFirst: mockHqFindFirst },
  },
}))

import { renewCapabilityViaHq } from '../capabilityRenewClient'

beforeEach(() => {
  vi.clearAllMocks()
  mockSiteConfigFindFirst.mockResolvedValue({ siteId: 'site-uuid' })
  mockHqFindFirst.mockResolvedValue({ hqUrl: 'https://hq.example.com', connectionToken: sealed('smc_a_b') })
})

describe('the capability renewal request', () => {
  it('carries a deadline, so an hq that never answers cannot hold the renewal past the capability', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ capability: 'c2', expiresAt: 5 }) })
    vi.stubGlobal('fetch', fetchMock)
    await expect(renewCapabilityViaHq('c1')).resolves.toEqual({ capability: 'c2', expiresAt: 5 })
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
    expect(signal).toBeInstanceOf(AbortSignal)
  })
})
