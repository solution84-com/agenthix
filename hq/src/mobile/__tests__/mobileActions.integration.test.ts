import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { prisma } from '../../test/db'
import { createUser } from '../../test/factories'

// SC-094 exchange a pairing code for a long-lived device session ·
// SC-208 rejection reasons: 404 invalid, 400 already used, 400 expired.
// Against the real test database.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

import { exchangeMobileAuthToken, generateMobileAuthToken } from '../actions'

const ctx = (user?: { id: string }) => ({ user, entities: { MobileAuthToken: prisma.mobileAuthToken } }) as any
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

async function userWithAuth() {
  const user = await createUser()
  const auth = await prisma.auth.create({ data: { userId: user.id } })
  return { user, auth }
}

describe('generateMobileAuthToken @SC-094', () => {
  it("issues a token for the caller, stores only its SHA-256, and clears the caller's expired tokens", async () => {
    const { user } = await userWithAuth()
    const other = await createUser()
    const stale = await prisma.mobileAuthToken.create({ data: { userId: user.id, expiresAt: new Date(Date.now() - 1000) } })
    const othersStale = await prisma.mobileAuthToken.create({ data: { userId: other.id, expiresAt: new Date(Date.now() - 1000) } })

    const { token } = await generateMobileAuthToken(undefined as any, ctx(user))

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const rows = await prisma.mobileAuthToken.findMany({ where: { userId: user.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].token).toBe(sha256(token))
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now())
    expect(await prisma.mobileAuthToken.findUnique({ where: { id: stale.id } })).toBeNull()
    expect(await prisma.mobileAuthToken.findUnique({ where: { id: othersStale.id } })).not.toBeNull()
  })

  it('refuses a caller who is not signed in (401)', async () => {
    await expect(generateMobileAuthToken(undefined as any, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('exchangeMobileAuthToken @SC-094', () => {
  it('spends a valid token and creates a 30-day device session for its person', async () => {
    const { user, auth } = await userWithAuth()
    const { token } = await generateMobileAuthToken(undefined as any, ctx(user))

    const { sessionId } = await exchangeMobileAuthToken({ token }, ctx())

    expect(sessionId).toMatch(/^[0-9a-f]{64}$/)
    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } })
    expect(session.userId).toBe(auth.id)
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000)
    expect((await prisma.mobileAuthToken.findUniqueOrThrow({ where: { token: sha256(token) } })).usedAt).not.toBeNull()
  })
})

describe('exchangeMobileAuthToken rejection reasons @SC-208', () => {
  it('404 when the token does not exist', async () => {
    await expect(exchangeMobileAuthToken({ token: 'nope' }, ctx())).rejects.toMatchObject({ statusCode: 404 })
  })

  it('400 when the token was already used, and no second session is made', async () => {
    const { user } = await userWithAuth()
    const { token } = await generateMobileAuthToken(undefined as any, ctx(user))
    await exchangeMobileAuthToken({ token }, ctx())

    await expect(exchangeMobileAuthToken({ token }, ctx())).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.session.count()).toBe(1)
  })

  it('400 when the token has expired, and no session is made', async () => {
    const { user } = await userWithAuth()
    await prisma.mobileAuthToken.create({
      data: { userId: user.id, token: sha256('old'), expiresAt: new Date(Date.now() - 1000) },
    })

    await expect(exchangeMobileAuthToken({ token: 'old' }, ctx())).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.session.count()).toBe(0)
  })

  it('400 when no token is given', async () => {
    await expect(exchangeMobileAuthToken({} as any, ctx())).rejects.toMatchObject({ statusCode: 400 })
  })
})
