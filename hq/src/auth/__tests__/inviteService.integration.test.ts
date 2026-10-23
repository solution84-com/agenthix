import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'

// Covers SC-007 (validate an invite code and redeem it to create an account with
// the invite's role) and SC-146 (redeeming with an already-taken username is
// rejected before any account is created), with the getting-in spec's reading of
// an invitation (organisation, inviter, projects) and its accepting (a name).
// `wasp/server` is redirected at the test Prisma client, and `hashPassword` is
// stubbed: hashing is a CPU collaborator, not the behaviour under test.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma }
})

vi.mock('wasp/auth/password', () => ({
  hashPassword: vi.fn(async (pw: string) => `hashed:${pw}`),
}))

import { validateToken, resetRateLimiter } from '../inviteService'
import { acceptInviteToken } from '../inviteAccept'
import { generateInviteToken, hashInviteToken } from '../inviteToken'
import { createProject } from '../../test/factories'

async function createInviterUser(username = 'inviter', displayName: string | null = null): Promise<string> {
  const user = await prisma.user.create({
    data: {
      displayName,
      auth: { create: { identities: { create: { providerName: 'username', providerUserId: username, providerData: '{}' } } } },
    },
  })
  return user.id
}

// Returns the plaintext token beside the row: only its hash is stored.
async function createInvite(opts: Record<string, unknown> = {}) {
  const createdBy = 'createdBy' in opts ? opts.createdBy : await createInviterUser(`inviter_${Math.random().toString(36).slice(2)}`)
  const token = generateInviteToken()
  const invite = await prisma.invite.create({
    data: {
      role: 'MEMBER',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ...opts,
      createdBy,
      tokenHash: hashInviteToken(token),
    } as any,
  })
  return { ...invite, token }
}

const accept = (token: string, username: string, password = 'password123', name = 'Sam Lee') =>
  acceptInviteToken({ token, name, username, password })

beforeEach(() => resetRateLimiter())

describe('acceptInviteToken @SC-007 @SC-719', () => {
  it('redeems a valid invite: an account with the invite role and their name, the invite consumed', async () => {
    const invite = await createInvite({ role: 'ADMIN' })

    expect(await accept(invite.token, 'newadmin', 'password123', '  Ada   Lovelace ')).toEqual({ success: true, landAt: '/' })

    const auth = await prisma.auth.findFirstOrThrow({ where: { identities: { some: { providerUserId: 'newadmin' } } } })
    expect(await prisma.userSettings.findFirst({ where: { userId: auth.userId! } })).toMatchObject({ role: 'ADMIN' })
    expect(await prisma.user.findUnique({ where: { id: auth.userId! } })).toMatchObject({ displayName: 'Ada Lovelace' })
    const consumed = await prisma.invite.findUnique({ where: { id: invite.id } })
    expect(consumed).toMatchObject({ consumedBy: auth.userId })
    expect(consumed?.consumedAt).not.toBeNull()
  })

  it('needs a name, and creates nothing without one', async () => {
    const invite = await createInvite()
    expect(await accept(invite.token, 'sam', 'password123', '   ')).toMatchObject({ status: 400, reason: 'name' })
    expect(await prisma.authIdentity.count()).toBe(1)
    expect((await prisma.invite.findUnique({ where: { id: invite.id } }))?.consumedAt).toBeNull()
  })

  it('rejects an unknown code with 404, saying only that it does not work, and creates no account', async () => {
    expect(await accept('does-not-exist', 'ghost')).toEqual({ error: "This invitation link doesn't work.", status: 404, reason: 'unknown' })
    expect(await prisma.authIdentity.count()).toBe(0)
  })

  it('does not accept the stored hash as if it were the token (R-134)', async () => {
    const invite = await createInvite()
    expect(await validateToken(invite.tokenHash)).toMatchObject({ valid: false, status: 404, reason: 'unknown' })
  })
})

describe('acceptInviteToken — a taken username @SC-146', () => {
  it('rejects a taken username behind a valid code, before consuming the invite', async () => {
    await createInviterUser('taken')
    const invite = await createInvite()

    expect(await accept(invite.token, 'taken')).toMatchObject({ status: 400, reason: 'taken', error: "Username 'taken' is already taken" })
    expect(await prisma.authIdentity.count({ where: { providerUserId: 'taken' } })).toBe(1)
    expect((await prisma.invite.findUnique({ where: { id: invite.id } }))?.consumedAt).toBeNull()
  })

  it.each([
    ['used', { consumedAt: new Date() }],
    ['revoked', { revokedAt: new Date() }],
    ['expired', { expiresAt: new Date(Date.now() - 1000) }],
  ])('answers a taken username behind a %s code as that refusal, not as taken (R-201)', async (reason, data) => {
    await createInviterUser('taken')
    const invite = await createInvite(data)
    expect(await accept(invite.token, 'taken')).toMatchObject({ status: 410, reason })
  })

  it('answers a taken username behind an unknown code as an unknown code', async () => {
    await createInviterUser('taken')
    expect(await accept('not-a-real-code', 'taken')).toMatchObject({ status: 404, reason: 'unknown' })
  })
})

describe('validateToken @SC-113 @SC-718', () => {
  it('says what the invitation is: who sent it, its role, note, expiry, projects and the organisation', async () => {
    await prisma.org.create({ data: { name: 'Acme Corp', handle: 'acmecorp', vision: 'Shops online.' } })
    const inviter = await createInviterUser('avery', 'Avery Chen')
    const web = await createProject({ name: 'Website Redesign', key: 'WEB' })
    const app = await createProject({ name: 'Merchant app', key: 'APP' })
    const invite = await createInvite({ createdBy: inviter, note: 'Dana — design', projectIds: [app.id, web.id] })

    expect(await validateToken(invite.token)).toEqual({
      valid: true,
      kind: 'invitation',
      role: 'MEMBER',
      note: 'Dana — design',
      invitedBy: { name: 'Avery Chen', handle: 'avery' },
      fromHqMachine: false,
      projects: [
        { key: 'APP', name: 'Merchant app', description: null, memberCount: 0 },
        { key: 'WEB', name: 'Website Redesign', description: null, memberCount: 0 },
      ],
      people: [{ name: 'Avery Chen', role: 'MEMBER' }],
      morePeople: 0,
      needsModel: false,
      expiresAt: invite.expiresAt!.toISOString(),
      org: { shows: 'cover', name: 'Acme Corp', handle: 'acmecorp', vision: 'Shops online.', avatarUrl: null, coverUrl: null },
    })
  })

  it('shows a few people already in the organisation, admins first, and counts the rest; never someone who left', async () => {
    const inviter = await createInviterUser('avery', 'Avery Chen')
    await prisma.userSettings.create({ data: { userId: inviter, role: 'ADMIN', config: {} } })
    for (const n of ['a', 'b', 'c', 'd']) await createInviterUser(n, `Person ${n}`)
    const gone = await createInviterUser('gone', 'Left Already')
    await prisma.user.update({ where: { id: gone }, data: { deactivatedAt: new Date() } })
    const invite = await createInvite({ createdBy: inviter })

    const view = await validateToken(invite.token)
    if (!view.valid) throw new Error('expected a valid invitation')
    expect(view.people).toHaveLength(4)
    expect(view.people[0]).toEqual({ name: 'Avery Chen', role: 'ADMIN' })
    expect(view.people.map(p => p.name)).not.toContain('Left Already')
    expect(view.morePeople).toBe(1)
  })

  it("carries the organisation as much as its admin chose to show before sign-in", async () => {
    await prisma.org.create({ data: { name: 'Acme Corp', handle: 'acmecorp', vision: 'Shops online.', signInShows: 'NAME' } })
    const invite = await createInvite({ createdBy: await createInviterUser('avery', 'Avery Chen') })

    expect(await validateToken(invite.token)).toMatchObject({
      valid: true,
      org: { shows: 'name', name: 'Acme Corp', handle: null, vision: null, avatarUrl: null, coverUrl: null },
    })
  })

  it('refuses a withdrawn, a used and an expired invitation (410), naming who to ask', async () => {
    const inviter = await createInviterUser('avery', 'Avery Chen')
    const cases = [
      ['revoked', await createInvite({ createdBy: inviter, revokedAt: new Date() })],
      ['used', await createInvite({ createdBy: inviter, consumedAt: new Date() })],
      ['expired', await createInvite({ createdBy: inviter, expiresAt: new Date(Date.now() - 1000) })],
    ] as const
    for (const [reason, { token }] of cases) {
      expect(await validateToken(token)).toMatchObject({ valid: false, status: 410, reason, askWho: 'Avery Chen' })
    }
  })

  it('reads an invitation made on hq\'s machine as such, with no inviter', async () => {
    await createInviterUser('someone')
    const invite = await createInvite({ createdBy: null, role: 'ADMIN' })
    expect(await validateToken(invite.token)).toMatchObject({ valid: true, kind: 'invitation', role: 'ADMIN', invitedBy: null, fromHqMachine: true })
  })
})

describe('accepting an invitation that names projects @SC-719', () => {
  it('joins and pins each in the order named, skipping one deleted since, and lands in the first', async () => {
    const admin = await createInviterUser('avery')
    const web = await createProject({ name: 'Website Redesign', key: 'WEB' })
    const app = await createProject({ name: 'Merchant app', key: 'APP' })
    const gone = await createProject({ name: 'Gone', key: 'GONE' })
    const invite = await createInvite({ createdBy: admin, projectIds: [gone.id, app.id, web.id] })
    await prisma.project.delete({ where: { id: gone.id } })

    expect(await accept(invite.token, 'dana')).toEqual({ success: true, landAt: '/projects/APP' })

    const dana = await prisma.auth.findFirstOrThrow({ where: { identities: { some: { providerUserId: 'dana' } } } })
    const members = await prisma.projectMember.findMany({ where: { userId: dana.userId!, projectId: { in: [web.id, app.id] } } })
    expect(members.map(m => m.role)).toEqual(['MEMBER', 'MEMBER'])
    const pins = await prisma.pin.findMany({ where: { userId: dana.userId! }, orderBy: { position: 'asc' } })
    expect(pins.map(p => [p.kind, p.itemId])).toEqual([['PROJECT', app.id], ['PROJECT', web.id]])
  })
})
