import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUser } from '../../test/factories'

// SC-113 — the invite endpoints count failed code attempts per address in the
// RateLimit table and answer 429 once an address has used its budget; a valid
// code or a refusal of the form counts nothing. Against the real test database.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma }
})
vi.mock('wasp/auth/password', () => ({ hashPassword: async (p: string) => `hashed:${p}` }))

import { validateInviteHandler, acceptInviteApiHandler, bootstrapStatusHandler } from '../api'
import { isInviteRateLimited, recordFailedInviteAttempt, resetRateLimiter, isCodeRefusal, RATE_LIMIT_MAX } from '../inviteService'
import { generateInviteToken, hashInviteToken } from '../inviteToken'

const IP = '9.9.9.9'

function fakeRes() {
  const out: { status: number; body: unknown } = { status: 200, body: null }
  const res: any = {
    status: (code: number) => { out.status = code; return res },
    json: (data: unknown) => { out.body = data; return res },
  }
  return { res, out }
}

async function validate(token: unknown) {
  const { res, out } = fakeRes()
  await validateInviteHandler({ ip: IP, body: { token } } as any, res, {} as any)
  return out
}

async function accept(token: string, username = 'newbie', password = 'password123', context: Record<string, unknown> = {}) {
  const { res, out } = fakeRes()
  await acceptInviteApiHandler({ ip: IP, body: { token, name: 'New Person', username, password } } as any, res, context as any)
  return out
}

async function pendingInvite(data: Record<string, unknown> = {}) {
  const inviter = await createUser()
  const token = generateInviteToken()
  await prisma.invite.create({
    data: { tokenHash: hashInviteToken(token), createdBy: inviter.id, expiresAt: new Date(Date.now() + 86_400_000), ...data } as any,
  })
  return token
}

const failures = async () => (await prisma.rateLimit.findMany()).map((r) => r.count).reduce((a, b) => a + b, 0)

async function useTheBudget() {
  for (let i = 0; i < RATE_LIMIT_MAX; i++) await recordFailedInviteAttempt(IP)
}

beforeEach(() => resetRateLimiter())

describe('the invite rate limiter @SC-113', () => {
  it('does not limit an address with no failures, and counts nothing to find out', async () => {
    expect(await isInviteRateLimited(IP)).toBe(false)
    expect(await prisma.rateLimit.count()).toBe(0)
  })

  it('limits an address once it has used RATE_LIMIT_MAX failures in the window, and no other address', async () => {
    for (let i = 0; i < RATE_LIMIT_MAX - 1; i++) await recordFailedInviteAttempt(IP)
    expect(await isInviteRateLimited(IP)).toBe(false)
    await recordFailedInviteAttempt(IP)
    expect(await isInviteRateLimited(IP)).toBe(true)
    expect(await isInviteRateLimited('1.2.3.4')).toBe(false)
  })

  it('treats an ended window as absent, and restarts it at one on the next failure', async () => {
    await useTheBudget()
    await prisma.rateLimit.updateMany({ data: { resetAt: new Date(Date.now() - 1000) } })
    expect(await isInviteRateLimited(IP)).toBe(false)

    await recordFailedInviteAttempt(IP)
    expect(await failures()).toBe(1)
  })

  it('resetRateLimiter clears every address', async () => {
    await recordFailedInviteAttempt(IP)
    await recordFailedInviteAttempt('1.2.3.4')
    await resetRateLimiter()
    expect(await prisma.rateLimit.count()).toBe(0)
  })

  it('counts only a refusal of the code itself: not found, revoked, used, expired', () => {
    expect(isCodeRefusal(404)).toBe(true)
    expect(isCodeRefusal(410)).toBe(true)
    expect(isCodeRefusal(400)).toBe(false)
    expect(isCodeRefusal(403)).toBe(false)
    expect(isCodeRefusal(500)).toBe(false)
  })
})

describe('the invite endpoints @SC-113', () => {
  it('validate answers 429 once the address is limited, even for a good code', async () => {
    const token = await pendingInvite()
    await useTheBudget()

    const out = await validate(token)

    expect(out).toEqual({ status: 429, body: { error: 'Too many failed attempts. Try again in 15 minutes.', reason: 'rate_limited' } })
  })

  it('accept answers 429 once the address is limited, and creates no account', async () => {
    const token = await pendingInvite()
    await useTheBudget()

    expect((await accept(token)).status).toBe(429)
    expect(await prisma.authIdentity.count()).toBe(0)
  })

  it('a wrong code counts one failure', async () => {
    const out = await validate('nope')
    expect(out.status).toBe(404)
    expect(await failures()).toBe(1)
  })

  it('a valid code counts nothing, so signing up through an invite never uses the budget', async () => {
    const token = await pendingInvite({ role: 'MEMBER' })

    expect((await validate(token)).body).toMatchObject({ valid: true, role: 'MEMBER' })
    expect(await accept(token)).toEqual({ status: 200, body: { success: true, landAt: '/' } })
    expect(await failures()).toBe(0)
  })

  it('a taken username is a refusal of the form, not of the code, and counts nothing', async () => {
    const token = await pendingInvite()
    await accept(await pendingInvite(), 'taken')

    const out = await accept(token, 'taken')

    expect(out.status).toBe(400)
    expect(await failures()).toBe(0)
  })

  it('a revoked, used or expired code at accept counts as a failure', async () => {
    const used = await pendingInvite({ consumedAt: new Date() })
    expect((await accept(used)).status).toBe(410)
    expect(await failures()).toBe(1)
  })

  it('refuses a missing token or a short password (400) without counting a failure', async () => {
    expect((await validate(undefined)).status).toBe(400)
    expect((await accept(await pendingInvite(), 'u', 'short'))).toMatchObject({ status: 400 })
    expect(await failures()).toBe(0)
  })
})

describe('accepting while signed in @SC-719', () => {
  it('is refused, naming who is signed in, and creates nothing and spends nothing', async () => {
    const me = await createUser({ displayName: 'Avery' })
    const token = await pendingInvite()

    const out = await accept(token, 'someone-new', 'password123', { user: { id: me.id } })

    expect(out).toMatchObject({ status: 409, body: { reason: 'signed_in', signedInAs: 'Avery' } })
    expect(await prisma.authIdentity.count()).toBe(0)
    expect((await prisma.invite.findFirstOrThrow()).consumedAt).toBeNull()
    expect(await failures()).toBe(0)
  })
})

describe('bootstrapStatusHandler @SC-709', () => {
  it('says bootstrapping is needed exactly while there are no users', async () => {
    const before = fakeRes()
    await bootstrapStatusHandler({} as any, before.res, {} as any)
    expect(before.out.body).toEqual({ bootstrapRequired: true })

    await createUser()
    const after = fakeRes()
    await bootstrapStatusHandler({} as any, after.res, {} as any)
    expect(after.out.body).toEqual({ bootstrapRequired: false })
  })
})
