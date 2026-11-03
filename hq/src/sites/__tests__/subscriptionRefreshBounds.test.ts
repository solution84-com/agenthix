/**
 * A refreshed subscription token replaces a stored login only when it comes
 * from a run of the login's own holder, and only when its expiry is one an
 * access token can have. The race and freshness rules are tested against the
 * database (`subscriptionGrants.integration.test.ts`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  grant: null as null | Record<string, unknown>,
  ownerUserId: 'ana' as string | null,
  updateMany: vi.fn(async () => ({ count: 1 })),
}))
vi.mock('wasp/server', () => ({
  prisma: {
    subscriptionGrant: { findUnique: vi.fn(async () => db.grant) },
    aiProvider: { findUnique: vi.fn(async () => ({ ownerUserId: db.ownerUserId })), updateMany: db.updateMany },
  },
}))
vi.mock('../../server/crypto/secretCrypto', () => ({ encryptSecret: (s: string) => `enc:${s}` }))

import { acceptSubscriptionRefresh, isUsableRefreshedDocument, REFRESHED_EXPIRY_CEILING_MS } from '../subscriptionGrants'

const HOUR = 60 * 60 * 1000
const NOW = 1_800_000_000_000
const doc = (expiresAt: number) => JSON.stringify({ claudeAiOauth: { accessToken: 'at', refreshToken: 'rt', expiresAt } })
const report = (expiresAt: number) => ({ grantId: 'g1', oauthJson: doc(expiresAt), expiresAt })

beforeEach(() => {
  db.updateMany.mockClear()
  db.ownerUserId = 'ana'
  db.grant = {
    siteId: 'site-1', providerId: 'p1', signedInAt: new Date(NOW - HOUR), expiresAt: new Date(NOW + 24 * HOUR),
    runnerKind: 'person', runnerId: 'ana',
  }
})

describe('the ceiling on a refreshed expiry', () => {
  it('takes an expiry an access token can have', () => {
    expect(isUsableRefreshedDocument(doc(NOW + 8 * HOUR), NOW + 8 * HOUR, NOW)).toBe(true)
    expect(isUsableRefreshedDocument(doc(NOW + REFRESHED_EXPIRY_CEILING_MS), NOW + REFRESHED_EXPIRY_CEILING_MS, NOW)).toBe(true)
  })

  it('refuses one further off, so it cannot outrank every real refresh after it', async () => {
    const far = NOW + REFRESHED_EXPIRY_CEILING_MS + 1
    expect(isUsableRefreshedDocument(doc(far), far, NOW)).toBe(false)
    expect(await acceptSubscriptionRefresh('site-1', report(far), NOW)).toBe('not-a-usable-document')
    expect(db.updateMany).not.toHaveBeenCalled()
  })
})

describe("only the login's holder replaces it", () => {
  it("stores a refresh from the holder's own run, on the condition the login is still theirs", async () => {
    expect(await acceptSubscriptionRefresh('site-1', report(NOW + 8 * HOUR), NOW)).toBe('accepted')
    expect(db.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ownerUserId: 'ana' }) }))
  })

  it("refuses a refresh against a grant made to another person's run", async () => {
    db.grant = { ...db.grant, runnerId: 'ben' }
    expect(await acceptSubscriptionRefresh('site-1', report(NOW + 8 * HOUR), NOW)).toBe('not-the-holder')
    expect(db.updateMany).not.toHaveBeenCalled()
  })

  it("refuses a refresh against a grant made to a project's own run", async () => {
    db.grant = { ...db.grant, runnerKind: 'project', runnerId: 'p9' }
    expect(await acceptSubscriptionRefresh('site-1', report(NOW + 8 * HOUR), NOW)).toBe('not-the-holder')
    expect(db.updateMany).not.toHaveBeenCalled()
  })
})
