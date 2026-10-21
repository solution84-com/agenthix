/**
 * The Fleet Console's sign-in through hq (`signIn.check`, host-management spec §7) and the record of what fleet admins
 * did (§7, §4), against the real test database.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('wasp/auth/password', () => ({
  verifyPassword: vi.fn(async (hashed: string, password: string) => {
    if (hashed !== `hashed:${password}`) throw new Error('Invalid password')
  }),
}))

import { checkSignIn, CONSOLE_SIGN_IN_KEY } from '../signInCheck'
import { SIGN_IN_LIMIT } from '../../auth/signInLimit'
import { FLEET_ACTIVITY_NOTIFICATION, getFleetActivity, recordConsoleActivity } from '../activity'

async function account(username: string, data: Record<string, unknown> = {}) {
  const user = await createUserWithRole('MEMBER', { displayName: 'Sam Lee', ...data })
  await prisma.auth.create({
    data: {
      userId: user.id,
      identities: { create: { providerName: 'username', providerUserId: username, providerData: JSON.stringify({ hashedPassword: 'hashed:right-password' }) } },
    },
  })
  return user
}

describe('signIn.check @SC-921', () => {
  it('says who signs in and whether they hold the fleet admin role, and keeps nothing', async () => {
    const sam = await account('sam', { fleetAdmin: true })
    const robin = await account('robin')
    const sessions = await prisma.session.count()
    expect(await checkSignIn('Sam', 'right-password')).toEqual({ ok: true, user: { id: sam.id, name: 'Sam Lee', fleetAdmin: true } })
    expect(await checkSignIn('robin', 'right-password')).toEqual({ ok: true, user: { id: robin.id, name: 'Sam Lee', fleetAdmin: false } })
    expect(await prisma.session.count()).toBe(sessions)
  })

  it('refuses a wrong password, an unknown name, and someone who has left', async () => {
    await account('sam', { fleetAdmin: true })
    await account('gone', { fleetAdmin: true, deactivatedAt: new Date() })
    expect(await checkSignIn('sam', 'wrong')).toEqual({ ok: false })
    expect(await checkSignIn('nobody', 'right-password')).toEqual({ ok: false })
    expect(await checkSignIn('gone', 'right-password')).toEqual({ ok: false })
  })

  it('is held to hq’s sign-in limit, even for guesses sent at once', async () => {
    await account('sam', { fleetAdmin: true })
    const burst = await Promise.allSettled(Array.from({ length: SIGN_IN_LIMIT + 5 }, () => checkSignIn('sam', 'wrong')))
    const refused = burst.filter(r => r.status === 'rejected')
    expect(refused).toHaveLength(5)
    expect(refused[0]).toMatchObject({ reason: { code: 'rate_limited' } })
    await expect(checkSignIn('sam', 'right-password')).rejects.toMatchObject({ code: 'rate_limited' })
    expect(await prisma.rateLimit.findUnique({ where: { ip: CONSOLE_SIGN_IN_KEY } })).toMatchObject({ count: SIGN_IN_LIMIT })
  })
})

describe('the record of what fleet admins did @SC-922', () => {
  const ctx = (user: { id: string }) => ({ user }) as any

  it('keeps what the Fleet Console sends, announces it when asked, and is read by fleet admins only', async () => {
    const fleet = await createUserWithRole('MEMBER', { fleetAdmin: true, displayName: 'Sam Lee' })
    const orgAdmin = await createUserWithRole('ADMIN')
    const member = await createUserWithRole('MEMBER')
    const at = '2026-10-14T09:00:00.000Z'

    expect(await recordConsoleActivity({ byUserId: fleet.id, action: 'site.added', subject: 'office-server (AAAA)', at: new Date(at), announce: true })).toBe(true)
    expect(await recordConsoleActivity({ byUserId: 'no-such-person', action: 'x', subject: 'y', at: new Date(at), announce: false })).toBe(false)
    expect(await recordConsoleActivity({ byUserId: null, action: 'Joined its own Fleet Console', subject: 'hq-box', at: new Date('2026-10-14T08:00:00Z'), announce: false })).toBe(true)

    const told = await prisma.notification.findMany({ where: { type: FLEET_ACTIVITY_NOTIFICATION } })
    expect(told.map(n => n.userId).sort()).toEqual([fleet.id, orgAdmin.id].sort())
    expect(told[0]).toMatchObject({ title: 'Sam Lee added the site office-server', body: 'office-server (AAAA)' })

    expect(await getFleetActivity(undefined, ctx(fleet))).toEqual([
      { id: expect.any(String), at, by: { id: fleet.id, name: 'Sam Lee' }, action: 'site.added', subject: 'office-server (AAAA)', announced: true },
      { id: expect.any(String), at: '2026-10-14T08:00:00.000Z', by: null, action: 'Joined its own Fleet Console', subject: 'hq-box', announced: false },
    ])
    await expect(getFleetActivity(undefined, ctx(orgAdmin))).rejects.toMatchObject({ statusCode: 403 })
    await expect(getFleetActivity(undefined, ctx(member))).rejects.toMatchObject({ statusCode: 403 })
  })
})
