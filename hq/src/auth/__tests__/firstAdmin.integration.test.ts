import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'

// The first admin's one-time link (getting-in spec, The first admin):
// made while hq has no users, only its hash stored, 24 hours, replaced by the
// next one, built from hq's configured address; accepted once, under the
// advisory lock, in one transaction.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma }
})
vi.mock('wasp/auth/password', () => ({ hashPassword: vi.fn(async (pw: string) => `hashed:${pw}`) }))

import { FIRST_ADMIN_TTL_MS, issueFirstAdminLink } from '../firstAdmin'
import { resetRateLimiter, validateToken } from '../inviteService'
import { acceptInviteToken } from '../inviteAccept'
import { hashInviteToken } from '../inviteToken'

const tokenOf = (link: string) => decodeURIComponent(link.split('/invite/')[1])
const accept = (token: string, username: string) => acceptInviteToken({ token, name: 'Avery Chen', username, password: 'password123' })

beforeEach(async () => {
  vi.stubEnv('WASP_WEB_CLIENT_URL', 'https://hq.example.com/')
  await resetRateLimiter()
})
afterEach(() => vi.unstubAllEnvs())

describe('issueFirstAdminLink @SC-708', () => {
  it('makes a link from hq\'s address, stores only its hash, and lasts 24 hours', async () => {
    const now = new Date('2026-10-11T10:00:00Z')
    const issued = await issueFirstAdminLink(now)

    expect(issued?.link).toMatch(/^https:\/\/hq\.example\.com\/invite\/[A-Za-z0-9_-]{43}$/)
    expect(issued?.expiresAt).toEqual(new Date(now.getTime() + FIRST_ADMIN_TTL_MS))
    const rows = await prisma.invite.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'FIRST_ADMIN', role: 'ADMIN', createdBy: null, tokenHash: hashInviteToken(tokenOf(issued!.link)) })
    expect(JSON.stringify(rows)).not.toContain(tokenOf(issued!.link))
  })

  it('withdraws the earlier link when it makes a new one', async () => {
    const first = await issueFirstAdminLink()
    const second = await issueFirstAdminLink()

    expect(await validateToken(tokenOf(first!.link))).toMatchObject({ valid: false, status: 410, reason: 'expired' })
    expect(await validateToken(tokenOf(second!.link))).toMatchObject({ valid: true, kind: 'first_admin', role: 'ADMIN' })
  })

  it('makes none once hq has a user', async () => {
    await prisma.user.create({ data: {} })
    expect(await issueFirstAdminLink()).toBeNull()
    expect(await prisma.invite.count()).toBe(0)
  })
})

describe('accepting the first-admin link @SC-709', () => {
  it('makes an admin with their name, spends the key, and lands in setup', async () => {
    const token = tokenOf((await issueFirstAdminLink())!.link)

    expect(await accept(token, 'avery')).toEqual({ success: true, landAt: '/setup' })

    const user = await prisma.user.findFirstOrThrow({ include: { settings: true } })
    expect(user).toMatchObject({ displayName: 'Avery Chen', settings: { role: 'ADMIN' } })
    expect(await prisma.invite.findFirst()).toMatchObject({ consumedBy: user.id })
    expect(await prisma.siteConfig.count()).toBe(0)
  })

  it('creates exactly one user when two requests arrive together (R-135)', async () => {
    const token = tokenOf((await issueFirstAdminLink())!.link)

    const results = await Promise.all([accept(token, 'first'), accept(token, 'second')])

    expect(results.filter(r => 'success' in r)).toHaveLength(1)
    expect(results.filter(r => 'error' in r && r.status === 410)).toHaveLength(1)
    expect(await prisma.user.count()).toBe(1)
  })

  it('says hq is already set up once it has been, naming the organisation', async () => {
    await prisma.org.create({ data: { name: 'Acme Corp' } })
    const token = tokenOf((await issueFirstAdminLink())!.link)
    await accept(token, 'avery')

    expect(await validateToken(token)).toMatchObject({ valid: false, status: 410, reason: 'already_set_up', error: "Acme Corp's HQ is already set up." })
    // A taken username behind a spent key reveals nothing about the username.
    expect(await accept(token, 'avery')).toMatchObject({ status: 410, reason: 'already_set_up' })
  })

  it('refuses a key past its 24 hours', async () => {
    const issued = await issueFirstAdminLink(new Date(Date.now() - FIRST_ADMIN_TTL_MS - 1000))
    expect(await accept(tokenOf(issued!.link), 'avery')).toMatchObject({ status: 410, reason: 'expired' })
    expect(await prisma.user.count()).toBe(0)
  })

  it('is never listed as an invitation', async () => {
    await issueFirstAdminLink()
    const { invitationViews } = await import('../invitationViews')
    const admin = await prisma.user.create({ data: {} })
    expect(await invitationViews(admin.id)).toEqual({ waiting: [], earlier: [] })
  })
})
