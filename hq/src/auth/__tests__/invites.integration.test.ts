import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole } from '../../test/factories'

// SC-101 create and revoke an invite · SC-214 a consumed or revoked invite cannot
// be revoked · SC-215 only an admin lists invites, and never sees a token.
// Against the real test database.

import { createInvite, revokeInvite } from '../actions'
import { listInvites } from '../queries'
import { hashInviteToken } from '../inviteToken'

const ctx = (user?: { id: string }) => ({ user, entities: { Invite: prisma.invite, UserSettings: prisma.userSettings } }) as any

function invite(createdBy: string, data: Record<string, unknown> = {}) {
  return prisma.invite.create({
    data: { tokenHash: hashInviteToken(`t-${Math.random()}`), createdBy, ...data } as any,
  })
}

describe('createInvite @SC-101', () => {
  it('stores an invite with a 7-day expiry and only the hash of the token it returns once', async () => {
    const admin = await createUserWithRole('ADMIN')

    const result = await createInvite({ role: 'MEMBER', note: 'For Bob' }, ctx(admin))

    expect(result.token.length).toBeGreaterThanOrEqual(43)
    const row = await prisma.invite.findUniqueOrThrow({ where: { id: result.id } })
    expect(row).toMatchObject({ role: 'MEMBER', note: 'For Bob', createdBy: admin.id, tokenHash: hashInviteToken(result.token) })
    expect(JSON.stringify(row)).not.toContain(result.token)
    const days = (row.expiresAt!.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(6.99)
    expect(days).toBeLessThanOrEqual(7)
  })

  it('makes a different token for every invite', async () => {
    const admin = await createUserWithRole('ADMIN')
    const a = await createInvite({ role: 'MEMBER' }, ctx(admin))
    const b = await createInvite({ role: 'MEMBER' }, ctx(admin))
    expect(a.token).not.toBe(b.token)
  })

  it('refuses a caller who is not signed in (401) and a non-admin (403), storing nothing', async () => {
    const operator = await createUserWithRole('MEMBER')
    await expect(createInvite({ role: 'MEMBER' }, ctx())).rejects.toMatchObject({ statusCode: 401 })
    await expect(createInvite({ role: 'ADMIN' }, ctx(operator))).rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.invite.count()).toBe(0)
  })
})

describe('revokeInvite @SC-101 @SC-214', () => {
  it('revokes a pending invite', async () => {
    const admin = await createUserWithRole('ADMIN')
    const pending = await invite(admin.id)

    await revokeInvite({ inviteId: pending.id }, ctx(admin))

    expect((await prisma.invite.findUniqueOrThrow({ where: { id: pending.id } })).revokedAt).toBeInstanceOf(Date)
  })

  it('refuses an invite already consumed or already revoked (400), changing neither', async () => {
    const admin = await createUserWithRole('ADMIN')
    const consumed = await invite(admin.id, { consumedAt: new Date(), consumedBy: 'someone' })
    const revokedAt = new Date('2026-01-01')
    const revoked = await invite(admin.id, { revokedAt })

    await expect(revokeInvite({ inviteId: consumed.id }, ctx(admin)))
      .rejects.toMatchObject({ statusCode: 400, message: 'Cannot revoke a consumed invite' })
    await expect(revokeInvite({ inviteId: revoked.id }, ctx(admin)))
      .rejects.toMatchObject({ statusCode: 400, message: 'Invite already revoked' })

    expect((await prisma.invite.findUniqueOrThrow({ where: { id: consumed.id } })).revokedAt).toBeNull()
    expect((await prisma.invite.findUniqueOrThrow({ where: { id: revoked.id } })).revokedAt).toEqual(revokedAt)
  })

  it('answers 404 for an invite that does not exist', async () => {
    const admin = await createUserWithRole('ADMIN')
    await expect(revokeInvite({ inviteId: 'missing' }, ctx(admin))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('refuses a caller who is not signed in (401) and a non-admin (403), leaving the invite pending', async () => {
    const admin = await createUserWithRole('ADMIN')
    const operator = await createUserWithRole('MEMBER')
    const pending = await invite(admin.id)
    await expect(revokeInvite({ inviteId: pending.id }, ctx())).rejects.toMatchObject({ statusCode: 401 })
    await expect(revokeInvite({ inviteId: pending.id }, ctx(operator))).rejects.toMatchObject({ statusCode: 403 })
    expect((await prisma.invite.findUniqueOrThrow({ where: { id: pending.id } })).revokedAt).toBeNull()
  })
})

describe('listInvites @SC-215', () => {
  it('lists every invite, newest first, without its token hash', async () => {
    const admin = await createUserWithRole('ADMIN')
    const older = await invite(admin.id, { createdAt: new Date('2026-01-01'), note: 'older' })
    const newer = await invite(admin.id, { createdAt: new Date('2026-02-01'), note: 'newer' })

    const rows = await listInvites(undefined, ctx(admin))

    expect(rows.map((r) => r.id)).toEqual([newer.id, older.id])
    for (const row of rows) expect(row).not.toHaveProperty('tokenHash')
    expect(rows[0]).toMatchObject({ note: 'newer', createdBy: admin.id, revokedAt: null, consumedAt: null })
  })

  it('refuses a caller who is not signed in (401), a non-admin (403) and a person with no role', async () => {
    const operator = await createUserWithRole('MEMBER')
    const nobody = await createUser()
    await expect(listInvites(undefined, ctx())).rejects.toMatchObject({ statusCode: 401 })
    await expect(listInvites(undefined, ctx(operator))).rejects.toMatchObject({ statusCode: 403 })
    await expect(listInvites(undefined, ctx(nobody))).rejects.toMatchObject({ statusCode: 403 })
  })
})
