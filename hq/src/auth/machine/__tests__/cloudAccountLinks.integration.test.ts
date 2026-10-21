import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createUserWithRole } from '../../../test/factories'

// Agenthix Cloud's account links on a machine it runs (pre-release spec B7; adr-0133), through the command the host
// service sends over hq's control socket, against the real test database.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('wasp/auth/password', () => ({ hashPassword: vi.fn(async (pw: string) => `hashed:${pw}`) }))

import { runHqMachineCommand } from '../hqMachineCommands'
import { CLOUD_ACCOUNT_LINK_NOTIFICATION } from '../cloudAccountLinks'
import { resetRateLimiter, validateToken } from '../../inviteService'
import { acceptInviteToken } from '../../inviteAccept'

const tokenOf = (link: string) => decodeURIComponent(link.split('/').pop()!)
const dataOf = (r: unknown) => (r as { data: Record<string, any> }).data

async function person(username: string, role: 'ADMIN' | 'MEMBER', data: Record<string, unknown> = {}) {
  const user = await createUserWithRole(role, data)
  await prisma.auth.create({
    data: { userId: user.id, identities: { create: { providerName: 'username', providerUserId: username, providerData: '{}' } } },
  })
  return user
}

let logged: string[]
beforeEach(async () => {
  vi.stubEnv('WASP_WEB_CLIENT_URL', 'https://hq.example.com')
  await resetRateLimiter()
  logged = []
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')) })
  }
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function neverLogged(link: string): void {
  expect(logged.join('\n')).not.toContain(tokenOf(link))
}

describe('account.firstLink @SC-1098', () => {
  it('makes a first-admin link while hq has no account, each ending the one before, and never logs it', async () => {
    const first = dataOf(await runHqMachineCommand('cloud-first-link', ['ref-one']))
    expect(first.link).toMatch(/^https:\/\/hq\.example\.com\/invite\//)
    expect(Date.parse(first.expiresAt)).toBeGreaterThan(Date.now())
    const second = dataOf(await runHqMachineCommand('cloud-first-link', ['ref-two']))
    expect(await validateToken(tokenOf(first.link))).toMatchObject({ valid: false })
    expect(await validateToken(tokenOf(second.link))).toMatchObject({ valid: true, kind: 'first_admin' })
    neverLogged(first.link)
    neverLogged(second.link)
  })

  it('keeps the ref with the account the link makes, and once one exists answers who was made first, never a link', async () => {
    const made = dataOf(await runHqMachineCommand('cloud-first-link', ['ref-kept']))
    expect(await acceptInviteToken({ token: tokenOf(made.link), name: 'Avery Chen', username: 'avery', password: 'password123' }))
      .toMatchObject({ success: true })
    const key = await prisma.invite.findFirstOrThrow({ where: { linkRef: 'ref-kept' } })
    await person('sam', 'MEMBER')

    const r = await runHqMachineCommand('cloud-first-link', ['ref-late'])
    expect(r).toEqual({
      ok: true, text: 'Done.',
      data: { state: 'hasAccounts', accounts: 2, firstAdmin: { madeAt: key.consumedAt!.toISOString(), madeWith: { kind: 'firstLink', ref: 'ref-kept' } } },
    })
    expect(await prisma.invite.count({ where: { linkRef: 'ref-late' } })).toBe(0)
  })

  it('says the first admin was made another way when no Cloud link made them', async () => {
    await person('avery', 'ADMIN')
    expect(dataOf(await runHqMachineCommand('cloud-first-link', ['ref-x']))).toMatchObject({ state: 'hasAccounts', accounts: 1, firstAdmin: { madeWith: { kind: 'other' } } })
  })

  it('makes no link from an address that is not https', async () => {
    vi.stubEnv('WASP_WEB_CLIENT_URL', 'http://hq.example.com')
    expect(await runHqMachineCommand('cloud-first-link', ['ref-x'])).toMatchObject({ ok: false, code: 'conflict' })
    expect(await prisma.invite.count()).toBe(0)
  })
})

describe('account.resetLink @SC-1098', () => {
  it('makes a one-time link for an active organisation admin, announced to every admin as done from Cloud', async () => {
    const avery = await person('avery', 'ADMIN')
    const sam = await person('sam', 'ADMIN')
    const fleet = await person('fleet', 'MEMBER', { fleetAdmin: true })
    await person('dana', 'MEMBER')

    const r = dataOf(await runHqMachineCommand('cloud-reset-link', ['avery']))
    expect(r.link).toMatch(/^https:\/\/hq\.example\.com\/reset-password\//)
    expect(await prisma.passwordReset.findFirstOrThrow()).toMatchObject({ userId: avery.id, createdById: null })
    const notes = await prisma.notification.findMany({ where: { type: CLOUD_ACCOUNT_LINK_NOTIFICATION } })
    expect(notes.map(n => n.userId).sort()).toEqual([avery.id, sam.id, fleet.id].sort())
    expect(notes[0].title).toContain('Agenthix Cloud')
    expect(JSON.stringify(notes)).not.toContain(tokenOf(r.link))
    neverLogged(r.link)
  })

  it('refuses in the same words for a member, someone who left, and no one at all, making nothing', async () => {
    await person('dana', 'MEMBER')
    await person('gone', 'ADMIN', { deactivatedAt: new Date() })
    const answers = await Promise.all(['dana', 'gone', 'nobody'].map(u => runHqMachineCommand('cloud-reset-link', [u])))
    expect(new Set(answers.map(a => JSON.stringify(a))).size).toBe(1)
    expect(answers[0]).toMatchObject({ ok: false, code: 'not_found' })
    expect(await prisma.passwordReset.count()).toBe(0)
    expect(await prisma.notification.count()).toBe(0)
  })
})

describe('account.adminInvite @SC-1098', () => {
  it('makes an admin invitation only while no active organisation admin is left, and announces it', async () => {
    const fleet = await person('fleet', 'MEMBER', { fleetAdmin: true })
    await person('gone', 'ADMIN', { deactivatedAt: new Date() })

    const r = dataOf(await runHqMachineCommand('cloud-admin-invite', []))
    expect(r.link).toMatch(/^https:\/\/hq\.example\.com\/invite\//)
    expect(await validateToken(tokenOf(r.link))).toMatchObject({ valid: true, kind: 'invitation', role: 'ADMIN' })
    const notes = await prisma.notification.findMany({ where: { type: CLOUD_ACCOUNT_LINK_NOTIFICATION } })
    expect(notes.map(n => n.userId)).toEqual([fleet.id])
    neverLogged(r.link)
  })

  it('is a conflict while an active organisation admin is left, or before any account exists', async () => {
    expect(await runHqMachineCommand('cloud-admin-invite', [])).toMatchObject({ ok: false, code: 'conflict' })
    await person('avery', 'ADMIN')
    expect(await runHqMachineCommand('cloud-admin-invite', [])).toMatchObject({ ok: false, code: 'conflict' })
    expect(await prisma.invite.count()).toBe(0)
  })
})
