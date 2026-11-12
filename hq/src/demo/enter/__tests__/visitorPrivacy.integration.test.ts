import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../../test/db'

// Every visitor is a viewer of every sample project, so a project's own lists would name every visitor to every other
// (security review 3). Against the real test database: the project's members, its teams' people and a person's card
// name the sample's people and the visitor looking, never another visitor.

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../projects/personalProject', async () => ({
  ...(await vi.importActual<typeof import('../../../projects/personalProject')>('../../../projects/personalProject')),
  ensurePersonalProjectAfterSignup: async () => {},
}))
vi.mock('../visitorTasks', () => ({ giveVisitorTasks: async () => 0 }))
vi.mock('wasp/auth/session', async () => {
  const { prisma } = await import('../../../test/db')
  return {
    createSession: async (authId: string) =>
      prisma.session.create({ data: { id: `s-${authId}`, expiresAt: new Date(Date.now() + 86_400_000), userId: authId } }),
  }
})

import { enterDemo } from '../enterDemo'
import { getProjectMembers } from '../../../projects/memberQueries'
import { getProjectTeams } from '../../../org/teams/teamQueries'
import { getPersonCard } from '../../../settings/personCard'
import { setDemoModeForTests } from '../../demoMode'
import { resetRateLimit } from '../../../server/rateLimit'
import { createProject, createUserWithRole, joinProjectAs } from '../../../test/factories'

beforeEach(async () => {
  await resetRateLimit()
})
afterEach(() => setDemoModeForTests(null))

async function visitor(address: string): Promise<string> {
  const entered = await enterDemo(address)
  if (!entered.ok) throw new Error('not entered')
  return (await prisma.session.findUniqueOrThrow({ where: { id: entered.sessionId }, include: { auth: true } })).auth.userId!
}

async function sample() {
  const sam = await createUserWithRole('ADMIN')
  const web = await createProject({ accessLevel: 'PRIVATE' })
  await joinProjectAs(web.id, sam.id, 'ADMIN')
  return { sam, web }
}

describe('another visitor, to a visitor looking at a sample project', () => {
  it("is not among the project's members, its teams' people, or a person's card @SC-1972", async () => {
    setDemoModeForTests(true)
    const { sam, web } = await sample()
    const me = await visitor('203.0.113.30')
    const other = await visitor('203.0.113.31')
    const ctx = { user: { id: me } }

    const members = (await getProjectMembers({ projectId: web.id }, ctx as never)).map(m => m.userId)
    expect(members).toContain(sam.id)
    expect(members).toContain(me)
    expect(members).not.toContain(other)

    const teams = await getProjectTeams({ projectId: web.id }, ctx as never)
    expect(teams.people.map(p => p.userId)).not.toContain(other)
    expect(teams.people.map(p => p.userId)).toContain(me)

    await expect(getPersonCard({ userId: other }, ctx as never)).rejects.toMatchObject({ statusCode: 404 })
    expect((await getPersonCard({ userId: sam.id }, ctx as never)).isMe).toBe(false)
    expect((await getPersonCard({ userId: me }, ctx as never)).isMe).toBe(true)
  })

  it('with the setting off, every member is listed as before @SC-1972 @SC-1979', async () => {
    setDemoModeForTests(true)
    const { web } = await sample()
    const me = await visitor('203.0.113.32')
    const other = await visitor('203.0.113.33')
    setDemoModeForTests(false)
    const members = (await getProjectMembers({ projectId: web.id }, { user: { id: me } } as never)).map(m => m.userId)
    expect(members).toContain(other)
    expect((await getPersonCard({ userId: other }, { user: { id: me } } as never)).isMe).toBe(false)
  })
})
