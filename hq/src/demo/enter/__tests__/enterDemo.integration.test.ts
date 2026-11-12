import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../../test/db'

// Enter the demo against the real test database: a visitor account each press, the member role and never an admin,
// a session that signs it in, the caps, and visitors kept out of each other's lists of people.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../../projects/personalProject', () => ({ ensurePersonalProjectAfterSignup: async () => {} }))
// The visitor's own tasks are made in their space, left out here with it (visitorTasks.integration.test.ts).
vi.mock('../visitorTasks', () => ({ giveVisitorTasks: async () => 0 }))
vi.mock('wasp/auth/session', async () => {
  const { prisma } = await import('../../../test/db')
  return {
    createSession: async (authId: string) =>
      prisma.session.create({ data: { id: `s-${authId}`, expiresAt: new Date(Date.now() + 86_400_000), userId: authId } }),
  }
})

import { enterDemo, ENTRIES_PER_ADDRESS, MAX_VISITORS } from '../enterDemo'
import { hideOtherVisitors, isVisitorUsername, visitorNumber, VISITOR_USER } from '../../visitors'
import { setDemoModeForTests } from '../../demoMode'
import { ACTIVE_WINDOW_MS, activeVisitors, markSeen } from '../../activeVisitors'
import { resetRateLimit } from '../../../server/rateLimit'
import { createProject, createUserWithRole } from '../../../test/factories'

beforeEach(async () => {
  await resetRateLimit()
  setDemoModeForTests(true)
})
afterEach(() => setDemoModeForTests(null))

describe('Enter the demo', () => {
  it('makes a visitor: a member, never an admin or a fleet admin, named Visitor NNNN after their handle, signed in @SC-1949', async () => {
    const entered = await enterDemo('203.0.113.1')
    expect(entered.ok).toBe(true)
    if (!entered.ok) return
    const session = await prisma.session.findUniqueOrThrow({ where: { id: entered.sessionId }, include: { auth: { include: { user: { include: { settings: true } }, identities: true } } } })
    const user = session.auth.user!
    expect(user.fleetAdmin).toBe(false)
    const username = session.auth.identities[0].providerUserId
    expect(isVisitorUsername(username)).toBe(true)
    expect(user.displayName).toBe(`Visitor ${visitorNumber(username)}`)
    expect(user.settings?.role).toBe('MEMBER')
  })

  it('stops an address after its cap for the hour @SC-1950', async () => {
    for (let i = 0; i < ENTRIES_PER_ADDRESS; i++) expect((await enterDemo('203.0.113.2')).ok).toBe(true)
    expect(await enterDemo('203.0.113.2')).toMatchObject({ ok: false, status: 429, reason: 'address', error: expect.stringMatching(/^Too many visitors from your network this hour\. Try again in (60|59) minutes\.$/) })
    expect((await enterDemo('203.0.113.3')).ok).toBe(true)
  })

  it('stops everyone once the demo holds its most active visitors, and lets in again once one is idle for an hour @SC-1950', async () => {
    await prisma.user.createMany({ data: Array.from({ length: MAX_VISITORS }, (_, i) => ({ id: `v${i}` })) })
    await prisma.auth.createMany({ data: Array.from({ length: MAX_VISITORS }, (_, i) => ({ id: `a${i}`, userId: `v${i}` })) })
    await prisma.authIdentity.createMany({ data: Array.from({ length: MAX_VISITORS }, (_, i) => ({
      providerName: 'username', providerUserId: `visitor-${i}`, providerData: '{}', authId: `a${i}`,
    })) })
    for (let i = 0; i < MAX_VISITORS; i++) await markSeen(`v${i}`)
    expect(await enterDemo('203.0.113.4')).toMatchObject({ ok: false, status: 503, reason: 'full' })
    expect(await prisma.user.count({ where: VISITOR_USER })).toBe(MAX_VISITORS)

    await markSeen('v0', prisma, new Date(Date.now() - ACTIVE_WINDOW_MS - 1_000))
    expect((await enterDemo('203.0.113.4')).ok).toBe(true)
    expect(await activeVisitors()).toBe(MAX_VISITORS)
  })

  it('limits an IPv6 address by its /64 @SC-1950', async () => {
    for (let i = 0; i < ENTRIES_PER_ADDRESS; i++) expect((await enterDemo(`2001:db8:1:2::${i + 1}`)).ok).toBe(true)
    expect(await enterDemo('2001:db8:1:2:ffff::9')).toMatchObject({ ok: false, status: 429 })
    expect((await enterDemo('2001:db8:1:3::1')).ok).toBe(true)
  })

  it('keeps other visitors out of a list of people, but not the one looking @SC-1972', async () => {
    const sam = await prisma.user.create({ data: { displayName: 'Sam' } })
    const first = await enterDemo('203.0.113.5')
    const second = await enterDemo('203.0.113.6')
    if (!first.ok || !second.ok) throw new Error('not entered')
    const me = (await prisma.session.findUniqueOrThrow({ where: { id: first.sessionId }, include: { auth: true } })).auth.userId
    const seen = await prisma.user.findMany({ where: hideOtherVisitors(me), select: { id: true } })
    expect(seen.map(u => u.id).sort()).toEqual([me, sam.id].sort())
  })
})

describe("a visitor's share of the sample", () => {
  const visitorOf = async (entered: Awaited<ReturnType<typeof enterDemo>>) => {
    if (!entered.ok) throw new Error('not entered')
    return (await prisma.session.findUniqueOrThrow({ where: { id: entered.sessionId }, include: { auth: true } })).auth.userId!
  }

  it('makes them a viewer of every sample project, which is private, never of a personal one @SC-1951', async () => {
    const sam = await createUserWithRole('ADMIN')
    const web = await createProject({ accessLevel: 'PRIVATE' })
    const res = await createProject({ accessLevel: 'PRIVATE' })
    await createProject({ accessLevel: 'PRIVATE', personalOwnerId: sam.id })
    const me = await visitorOf(await enterDemo('203.0.113.10'))
    const next = await visitorOf(await enterDemo('203.0.113.11'))
    for (const who of [me, next]) {
      const rows = await prisma.projectMember.findMany({ where: { userId: who }, select: { projectId: true, role: true }, orderBy: { projectId: 'asc' } })
      expect(rows).toEqual([{ projectId: web.id, role: 'VIEWER' }, { projectId: res.id, role: 'VIEWER' }].sort((x, y) => x.projectId.localeCompare(y.projectId)))
    }
  })

  it("copies the sample admins' project pins, and none of the notifications that wait on them @SC-1953", async () => {
    const sam = await createUserWithRole('ADMIN')
    const kai = await createUserWithRole('MEMBER')
    const past = new Date(Date.now() - 60_000)
    const web = await createProject({ accessLevel: 'PRIVATE' })
    const qtr = await createProject({ accessLevel: 'PRIVATE' })
    await prisma.pin.createMany({ data: [
      { userId: sam.id, kind: 'PROJECT', itemId: qtr.id, position: 0 },
      { userId: sam.id, kind: 'PROJECT', itemId: web.id, position: 1 },
      { userId: kai.id, kind: 'PROJECT', itemId: web.id, position: 0 },
    ] })
    await prisma.notification.create({ data: { userId: sam.id, type: 'tool_approval', title: 'Writer wants approval on WEB-2', body: 'b', actionUrl: '/tasks/WEB-2', createdAt: past } })
    const me = await visitorOf(await enterDemo('203.0.113.12'))
    const pins = await prisma.pin.findMany({ where: { userId: me }, orderBy: { position: 'asc' }, select: { itemId: true, position: true } })
    expect(pins).toEqual([{ itemId: qtr.id, position: 0 }, { itemId: web.id, position: 1 }])
    expect(await prisma.notification.count({ where: { userId: me } })).toBe(0)
    expect(await prisma.notification.count({ where: { userId: sam.id } })).toBe(1)
  })
})
