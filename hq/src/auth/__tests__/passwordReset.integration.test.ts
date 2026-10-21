import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUserWithRole } from '../../test/factories'

// Recovery without email (getting-in spec, Getting back in): an admin's
// one-time reset link, read and spent by the person it names, against the real
// test database.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('wasp/auth/password', () => ({ hashPassword: vi.fn(async (pw: string) => `hashed:${pw}`) }))

import { RESET_TTL_MS, completePasswordReset, createPasswordResetLink, makePasswordReset, readPasswordReset } from '../passwordReset'
import { completePasswordResetHandler, readPasswordResetHandler } from '../passwordResetApi'
import { resetRateLimiter } from '../inviteService'
import { hashInviteToken } from '../inviteToken'

const ctx = (user?: { id: string }) => ({ user }) as any
const tokenOf = (link: string) => decodeURIComponent(link.split('/reset-password/')[1])

async function person(username: string, role: 'ADMIN' | 'MEMBER' = 'MEMBER', displayName: string | null = null) {
  const user = await createUserWithRole(role, { displayName })
  const auth = await prisma.auth.create({
    data: { userId: user.id, identities: { create: { providerName: 'username', providerUserId: username, providerData: JSON.stringify({ hashedPassword: 'old' }) } } },
  })
  return { ...user, authId: auth.id }
}

function fakeRes() {
  const out: { status: number; body: unknown } = { status: 200, body: null }
  const res: any = {
    status: (code: number) => { out.status = code; return res },
    json: (data: unknown) => { out.body = data; return res },
  }
  return { res, out }
}

beforeEach(async () => {
  vi.stubEnv('WASP_WEB_CLIENT_URL', 'https://hq.example.com')
  await resetRateLimiter()
})
afterEach(() => vi.unstubAllEnvs())

describe('createPasswordResetLink @SC-716', () => {
  it('gives an admin a one-hour link from hq\'s address, storing only its hash', async () => {
    const avery = await person('avery', 'ADMIN', 'Avery')
    const dana = await person('dana')

    const made = await createPasswordResetLink({ userId: dana.id }, ctx(avery))

    expect(made.link).toMatch(/^https:\/\/hq\.example\.com\/reset-password\/[A-Za-z0-9_-]{43}$/)
    expect(made.expiresAt.getTime() - Date.now()).toBeGreaterThan(RESET_TTL_MS - 5000)
    const row = await prisma.passwordReset.findFirstOrThrow()
    expect(row).toMatchObject({ userId: dana.id, createdById: avery.id, tokenHash: hashInviteToken(tokenOf(made.link)), usedAt: null })
  })

  it('is for admins, and never for one\'s own password', async () => {
    const avery = await person('avery', 'ADMIN')
    const dana = await person('dana')
    await expect(createPasswordResetLink({ userId: avery.id }, ctx(dana))).rejects.toMatchObject({ statusCode: 403 })
    await expect(createPasswordResetLink({ userId: avery.id }, ctx(avery))).rejects.toMatchObject({ statusCode: 400 })
    await expect(createPasswordResetLink({ userId: dana.id }, ctx())).rejects.toMatchObject({ statusCode: 401 })
    expect(await prisma.passwordReset.count()).toBe(0)
  })

  it('refuses someone who has left', async () => {
    const avery = await person('avery', 'ADMIN')
    const dana = await person('dana')
    await prisma.user.update({ where: { id: dana.id }, data: { deactivatedAt: new Date() } })
    await expect(createPasswordResetLink({ userId: dana.id }, ctx(avery))).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('reading and spending a reset link @SC-716', () => {
  it('names the account and who made it', async () => {
    const avery = await person('avery', 'ADMIN', 'Avery')
    const dana = await person('dana', 'MEMBER', 'Dana Ruiz')
    const { link } = await makePasswordReset(dana.id, avery.id)

    expect(await readPasswordReset(tokenOf(link))).toMatchObject({
      person: { name: 'Dana Ruiz', handle: 'dana' },
      madeBy: { name: 'Avery' },
    })
  })

  it('carries the organisation as much as its admin chose to show before sign-in', async () => {
    await prisma.org.create({ data: { name: 'Acme Corp', handle: 'acmecorp', vision: 'Shops online.', signInShows: 'NOTHING' } })
    const dana = await person('dana')
    const { link } = await makePasswordReset(dana.id, null)

    expect(await readPasswordReset(tokenOf(link))).toMatchObject({
      org: { shows: 'nothing', name: null, handle: null, vision: null, avatarUrl: null, coverUrl: null },
    })
  })

  it('sets the password, ends every sign-in and phone pairing, and works once', async () => {
    const dana = await person('dana')
    await prisma.session.create({ data: { id: 's-browser', userId: dana.authId, expiresAt: new Date(Date.now() + 3_600_000) } })
    const { link } = await makePasswordReset(dana.id, null)
    const token = tokenOf(link)

    expect(await completePasswordReset(token, 'a-new-password')).toEqual({ username: 'dana' })

    const identity = await prisma.authIdentity.findFirstOrThrow({ where: { providerUserId: 'dana' } })
    expect(JSON.parse(identity.providerData)).toEqual({ hashedPassword: 'hashed:a-new-password' })
    expect(await prisma.session.count()).toBe(0)
    expect(await completePasswordReset(token, 'another-password')).toMatchObject({ status: 410, reason: 'used' })
  })

  it('refuses a short password without spending the link', async () => {
    const dana = await person('dana')
    const { link } = await makePasswordReset(dana.id, null)
    expect(await completePasswordReset(tokenOf(link), 'short')).toMatchObject({ status: 400, reason: 'password' })
    expect((await prisma.passwordReset.findFirstOrThrow()).usedAt).toBeNull()
  })

  it('refuses a link past its hour, and an earlier link once a newer one is made', async () => {
    const dana = await person('dana')
    const old = await makePasswordReset(dana.id, null, new Date(Date.now() - RESET_TTL_MS - 1000))
    expect(await readPasswordReset(tokenOf(old.link))).toMatchObject({ status: 410, reason: 'expired' })

    const first = await makePasswordReset(dana.id, null)
    await makePasswordReset(dana.id, null)
    expect(await completePasswordReset(tokenOf(first.link), 'a-new-password')).toMatchObject({ status: 410, reason: 'expired' })
  })

  it('says only that an unknown link does not work', async () => {
    expect(await readPasswordReset('nope')).toEqual({ status: 404, reason: 'unknown', error: "This reset link doesn't work." })
  })
})

describe('the reset endpoints @SC-716', () => {
  it('count an unknown link against the address, and refuse to set a password while signed in', async () => {
    const dana = await person('dana')
    const { link } = await makePasswordReset(dana.id, null)

    const read = fakeRes()
    await readPasswordResetHandler({ ip: '9.9.9.9', body: { token: 'nope' } } as any, read.res, {} as any)
    expect(read.out.status).toBe(404)
    expect(await prisma.rateLimit.count()).toBe(1)

    const signedIn = fakeRes()
    await completePasswordResetHandler(
      { ip: '9.9.9.9', body: { token: tokenOf(link), password: 'a-new-password' } } as any, signedIn.res, { user: { id: dana.id } } as any,
    )
    expect(signedIn.out).toMatchObject({ status: 409, body: { reason: 'signed_in' } })
    expect((await prisma.passwordReset.findFirstOrThrow()).usedAt).toBeNull()
  })
})
