/**
 * hq's signing key and the tokens it signs, against the real test database:
 * the keypair stored encrypted and created once (@SC-269), identity and
 * capability tokens that verify only as what and for whom they were minted
 * (@SC-270, @SC-272, @SC-289), and the endpoints that publish the public key
 * and mint a person's identity token.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SignJWT, decodeJwt } from 'jose'
import { IDENTITY_TOKEN_TTL_SECONDS, CAPABILITY_TTL_SECONDS, HQ_TOKEN_ISSUER, type CapabilityClaims } from '@agenthix/core'
import { prisma } from '../../../test/db'
import { createUser, createUserWithRole } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})

import { ensureHqSigningKey, getSigningKey, getPublicJwks, SIGNING_ALG } from '../signingKeyService'
import { mintIdentityToken, signCapability, verifyHqToken } from '../tokenService'
import { jwksHandler, mintSiteTokenHandler } from '../identityApi'
import { decryptSecret } from '../../crypto/secretCrypto'

const baseCapability: Omit<CapabilityClaims, 'tokenType'> = {
  userId: 'u1', runner: { kind: 'person', userId: 'u1' }, startedBy: 'person', agentId: 'a1', sessionId: 's1', projectId: 'p1', workspaceId: 'w1',
  taskId: null, role: null, siteId: 'site1',
  permissions: { bypassed: false, allowedTools: [{ name: 'read_file', state: 'always' }], allowedBashPatterns: [], neverTools: ['delete_product'] },
}
const storedKey = () => prisma.siteSecret.findUniqueOrThrow({ where: { type: 'HQ_SIGNING_KEY' } })

function response() {
  // `any`: the handlers answer several JSON shapes, which the tests read field by field.
  const r = {
    code: 200, body: undefined as any, headers: {} as Record<string, string>,
    status(c: number) { r.code = c; return r }, json(b: unknown) { r.body = b; return r }, set(k: string, v: string) { r.headers[k] = v; return r },
  }
  return r
}
// The Wasp API types want Express's request, response and context; these pass the fields the handlers read.
type Handler = (req: unknown, res: unknown, ctx: unknown) => Promise<unknown>
async function mintFor(user: { id: string } | null, body: unknown = { siteId: 'site-a' }) {
  const r = response()
  await (mintSiteTokenHandler as unknown as Handler)({ body }, r, { user })
  return r
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('signingKeyService @SC-269', () => {
  it('generates and stores an encrypted RSA keypair when none exists', async () => {
    expect(await ensureHqSigningKey()).toBe(true)
    const stored = JSON.parse((await storedKey()).value)
    expect(stored.kid).toBeTruthy()
    expect(stored.publicJwk.kty).toBe('RSA')
    expect(stored.privatePkcs8Enc).not.toContain('BEGIN PRIVATE KEY')
    expect(decryptSecret(stored.privatePkcs8Enc)).toContain('BEGIN PRIVATE KEY')
  })

  it('leaves an existing key alone', async () => {
    await ensureHqSigningKey()
    const before = await storedKey()
    expect(await ensureHqSigningKey()).toBe(false)
    expect(await storedKey()).toEqual(before)
  })

  it('two boots at once create one key, and neither replaces it', async () => {
    const results = await Promise.all([ensureHqSigningKey(), ensureHqSigningKey()])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await prisma.siteSecret.count({ where: { type: 'HQ_SIGNING_KEY' } })).toBe(1)
  })

  it('round-trips: getSigningKey decrypts and imports; the public key set serves kid, alg and use, and no private material', async () => {
    await ensureHqSigningKey()
    const { kid, key } = await getSigningKey()
    expect(key).toBeTruthy()
    const jwk = (await getPublicJwks()).keys[0] as Record<string, unknown>
    expect(jwk).toMatchObject({ kid, alg: 'RS256', use: 'sig', kty: 'RSA' })
    for (const privateField of ['d', 'p', 'q', 'dp', 'dq', 'qi']) expect(jwk).not.toHaveProperty(privateField)
  })

  it('says how to provision a key when none is stored', async () => {
    await expect(getSigningKey()).rejects.toThrow(/SECRETS_MASTER_KEY/)
  })
})

describe('tokens', () => {
  beforeEach(async () => {
    await ensureHqSigningKey()
  })

  describe('identity token mint + verify @SC-270', () => {
    it('mints a token that verifies with the right claims and TTL', async () => {
      const { token, expiresAt } = await mintIdentityToken({ userId: 'u1', role: 'ADMIN', orgId: 'o1', siteId: 'site1' })
      const payload = await verifyHqToken(token)
      expect(payload).toMatchObject({ sub: 'u1', tokenType: 'identity', role: 'ADMIN' })
      expect(payload.exp! - payload.iat!).toBe(IDENTITY_TOKEN_TTL_SECONDS)
      expect(expiresAt).toBe(payload.exp! * 1000)
    })

    it('rejects a tampered token', async () => {
      const { token } = await mintIdentityToken({ userId: 'u1', role: 'MEMBER', orgId: null, siteId: 'site1' })
      await expect(verifyHqToken(token.slice(0, -3) + 'xxx')).rejects.toThrow()
    })
  })

  describe('capability sign + verify @SC-272', () => {
    it('round-trips the full §2a claim shape with the capability TTL', async () => {
      const payload = await verifyHqToken((await signCapability(baseCapability)).token)
      expect(payload).toMatchObject({ tokenType: 'capability', workspaceId: 'w1', permissions: { neverTools: ['delete_product'] } })
      expect(payload.exp! - payload.iat!).toBe(CAPABILITY_TTL_SECONDS)
    })
  })

  describe('hq token verification rejects bad tokens @SC-270', () => {
    it('rejects a token signed with the right key but the wrong issuer', async () => {
      const { kid, key } = await getSigningKey()
      const forged = await new SignJWT({ tokenType: 'identity', role: 'ADMIN', orgId: null })
        .setProtectedHeader({ alg: SIGNING_ALG, kid }).setSubject('u1').setIssuer('someone-else').setIssuedAt().setExpirationTime('1h').sign(key)
      await expect(verifyHqToken(forged)).rejects.toThrow()
    })

    it('rejects an expired token', async () => {
      const { token } = await mintIdentityToken({ userId: 'u1', role: 'ADMIN', orgId: null, siteId: 'site1' })
      // Only the clock jose reads; jose applies no clock tolerance, so clear the expiry with margin.
      vi.useFakeTimers({ toFake: ['Date'] })
      try {
        vi.setSystemTime(Date.now() + (IDENTITY_TOKEN_TTL_SECONDS + 60) * 1000)
        await expect(verifyHqToken(token)).rejects.toThrow()
      } finally {
        vi.useRealTimers()
      }
    })

    it('rejects an algorithm-confusion attempt (the RS256 public key reused as an HS256 secret)', async () => {
      const secret = Buffer.from((await getPublicJwks()).keys[0].n as string, 'base64url')
      const forged = await new SignJWT({ tokenType: 'identity', role: 'ADMIN', orgId: null })
        .setProtectedHeader({ alg: 'HS256' }).setSubject('u1').setIssuer(HQ_TOKEN_ISSUER).setIssuedAt().setExpirationTime('1h').sign(secret)
      await expect(verifyHqToken(forged)).rejects.toThrow()
    })

    it('rejects cross-use between identity and capability tokens', async () => {
      const { token: identityToken } = await mintIdentityToken({ userId: 'u1', role: 'ADMIN', orgId: null, siteId: 'site1' })
      const { token: capabilityToken } = await signCapability(baseCapability)
      await expect(verifyHqToken(identityToken, 'capability')).rejects.toThrow()
      await expect(verifyHqToken(capabilityToken, 'identity')).rejects.toThrow()
      await expect(verifyHqToken(identityToken, 'identity')).resolves.toBeTruthy()
      await expect(verifyHqToken(capabilityToken, 'capability')).resolves.toBeTruthy()
    })

    it('rejects a token signed by a key hq no longer holds', async () => {
      const { token } = await signCapability(baseCapability)
      await prisma.siteSecret.deleteMany()
      await ensureHqSigningKey()
      await expect(verifyHqToken(token)).rejects.toThrow()
    })
  })

  describe('tokens name the Execution Site they were minted for @SC-289', () => {
    it('a capability verifies for its own site, and is refused presented as another', async () => {
      const { token } = await signCapability({ ...baseCapability, siteId: 'site-a' })
      expect((await verifyHqToken(token, 'capability', 'site-a')).aud).toBe('site-a')
      await expect(verifyHqToken(token, 'capability', 'site-b')).rejects.toThrow()
      await expect(verifyHqToken(token, 'capability')).resolves.toBeTruthy()
    })

    it('an identity token verifies for its own site, and is refused presented as another', async () => {
      const { token } = await mintIdentityToken({ userId: 'u1', role: 'ADMIN', orgId: 'o1', siteId: 'site-a' })
      expect((await verifyHqToken(token, 'identity', 'site-a')).aud).toBe('site-a')
      await expect(verifyHqToken(token, 'identity', 'site-b')).rejects.toThrow()
    })
  })
})

describe('the public key set endpoint', () => {
  it('serves the public key set with a cache header', async () => {
    await ensureHqSigningKey()
    const r = response()
    await (jwksHandler as unknown as Handler)({}, r, {})
    expect(r.body).toEqual(await getPublicJwks())
    expect(r.headers['Cache-Control']).toBe('public, max-age=300')
  })

  it('answers 503 with a fixed body when no key is provisioned', async () => {
    const r = response()
    await (jwksHandler as unknown as Handler)({}, r, {})
    expect(r).toMatchObject({ code: 503, body: { error: 'Signing key unavailable' } })
  })
})

describe('mintSiteTokenHandler @SC-270', () => {
  beforeEach(async () => {
    await ensureHqSigningKey()
  })

  it('returns 401 when nobody is signed in', async () => {
    expect(await mintFor(null)).toMatchObject({ code: 401, body: { error: 'Not authenticated' } })
  })

  it("mints for the person's role, the org and the site asked for", async () => {
    const admin = await createUserWithRole('ADMIN')
    const org = await prisma.org.create({ data: { name: 'Org' } })
    const r = await mintFor(admin)
    const payload = await verifyHqToken(r.body.token, 'identity', 'site-a')
    expect(payload).toMatchObject({ sub: admin.id, role: 'ADMIN', orgId: org.id })
    expect(r.body.expiresInSeconds).toBe(IDENTITY_TOKEN_TTL_SECONDS)
  })

  it('returns 503 with the fixed error, not the raw message, when the signing key is unprovisioned', async () => {
    await prisma.siteSecret.deleteMany()
    expect(await mintFor(await createUser())).toMatchObject({ code: 503, body: { error: 'Signing key unavailable' } })
  })

  it('defaults the role to MEMBER, the least organisation role, when the person has no settings row (@SC-313)', async () => {
    const r = await mintFor(await createUser())
    expect(decodeJwt(r.body.token).role).toBe('MEMBER')
  })

  it('sets orgId to null when no organisation exists', async () => {
    const r = await mintFor(await createUserWithRole('ADMIN'))
    expect(decodeJwt(r.body.token).orgId).toBeNull()
  })

  it("is audienced to hq's own installation id when the request names no site — which no site accepts", async () => {
    const r = await mintFor(await createUserWithRole('ADMIN'), {})
    const config = await prisma.siteConfig.findUniqueOrThrow({ where: { id: 'singleton' } })
    expect(decodeJwt(r.body.token).aud).toBe(config.siteId)
  })

  it('returns 400 when neither the request nor the installation names a site', async () => {
    await prisma.siteConfig.create({ data: { id: 'singleton', siteId: '' } })
    expect(await mintFor(await createUserWithRole('ADMIN'), {})).toMatchObject({ code: 400, body: { error: 'No site to mint for' } })
  })
})
