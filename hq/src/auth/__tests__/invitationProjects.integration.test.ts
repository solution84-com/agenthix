/**
 * Invitations say who they are for and may add to projects (every screen
 * reviewed spec §3, People), against the real test DB: the note is kept as
 * who it is for; an invitation may name any project the inviting admin can
 * see; accepting it joins those projects as a Member.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createProject } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('wasp/auth/password', () => ({ hashPassword: vi.fn(async (pw: string) => `hashed:${pw}`) }))

import { createInvite } from '../actions'
import { acceptInviteToken } from '../inviteAccept'

const ctx = (user: { id: string }) =>
  ({ user, entities: { Invite: prisma.invite, UserSettings: prisma.userSettings, Project: prisma.project } }) as any

describe('createInvite with projects @SC-604', () => {
  beforeEach(() => { vi.stubEnv('WASP_WEB_CLIENT_URL', 'https://hq.example.com') })
  afterEach(() => vi.unstubAllEnvs())

  it('builds the link from hq\'s address, and says when that opens only on hq\'s machine', async () => {
    vi.stubEnv('WASP_WEB_CLIENT_URL', 'http://localhost:4100')
    const admin = await createUserWithRole('ADMIN')
    const result = await createInvite({ role: 'MEMBER' }, ctx(admin))
    expect(result.link).toBe(`http://localhost:4100/invite/${result.token}`)
    expect(result.addressWorksOnlyHere).toBe(true)
  })

  it('keeps who it is for and the projects the admin can see', async () => {
    const admin = await createUserWithRole('ADMIN')
    const open = await createProject({ accessLevel: 'OPEN' })
    const mine = await createProject({ accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: mine.id, userId: admin.id, role: 'ADMIN' } })

    const result = await createInvite({ role: 'MEMBER', note: '  Sam, design  ', projectIds: [open.id, mine.id] }, ctx(admin))

    expect(result).toMatchObject({ note: 'Sam, design' })
    expect(result.link).toBe(`https://hq.example.com/invite/${result.token}`)
    expect(result.addressWorksOnlyHere).toBe(false)
    expect(result.projectIds.sort()).toEqual([open.id, mine.id].sort())
  })

  it("refuses a private project the admin is not in, and someone's own project, storing nothing", async () => {
    const admin = await createUserWithRole('ADMIN')
    const hidden = await createProject({ accessLevel: 'PRIVATE' })
    const personal = await createProject({ personalOwnerId: (await createUser()).id })

    await expect(createInvite({ role: 'MEMBER', projectIds: [hidden.id] }, ctx(admin))).rejects.toMatchObject({ statusCode: 400 })
    await expect(createInvite({ role: 'MEMBER', projectIds: [personal.id] }, ctx(admin))).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.invite.count()).toBe(0)
  })
})

describe('accepting an invitation that names projects @SC-604', () => {
  it('joins each as a Member, skipping one deleted since', async () => {
    const admin = await createUserWithRole('ADMIN')
    const web = await createProject({ accessLevel: 'OPEN' })
    const gone = await createProject({ accessLevel: 'OPEN' })
    const { token, projectIds } = await createInvite({ role: 'MEMBER', projectIds: [web.id, gone.id] }, ctx(admin))
    expect(projectIds).toHaveLength(2)
    await prisma.project.delete({ where: { id: gone.id } })

    await expect(acceptInviteToken({ token, name: 'Sam', username: 'sam', password: 'a-long-password' }))
      .resolves.toEqual({ success: true, landAt: `/projects/${web.key}` })

    const sam = await prisma.authIdentity.findUniqueOrThrow({
      where: { providerName_providerUserId: { providerName: 'username', providerUserId: 'sam' } },
      select: { auth: { select: { userId: true } } },
    })
    const rows = await prisma.projectMember.findMany({ where: { userId: sam.auth.userId! }, select: { projectId: true, role: true } })
    expect(rows.filter(r => r.projectId === web.id)).toEqual([{ projectId: web.id, role: 'MEMBER' }])
  })
})
