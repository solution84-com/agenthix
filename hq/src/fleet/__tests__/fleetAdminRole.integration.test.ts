/**
 * The fleet admin role (host-management spec §1, §7; adr-0110), against the real test database: held by the first
 * account, granted only by a fleet admin or hq's machine — never by an organisation admin through anything hq's
 * screens reach — and every change announced to fleet admins and organisation admins.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('wasp/auth/password', () => ({ hashPassword: vi.fn(async (pw: string) => `hashed:${pw}`) }))

import { FLEET_ADMIN_GRANTED, FLEET_ADMIN_REMOVED, grantFleetAdmin, listFleetAdmins, revokeFleetAdmin } from '../fleetAdminRole'
import { fleetAdminRecipients } from '../../sites/fleetAdmins'
import { runHqMachineCommand } from '../../auth/machine/hqMachineCommands'
import { updateUserRole, updateUserSettings } from '../../settings/actions'
import { setPersonName } from '../../settings/personProfileActions'
import { issueFirstAdminLink } from '../../auth/firstAdmin'
import { acceptInviteToken } from '../../auth/inviteAccept'
import { resetRateLimiter } from '../../auth/inviteService'

const ctx = (user: { id: string }) =>
  ({ user, entities: { User: prisma.user, UserSettings: prisma.userSettings, SiteConfig: prisma.siteConfig } }) as any
const holds = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).fleetAdmin

async function withUsername(user: { id: string }, username: string) {
  await prisma.auth.create({
    data: { userId: user.id, identities: { create: { providerName: 'username', providerUserId: username, providerData: '{}' } } },
  })
  return user
}

beforeEach(async () => {
  vi.stubEnv('WASP_WEB_CLIENT_URL', 'https://hq.example.com')
  await resetRateLimiter()
})
afterEach(() => vi.unstubAllEnvs())

describe('an organisation admin cannot give the role @SC-920', () => {
  it('through any operation that edits people or settings', async () => {
    const admin = await createUserWithRole('ADMIN')
    const member = await createUserWithRole('MEMBER')
    // Extra fields as a caller could send them; the operations name what they write.
    await updateUserRole({ userId: member.id, role: 'ADMIN', fleetAdmin: true } as any, ctx(admin))
    await updateUserSettings({ config: { fleetAdmin: true }, fleetAdmin: true } as any, ctx(admin))
    await setPersonName({ userId: member.id, displayName: 'Robin', fleetAdmin: true } as any, ctx(admin)).catch(() => undefined)
    expect(await holds(member.id)).toBe(false)
    expect(await holds(admin.id)).toBe(false)
  })

  it('through the console link, naming themselves as the one who grants', async () => {
    const admin = await createUserWithRole('ADMIN')
    const member = await createUserWithRole('MEMBER')
    expect(await grantFleetAdmin(member.id, { userId: admin.id })).toMatchObject({ ok: false, code: 'not_allowed' })
    expect(await grantFleetAdmin(admin.id, { userId: admin.id })).toMatchObject({ ok: false, code: 'not_allowed' })
    expect(await holds(member.id)).toBe(false)
  })
})

describe('a fleet admin gives and removes the role @SC-920', () => {
  it('is announced to every fleet admin and organisation admin still here, and recorded', async () => {
    const fleet = await createUserWithRole('MEMBER', { fleetAdmin: true })
    const orgAdmin = await createUserWithRole('ADMIN')
    const both = await createUserWithRole('ADMIN', { fleetAdmin: true })
    await createUserWithRole('ADMIN', { deactivatedAt: new Date() })
    const member = await createUserWithRole('MEMBER')

    expect(await grantFleetAdmin(member.id, { userId: fleet.id })).toMatchObject({ ok: true, changed: true })
    expect(await holds(member.id)).toBe(true)
    const told = await prisma.notification.findMany({ where: { type: FLEET_ADMIN_GRANTED } })
    // The new fleet admin is told too: they hold the role by the time it is announced.
    expect(told.map(n => n.userId).sort()).toEqual([fleet.id, orgAdmin.id, both.id, member.id].sort())
    expect(await prisma.fleetActivity.findMany()).toEqual([expect.objectContaining({ byUserId: fleet.id, action: 'fleetAdmin.granted', announced: false })])

    expect(await grantFleetAdmin(member.id, { userId: fleet.id })).toMatchObject({ ok: true, changed: false })
    expect(await revokeFleetAdmin(member.id, { userId: fleet.id })).toMatchObject({ ok: true, changed: true })
    expect(await holds(member.id)).toBe(false)
    // The person who lost the role is told as well.
    const removed = await prisma.notification.findMany({ where: { type: FLEET_ADMIN_REMOVED } })
    expect(removed.map(n => n.userId).sort()).toEqual([fleet.id, orgAdmin.id, both.id, member.id].sort())
  })

  it('tells the Fleet Console of a removal, wherever it was made, so their sessions there end at once', async () => {
    const { relayHub } = await import('../index')
    const told = vi.spyOn(relayHub, 'tellFleetAdminRemoved')
    const fleet = await createUserWithRole('MEMBER', { fleetAdmin: true })
    const member = await withUsername(await createUserWithRole('MEMBER'), 'jordan')
    await grantFleetAdmin(member.id, { userId: fleet.id })
    expect(told).not.toHaveBeenCalled()
    await revokeFleetAdmin(member.id, { userId: fleet.id })
    await revokeFleetAdmin(member.id, { userId: fleet.id })
    expect(told.mock.calls).toEqual([[member.id]])
    await grantFleetAdmin(member.id, { userId: fleet.id })
    await runHqMachineCommand('fleet-admin', ['--remove', 'jordan'])
    expect(told.mock.calls).toEqual([[member.id], [member.id]])
    told.mockRestore()
  })

  it('records when the role was given, at each grant', async () => {
    const sam = await createUserWithRole('ADMIN', { fleetAdmin: true })
    const avery = await createUserWithRole('MEMBER', { fleetAdminSince: new Date('2020-01-01T00:00:00Z') })
    const before = Date.now()
    expect(await grantFleetAdmin(avery.id, { userId: sam.id })).toMatchObject({ ok: true, changed: true })
    const row = await prisma.user.findUniqueOrThrow({ where: { id: avery.id } })
    expect(row.fleetAdminSince.getTime()).toBeGreaterThanOrEqual(before)
    expect((await listFleetAdmins()).find(a => a.id === avery.id)?.since).toBe(row.fleetAdminSince.toISOString())
  })

  it('cannot remove the last fleet admin; a fleet admin who has left cannot grant', async () => {
    const only = await createUserWithRole('MEMBER', { fleetAdmin: true })
    expect(await revokeFleetAdmin(only.id, { userId: only.id })).toMatchObject({ ok: false, code: 'not_allowed' })
    const gone = await createUserWithRole('MEMBER', { fleetAdmin: true, deactivatedAt: new Date() })
    const member = await createUserWithRole('MEMBER')
    expect(await grantFleetAdmin(member.id, { userId: gone.id })).toMatchObject({ ok: false, code: 'not_allowed' })
  })

  it('lists who holds it, and only they are fleet admins’ recipients', async () => {
    const fleet = await withUsername(await createUserWithRole('ADMIN', { fleetAdmin: true, displayName: 'Sam' }), 'sam')
    await createUserWithRole('ADMIN')
    const since = (await prisma.user.findUniqueOrThrow({ where: { id: fleet.id } })).fleetAdminSince.toISOString()
    expect(await listFleetAdmins()).toEqual([{ id: fleet.id, name: 'Sam', username: 'sam', organisationAdmin: true, since }])
    expect(await fleetAdminRecipients()).toEqual([fleet.id])
  })
})

describe('hq’s machine @SC-920', () => {
  it('gives the role when nobody holds it, says who it does not know, and is announced', async () => {
    const admin = await withUsername(await createUserWithRole('ADMIN'), 'avery')
    expect(await runHqMachineCommand('fleet-admin', ['nobody'])).toMatchObject({ ok: false, code: 'not_found' })
    expect(await runHqMachineCommand('fleet-admin', [])).toMatchObject({ ok: false, code: 'usage' })
    expect(await runHqMachineCommand('fleet-admin', ['avery'])).toMatchObject({ ok: true, data: { fleetAdmin: true, changed: true } })
    expect(await holds(admin.id)).toBe(true)
    expect(await prisma.notification.count({ where: { type: FLEET_ADMIN_GRANTED } })).toBe(1)
    expect(await prisma.fleetActivity.findFirst()).toMatchObject({ byUserId: null })
  })

  it('removes it, even from the last fleet admin', async () => {
    const admin = await withUsername(await createUserWithRole('ADMIN', { fleetAdmin: true }), 'avery')
    expect(await runHqMachineCommand('fleet-admin', ['--remove', 'avery'])).toMatchObject({ ok: true, data: { fleetAdmin: false } })
    expect(await holds(admin.id)).toBe(false)
  })

  it("gives an active fleet admin's id for console reset-code, and no one else's @SC-1126", async () => {
    const sam = await withUsername(await createUserWithRole('ADMIN', { fleetAdmin: true }), 'sam')
    await withUsername(await createUserWithRole('ADMIN'), 'avery')
    expect(await runHqMachineCommand('fleet-admin-id', ['sam'])).toEqual({ ok: true, text: sam.id, data: { userId: sam.id } })
    expect(await runHqMachineCommand('fleet-admin-id', ['avery'])).toMatchObject({ ok: false, code: 'not_found' })
    expect(await runHqMachineCommand('fleet-admin-id', ['nobody'])).toMatchObject({ ok: false, code: 'not_found' })
    expect(await runHqMachineCommand('fleet-admin-id', [])).toMatchObject({ ok: false, code: 'usage' })
  })
})

describe('the first account @SC-920', () => {
  it('holds both roles; an admin who accepts an invitation holds the organisation admin role only', async () => {
    const first = await issueFirstAdminLink()
    const token = decodeURIComponent(first!.link.split('/invite/')[1])
    expect(await acceptInviteToken({ token, name: 'Avery Chen', username: 'avery', password: 'password123' })).toMatchObject({ success: true })
    const avery = await prisma.user.findFirstOrThrow({ include: { settings: true } })
    expect(avery).toMatchObject({ fleetAdmin: true, settings: { role: 'ADMIN' } })

    const invitation = await runHqMachineCommand('invite-admin', [])
    const invited = decodeURIComponent((invitation as unknown as { data: { link: string } }).data.link.split('/invite/')[1])
    expect(await acceptInviteToken({ token: invited, name: 'Robin Diaz', username: 'robin', password: 'password123' })).toMatchObject({ success: true })
    const robin = await prisma.user.findFirstOrThrow({ where: { displayName: 'Robin Diaz' }, include: { settings: true } })
    expect(robin).toMatchObject({ fleetAdmin: false, settings: { role: 'ADMIN' } })
  })
})
