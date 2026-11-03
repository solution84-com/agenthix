/**
 * Refreshed subscription tokens coming back to hq against a grant,
 * against the real test database: whether a report is accepted is decided by
 * the grant hq recorded and by one conditional update, which only a real
 * database applies the way two racing reports meet it.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CapabilityRunner } from '@agenthix/core'
import type { AiProvider } from '@prisma/client'
import { prisma } from '../../test/db'
import { createUser } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma }
})

import { decryptStoredSecret, encryptSecret } from '../../server/crypto/secretCrypto'
import { runProviderDescriptor } from '../../routing/reaching'
import {
  acceptSubscriptionRefresh,
  grantSubscription,
  handleSubscriptionRefreshedEvent,
  isUsableRefreshedDocument,
  loginIdOf,
  REFRESHED_EXPIRY_CEILING_MS,
  SUBSCRIPTION_GRANT_TTL_MS,
  type UngrantedSubscription,
} from '../subscriptionGrants'

const HOUR = 60 * 60 * 1000
// Relative to the real clock: a grant made without an explicit time is stamped with it.
const T0 = Date.now()
const SIGNED_IN = new Date(T0)
let RUNNER: CapabilityRunner = { kind: 'person', userId: '' }

const doc = (expiresAt: number, refreshToken = `rt-${expiresAt}`) =>
  JSON.stringify({ claudeAiOauth: { accessToken: `at-${expiresAt}`, refreshToken, expiresAt, scopes: ['user:inference'] } })

type LoginRow = Pick<AiProvider, 'id'>

/** A person's own Claude subscription, the only login a run is handed (models from one place, part 4). */
async function storeLogin(expiresAt: number): Promise<LoginRow> {
  const person = await createUser()
  RUNNER = { kind: 'person', userId: person.id }
  return prisma.aiProvider.create({
    data: {
      name: 'Your Claude subscription', vendor: 'anthropic', credentialKind: 'subscription', ownerUserId: person.id,
      secret: encryptSecret(doc(expiresAt)), expiresAt: new Date(expiresAt), termsAcceptedAt: SIGNED_IN,
    },
    select: { id: true },
  })
}

const reread = (row: LoginRow) => prisma.aiProvider.findUniqueOrThrow({ where: { id: row.id } })
const storedDocument = async (row: LoginRow) => decryptStoredSecret((await reread(row)).secret!, 'test')
const grants = () => prisma.subscriptionGrant.findMany({ orderBy: { createdAt: 'asc' } })

async function supply(row: LoginRow, siteId = 'site-1', now = new Date(T0)) {
  const credential: UngrantedSubscription = { kind: 'subscription', provider: 'anthropic', oauthJson: (await storedDocument(row))! }
  return grantSubscription(credential, { providerId: row.id, signedInAt: SIGNED_IN }, { siteId, sessionId: 's1', runner: RUNNER }, now)
}

beforeEach(async () => {
  for (const level of ['info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => undefined)
  for (const [siteId, protocolVersion] of [['site-1', '1.0'], ['site-2', '1.0']]) {
    await prisma.executionSite.create({ data: { siteId, label: siteId, protocolVersion } })
  }
})

describe('grantSubscription — recording a hand-over @SC-1231', () => {
  it('records which login went to which site, session and runner, and names the grant on the credential', async () => {
    const row = await storeLogin(T0 + 8 * HOUR)

    const credential = await supply(row)

    expect(credential.loginId).toBe(loginIdOf({ providerId: row.id, signedInAt: SIGNED_IN }))
    expect(await grants()).toEqual([expect.objectContaining({
      id: credential.grantId, providerId: row.id, signedInAt: SIGNED_IN, siteId: 'site-1', sessionId: 's1',
      runnerKind: 'person', runnerId: (RUNNER as { userId: string }).userId, expiresAt: new Date(T0 + SUBSCRIPTION_GRANT_TTL_MS),
    })])
  })

  it('gives every sign-in its own login id, so a new sign-in is told apart from the last', () => {
    const first = loginIdOf({ providerId: 'c1', signedInAt: SIGNED_IN })
    expect(loginIdOf({ providerId: 'c1', signedInAt: SIGNED_IN })).toBe(first)
    expect(loginIdOf({ providerId: 'c1', signedInAt: new Date(T0 + 1) })).not.toBe(first)
    expect(loginIdOf({ providerId: 'c2', signedInAt: SIGNED_IN })).not.toBe(first)
  })

  it('removes grants that have expired', async () => {
    const row = await storeLogin(T0 + 8 * HOUR)
    await supply(row)

    const later = await supply(row, 'site-1', new Date(T0 + SUBSCRIPTION_GRANT_TTL_MS + 1))

    expect((await grants()).map(g => g.id)).toEqual([later.grantId])
  })
})

describe('acceptSubscriptionRefresh — only a site that ran with the login @SC-1231', () => {
  it('stores a fresher token reported by the site the login was handed to', async () => {
    const row = await storeLogin(T0 + 8 * HOUR)
    const { grantId } = await supply(row)

    const outcome = await acceptSubscriptionRefresh('site-1', { grantId: grantId!, oauthJson: doc(T0 + 16 * HOUR), expiresAt: T0 + 16 * HOUR }, T0 + 7 * HOUR)

    expect(outcome).toBe('accepted')
    expect(await storedDocument(row)).toBe(doc(T0 + 16 * HOUR))
    expect(await reread(row)).toMatchObject({ expiresAt: new Date(T0 + 16 * HOUR), termsAcceptedAt: SIGNED_IN })
  })

  it('refuses a report from a site that was never handed the login, as if the grant did not exist', async () => {
    const row = await storeLogin(T0 + 8 * HOUR)
    const { grantId } = await supply(row, 'site-1')

    const outcome = await acceptSubscriptionRefresh('site-2', { grantId: grantId!, oauthJson: doc(T0 + 16 * HOUR), expiresAt: T0 + 16 * HOUR }, T0)

    expect(outcome).toBe('unknown-grant')
    expect(await storedDocument(row)).toBe(doc(T0 + 8 * HOUR))
  })

  it('refuses a report naming a grant hq never made', async () => {
    const row = await storeLogin(T0 + 8 * HOUR)

    const outcome = await acceptSubscriptionRefresh('site-1', { grantId: 'made-up', oauthJson: doc(T0 + 16 * HOUR), expiresAt: T0 + 16 * HOUR }, T0)

    expect(outcome).toBe('unknown-grant')
    expect(await storedDocument(row)).toBe(doc(T0 + 8 * HOUR))
  })

  it('refuses a report against an expired grant', async () => {
    const row = await storeLogin(T0 + 8 * HOUR)
    const { grantId } = await supply(row)
    const late = T0 + SUBSCRIPTION_GRANT_TTL_MS

    const outcome = await acceptSubscriptionRefresh('site-1', { grantId: grantId!, oauthJson: doc(late + HOUR), expiresAt: late + HOUR }, late)

    expect(outcome).toBe('grant-expired')
  })

  it('never lets an older token overwrite a newer one, whichever report lands last', async () => {
    const row = await storeLogin(T0 + 8 * HOUR)
    const a = await supply(row)
    const b = await supply(row)

    expect(await acceptSubscriptionRefresh('site-1', { grantId: b.grantId!, oauthJson: doc(T0 + 20 * HOUR), expiresAt: T0 + 20 * HOUR }, T0)).toBe('accepted')
    expect(await acceptSubscriptionRefresh('site-1', { grantId: a.grantId!, oauthJson: doc(T0 + 16 * HOUR), expiresAt: T0 + 16 * HOUR }, T0)).toBe('not-fresher-or-signed-in-again')
    expect(await acceptSubscriptionRefresh('site-1', { grantId: a.grantId!, oauthJson: doc(T0 + 20 * HOUR), expiresAt: T0 + 20 * HOUR }, T0)).toBe('not-fresher-or-signed-in-again')

    expect(await storedDocument(row)).toBe(doc(T0 + 20 * HOUR))
  })

  it('two reports racing leave the fresher stored, whichever commits first', async () => {
    const row = await storeLogin(T0 + 8 * HOUR)
    const a = await supply(row)
    const b = await supply(row)

    const outcomes = await Promise.all([
      acceptSubscriptionRefresh('site-1', { grantId: a.grantId!, oauthJson: doc(T0 + 16 * HOUR), expiresAt: T0 + 16 * HOUR }, T0),
      acceptSubscriptionRefresh('site-1', { grantId: b.grantId!, oauthJson: doc(T0 + 20 * HOUR), expiresAt: T0 + 20 * HOUR }, T0),
    ])

    expect(outcomes[1]).toBe('accepted')
    expect(await storedDocument(row)).toBe(doc(T0 + 20 * HOUR))
  })

  it('does not put back a login someone has since signed in to again', async () => {
    const row = await storeLogin(T0 + 8 * HOUR)
    const { grantId } = await supply(row)
    await prisma.aiProvider.update({
      where: { id: row.id },
      data: { termsAcceptedAt: new Date(T0 + HOUR), secret: encryptSecret(doc(T0 + 9 * HOUR)), expiresAt: new Date(T0 + 9 * HOUR) },
    })

    const outcome = await acceptSubscriptionRefresh('site-1', { grantId: grantId!, oauthJson: doc(T0 + 16 * HOUR), expiresAt: T0 + 16 * HOUR }, T0 + 2 * HOUR)

    expect(outcome).toBe('not-fresher-or-signed-in-again')
    expect(await storedDocument(row)).toBe(doc(T0 + 9 * HOUR))
  })

  it("refuses a report against a grant made to anyone but the login's holder", async () => {
    const row = await storeLogin(T0 + 8 * HOUR)
    const other = await createUser()
    const credential: UngrantedSubscription = { kind: 'subscription', provider: 'anthropic', oauthJson: (await storedDocument(row))! }
    const { grantId } = await grantSubscription(credential, { providerId: row.id, signedInAt: SIGNED_IN }, { siteId: 'site-1', sessionId: 's1', runner: { kind: 'person', userId: other.id } }, new Date(T0))

    const outcome = await acceptSubscriptionRefresh('site-1', { grantId: grantId!, oauthJson: doc(T0 + 16 * HOUR), expiresAt: T0 + 16 * HOUR }, T0)

    expect(outcome).toBe('not-the-holder')
    expect(await storedDocument(row)).toBe(doc(T0 + 8 * HOUR))
  })

  it('refuses a document whose expiry lies further off than an access token lasts', async () => {
    const row = await storeLogin(T0 + 8 * HOUR)
    const { grantId } = await supply(row)
    const far = T0 + REFRESHED_EXPIRY_CEILING_MS + HOUR

    expect(await acceptSubscriptionRefresh('site-1', { grantId: grantId!, oauthJson: doc(far), expiresAt: far }, T0)).toBe('not-a-usable-document')
    expect(await storedDocument(row)).toBe(doc(T0 + 8 * HOUR))
  })

  it('refuses a document that is not a usable credential', async () => {
    const row = await storeLogin(T0 + 8 * HOUR)
    const { grantId } = await supply(row)
    const report = (oauthJson: string, expiresAt: number) => acceptSubscriptionRefresh('site-1', { grantId: grantId!, oauthJson, expiresAt }, T0)

    expect(await report(doc(T0 + 16 * HOUR), T0 + 17 * HOUR)).toBe('not-a-usable-document')
    expect(await report('not json', T0 + 16 * HOUR)).toBe('not-a-usable-document')
    expect(await report(JSON.stringify({ claudeAiOauth: { accessToken: 'a', expiresAt: T0 + 16 * HOUR } }), T0 + 16 * HOUR)).toBe('not-a-usable-document')
    expect(await report(doc(T0 - 1), T0 - 1)).toBe('not-a-usable-document')
    expect(await storedDocument(row)).toBe(doc(T0 + 8 * HOUR))
  })
})

describe("a person's subscription keeps working past its access token's lifetime", () => {
  it('hands each run the newest token the last run refreshed, with nobody signing in again', async () => {
    const row = await storeLogin(T0 + 8 * HOUR)
    const target = { siteId: 'site-1', sessionId: 's1', runner: RUNNER }

    // Four runs, each starting after the token the previous run was handed
    // has lapsed, each refreshing it once and reporting it back.
    for (let generation = 1; generation <= 4; generation++) {
      const handed = await runProviderDescriptor(row.id, target)
      if (handed?.kind !== 'subscription') throw new Error('expected the subscription')
      const handedExpiry = T0 + generation * 8 * HOUR
      expect(handed.oauthJson).toBe(doc(handedExpiry))

      const refreshedExpiry = handedExpiry + 8 * HOUR
      const outcome = await acceptSubscriptionRefresh(
        'site-1',
        { grantId: handed.grantId!, oauthJson: doc(refreshedExpiry), expiresAt: refreshedExpiry },
        handedExpiry + HOUR,
      )
      expect(outcome).toBe('accepted')
    }
    expect((await reread(row)).expiresAt).toEqual(new Date(T0 + 40 * HOUR))
  })
})

describe('isUsableRefreshedDocument', () => {
  it('needs an access token, a refresh token, and an expiry that agrees and has not passed', () => {
    expect(isUsableRefreshedDocument(doc(T0 + HOUR), T0 + HOUR, T0)).toBe(true)
    expect(isUsableRefreshedDocument(doc(T0 + HOUR, ''), T0 + HOUR, T0)).toBe(false)
    expect(isUsableRefreshedDocument(doc(T0 + HOUR), T0 + 2 * HOUR, T0)).toBe(false)
    expect(isUsableRefreshedDocument(doc(T0), T0, T0)).toBe(false)
  })
})

describe('handleSubscriptionRefreshedEvent — the wire entry point', () => {
  it('stores a valid report and never throws on a malformed one', async () => {
    const row = await storeLogin(Date.now() + HOUR)
    const { grantId } = await supply(row, 'site-1', new Date())
    const fresh = Date.now() + 9 * HOUR

    await expect(handleSubscriptionRefreshedEvent('site-1', { grantId: '', oauthJson: 'x', expiresAt: 1 })).resolves.toBeUndefined()
    await expect(handleSubscriptionRefreshedEvent('site-1', null)).resolves.toBeUndefined()
    await expect(handleSubscriptionRefreshedEvent('site-1', { grantId, oauthJson: doc(fresh), expiresAt: fresh })).resolves.toBeUndefined()

    expect(await storedDocument(row)).toBe(doc(fresh))
  })
})
