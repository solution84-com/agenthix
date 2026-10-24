import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createUserWithRole } from '../../../test/factories'

// The commands run on hq's machine (getting-in spec, Getting back in): what
// `agenthix invite-admin`, `reset-password` and `status` do, against the real
// test database. The socket that carries them is controlSocket.test.ts's.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('wasp/auth/password', () => ({ hashPassword: vi.fn(async (pw: string) => `hashed:${pw}`) }))

import { MACHINE_ADMIN_INVITE_NOTIFICATION, MACHINE_RESET_NOTIFICATION, runHqMachineCommand } from '../hqMachineCommands'
import { validateToken } from '../../inviteService'
import { invitationViews } from '../../invitationViews'
import { BUILD_INFO } from '../../../server/buildInfo'

async function person(username: string, role: 'ADMIN' | 'MEMBER') {
  const user = await createUserWithRole(role)
  await prisma.auth.create({
    data: { userId: user.id, identities: { create: { providerName: 'username', providerUserId: username, providerData: '{}' } } },
  })
  return user
}

const linkIn = (text: string) => text.split('\n').pop()!
const tokenOf = (link: string) => decodeURIComponent(link.split('/').pop()!)

beforeEach(() => vi.stubEnv('WASP_WEB_CLIENT_URL', 'https://hq.example.com'))
afterEach(() => vi.unstubAllEnvs())

describe('invite-admin @SC-721', () => {
  it('prints a fresh first-admin link while hq has no users', async () => {
    const result = await runHqMachineCommand('invite-admin', [])
    expect(result).toMatchObject({ ok: true, data: { kind: 'first_admin', validHours: 24 } })
    const link = linkIn((result as { text: string }).text)
    expect((result as unknown as { data: { link: string } }).data.link).toBe(link)
    expect(link).toMatch(/^https:\/\/hq\.example\.com\/invite\//)
    expect(await validateToken(tokenOf(link))).toMatchObject({ valid: true, kind: 'first_admin' })
  })

  it('once hq has people, makes an admin invitation recorded as from hq\'s machine, and tells the admins', async () => {
    const avery = await person('avery', 'ADMIN')
    const left = await person('gone', 'ADMIN')
    await prisma.user.update({ where: { id: left.id }, data: { deactivatedAt: new Date() } })

    const result = await runHqMachineCommand('invite-admin', [])

    expect(result).toMatchObject({ ok: true, data: { kind: 'invitation', validHours: 24, toldAdmins: [expect.any(String)] } })
    const token = tokenOf(linkIn((result as { text: string }).text))
    expect((result as unknown as { data: { link: string } }).data.link).toBe(linkIn((result as { text: string }).text))
    expect(await validateToken(token)).toMatchObject({ valid: true, kind: 'invitation', role: 'ADMIN', invitedBy: null, fromHqMachine: true })
    const listed = await invitationViews(avery.id)
    expect(listed.waiting).toEqual([expect.objectContaining({ role: 'ADMIN', invitedBy: null, fromHqMachine: true })])
    const notes = await prisma.notification.findMany({ where: { type: MACHINE_ADMIN_INVITE_NOTIFICATION } })
    expect(notes.map(n => n.userId)).toEqual([avery.id])
  })
})

describe('reset-password @SC-721', () => {
  it('prints a one-time link and tells every other admin, not the person reset', async () => {
    const avery = await person('avery', 'ADMIN')
    const sam = await person('sam', 'ADMIN')
    await person('dana', 'MEMBER')

    const result = await runHqMachineCommand('reset-password', ['avery'])

    expect(result).toMatchObject({ ok: true, data: { kind: 'password_reset', validHours: 1, person: { handle: 'avery' }, toldAdmins: [expect.any(String)] } })
    expect(linkIn((result as { text: string }).text)).toMatch(/^https:\/\/hq\.example\.com\/reset-password\//)
    expect((result as unknown as { data: { link: string } }).data.link).toBe(linkIn((result as { text: string }).text))
    expect(await prisma.passwordReset.findFirstOrThrow()).toMatchObject({ userId: avery.id, createdById: null })
    const notes = await prisma.notification.findMany({ where: { type: MACHINE_RESET_NOTIFICATION } })
    expect(notes).toEqual([expect.objectContaining({ userId: sam.id, actionUrl: `/admin/people/${avery.id}` })])
  })

  it('says so for an unknown username or none, making nothing', async () => {
    expect(await runHqMachineCommand('reset-password', ['nobody'])).toEqual({ ok: false, error: "No one signs in as 'nobody'.", code: 'not_found' })
    expect(await runHqMachineCommand('reset-password', [])).toMatchObject({ ok: false, code: 'usage' })
    expect(await prisma.passwordReset.count()).toBe(0)
  })
})

describe('status and unknown commands @SC-721', () => {
  it('reports the number of people and whether hq\'s own site is connected', async () => {
    vi.stubEnv('HQ_PAIRING_SECRET', 'x'.repeat(40))
    await prisma.executionSite.create({ data: { siteId: 'hq-site', label: 'HQ', isDefault: true, status: 'ONLINE' } })
    await person('avery', 'ADMIN')
    expect(await runHqMachineCommand('status', [])).toMatchObject({
      ok: true,
      data: { users: 1, hqSite: { state: 'connected' }, address: 'https://hq.example.com' },
    })
  })

  it("gives hq's version, which the public /health no longer does @SC-723", async () => {
    const result = await runHqMachineCommand('status', [])
    expect(result).toMatchObject({ ok: true, data: { version: BUILD_INFO.version } })
    expect((result as { text: string }).text).toContain(`HQ ${BUILD_INFO.version} at `)
    expect(result).not.toMatchObject({ data: { commit: expect.anything() } })
    expect((result as { text: string }).text).not.toContain('commit')
  })

  it('refuses a command it does not know', async () => {
    expect(await runHqMachineCommand('drop-database', [])).toMatchObject({ ok: false })
  })
})
