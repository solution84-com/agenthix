import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'

// A person changes their own password from Settings › Sign-in: the current one
// is checked, the new one meets the sign-up rules and is typed twice, and every
// other session and pairing code of theirs ends while this one stays. Against
// the real test database, with Wasp's own password hashing.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

import { hashPassword, verifyPassword } from 'wasp/auth/password'
import { changePassword, changePasswordHandler, WRONG_PASSWORD_LIMIT } from '../changePassword'
import { resetRateLimit } from '../../server/rateLimit'

const OLD = 'old-password-1'
const NEW = 'new-password-2'

async function personWithPassword(username: string, password = OLD) {
  const hashedPassword = await hashPassword(password)
  const user = await prisma.user.create({
    data: {
      auth: {
        create: {
          identities: { create: { providerName: 'username', providerUserId: username, providerData: JSON.stringify({ hashedPassword }) } },
        },
      },
    },
    include: { auth: true },
  })
  const authId = user.auth!.id
  const session = (id: string) =>
    prisma.session.create({ data: { id, expiresAt: new Date(Date.now() + 86_400_000), userId: authId } })
  return { userId: user.id, authId, session }
}

async function storedHash(username: string) {
  const identity = await prisma.authIdentity.findUniqueOrThrow({
    where: { providerName_providerUserId: { providerName: 'username', providerUserId: username } },
  })
  return (JSON.parse(identity.providerData) as { hashedPassword: string }).hashedPassword
}

const matches = async (hash: string, password: string) => verifyPassword(hash, password).then(() => true, () => false)

beforeEach(() => resetRateLimit())

describe('changing your own password', () => {
  it('stores the new password, hashed, so the old one no longer signs in', async () => {
    const me = await personWithPassword('avery')
    await me.session('this-browser')
    await changePassword({ userId: me.userId, sessionId: 'this-browser', currentPassword: OLD, newPassword: NEW, newPasswordAgain: NEW })
    const hash = await storedHash('avery')
    expect(hash).not.toContain(NEW)
    expect(await matches(hash, NEW)).toBe(true)
    expect(await matches(hash, OLD)).toBe(false)
  })

  it('signs out every other session and pairing code of theirs, keeps this one, and touches no one else', async () => {
    const me = await personWithPassword('avery')
    const other = await personWithPassword('sam')
    await me.session('this-browser')
    await me.session('my-phone')
    await me.session('old-laptop')
    await other.session('sams-browser')
    await prisma.mobileAuthToken.create({ data: { token: 'pairing-hash', userId: me.userId, expiresAt: new Date(Date.now() + 60_000) } })
    await prisma.mobileAuthToken.create({ data: { token: 'sams-pairing-hash', userId: other.userId, expiresAt: new Date(Date.now() + 60_000) } })

    const result = await changePassword({ userId: me.userId, sessionId: 'this-browser', currentPassword: OLD, newPassword: NEW, newPasswordAgain: NEW })

    expect(result).toEqual({ ok: true, signedOut: 2 })
    expect((await prisma.session.findMany({ orderBy: { id: 'asc' } })).map(s => s.id)).toEqual(['sams-browser', 'this-browser'])
    expect((await prisma.mobileAuthToken.findMany()).map(t => t.token)).toEqual(['sams-pairing-hash'])
  })

  it('refuses a wrong current password and changes nothing', async () => {
    const me = await personWithPassword('avery')
    await me.session('this-browser')
    await me.session('my-phone')
    const before = await storedHash('avery')
    await expect(
      changePassword({ userId: me.userId, sessionId: 'this-browser', currentPassword: 'not-it-123', newPassword: NEW, newPasswordAgain: NEW }),
    ).rejects.toMatchObject({ statusCode: 400, message: 'Your current password is not right' })
    expect(await storedHash('avery')).toBe(before)
    expect(await prisma.session.count()).toBe(2)
  })

  it('refuses a new password typed differently the second time', async () => {
    const me = await personWithPassword('avery')
    await expect(
      changePassword({ userId: me.userId, sessionId: 's', currentPassword: OLD, newPassword: NEW, newPasswordAgain: `${NEW}x` }),
    ).rejects.toMatchObject({ statusCode: 400, message: 'The new password and its repeat are not the same' })
    expect(await matches(await storedHash('avery'), OLD)).toBe(true)
  })

  it('refuses a new password the sign-up rules refuse', async () => {
    const me = await personWithPassword('avery')
    await expect(
      changePassword({ userId: me.userId, sessionId: 's', currentPassword: OLD, newPassword: 'short1', newPasswordAgain: 'short1' }),
    ).rejects.toMatchObject({ statusCode: 400, message: 'Password must be at least 8 characters' })
    expect(await matches(await storedHash('avery'), OLD)).toBe(true)
  })

  it('refuses when a field is missing', async () => {
    const me = await personWithPassword('avery')
    await expect(
      changePassword({ userId: me.userId, sessionId: 's', currentPassword: '', newPassword: NEW, newPasswordAgain: NEW }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it(`stops trying after ${WRONG_PASSWORD_LIMIT} wrong current passwords, even with the right one`, async () => {
    const me = await personWithPassword('avery')
    for (let i = 0; i < WRONG_PASSWORD_LIMIT; i++) {
      await expect(
        changePassword({ userId: me.userId, sessionId: 's', currentPassword: `wrong-${i}-pw`, newPassword: NEW, newPasswordAgain: NEW }),
      ).rejects.toMatchObject({ statusCode: 400 })
    }
    await expect(
      changePassword({ userId: me.userId, sessionId: 's', currentPassword: OLD, newPassword: NEW, newPasswordAgain: NEW }),
    ).rejects.toMatchObject({ statusCode: 429 })
    expect(await matches(await storedHash('avery'), OLD)).toBe(true)
  })
})

describe('the change-password endpoint', () => {
  function fakeRes() {
    const out: { status: number; body: unknown } = { status: 200, body: null }
    const res: any = {
      status: (code: number) => { out.status = code; return res },
      json: (data: unknown) => { out.body = data; return res },
    }
    return { res, out }
  }

  it('changes the password of the person signed in, keeping the session the request came with', async () => {
    const me = await personWithPassword('avery')
    await me.session('this-browser')
    await me.session('my-phone')
    const { res, out } = fakeRes()
    await changePasswordHandler(
      { sessionId: 'this-browser', body: { currentPassword: OLD, newPassword: NEW, newPasswordAgain: NEW } } as any,
      res,
      { user: { id: me.userId } } as any,
    )
    expect(out).toEqual({ status: 200, body: { ok: true, signedOut: 1 } })
    expect((await prisma.session.findMany()).map(s => s.id)).toEqual(['this-browser'])
  })

  it('answers a refusal with its status and words', async () => {
    const me = await personWithPassword('avery')
    const { res, out } = fakeRes()
    await changePasswordHandler(
      { sessionId: 's', body: { currentPassword: 'nope-nope-1', newPassword: NEW, newPasswordAgain: NEW } } as any,
      res,
      { user: { id: me.userId } } as any,
    )
    expect(out).toEqual({ status: 400, body: { error: 'Your current password is not right' } })
  })

  it('refuses a request with no signed-in session', async () => {
    const { res, out } = fakeRes()
    await changePasswordHandler({ sessionId: null, body: {} } as any, res, { user: null } as any)
    expect(out.status).toBe(401)
  })
})
