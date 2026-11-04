/**
 * Who belongs to a project (spec §6.4, adr-0099) and what ending that does
 * (person-scoped execution spec §4, adr-0089), against the real test DB. A
 * project's people are changed by its admins, and by org admins in any project
 * they can see — never in a private one they are not in (adr-0062, annotated
 * 2026-10-08); the access level is the project admin's alone; no change may
 * leave a project without an admin; a personal project keeps exactly its
 * owner. Removing someone takes where their open tasks go, with no default.
 * Ending someone's access, in an open project as in a private one, holds an
 * instruction for each site that holds their home there. No site is
 * connected, so held instructions stay held.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MEMBERSHIP_METHODS } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createAgent, createProject, createSession, ensureExecutionSite } from '../../test/factories'
import { makeTask } from './projectsHarness'

const channel = vi.hoisted(() => ({ isOnline: vi.fn(), request: vi.fn() }))
vi.mock('../../sites/channel', () => ({ siteChannelRegistry: channel }))
vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { addProjectMember, setProjectMemberRole, removeProjectMember, setProjectAccessLevel, joinProject, leaveProject } from '../memberActions'
import { LOST_ACCESS_REASON } from '../taskOnBehalfOf'

const SITE = 'site-1'
const as = (user: { id: string } | null) => ({ user }) as any

beforeEach(async () => {
  channel.isOnline.mockReset().mockReturnValue(false)
  await ensureExecutionSite({ siteId: SITE })
})

/** A private project with its admin, a plain member, and an org admin who is not a member. */
async function team(accessLevel: 'OPEN' | 'PRIVATE' = 'PRIVATE') {
  const admin = await createUserWithRole('MEMBER')
  const member = await createUserWithRole('MEMBER')
  const orgAdmin = await createUserWithRole('ADMIN')
  const project = await createProject({ accessLevel })
  await prisma.projectMember.createMany({ data: [
    { projectId: project.id, userId: admin.id, role: 'ADMIN' },
    { projectId: project.id, userId: member.id, role: 'MEMBER' },
  ] })
  return { admin, member, orgAdmin, project }
}
const roleOf = async (projectId: string, userId: string) =>
  (await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } }))?.role ?? null
const held = () => prisma.heldSiteInstruction.findMany({ orderBy: { sequence: 'asc' } })

const WAIT = { kind: 'wait' } as const

describe('addProjectMember @SC-593', () => {
  it('refuses a caller who is not signed in, and one who is neither project nor org admin', async () => {
    const { member, project } = await team()
    const newcomer = await createUser()
    await expect(addProjectMember({ projectId: project.id, userId: newcomer.id }, as(null))).rejects.toMatchObject({ statusCode: 401 })
    await expect(addProjectMember({ projectId: project.id, userId: newcomer.id }, as(member))).rejects.toMatchObject({ statusCode: 403 })
    expect(await roleOf(project.id, newcomer.id)).toBeNull()
  })

  it('adds a person as MEMBER by default', async () => {
    const { admin, project } = await team()
    const newcomer = await createUser()
    await addProjectMember({ projectId: project.id, userId: newcomer.id }, as(admin))
    expect(await roleOf(project.id, newcomer.id)).toBe('MEMBER')
  })

  // Re-adding is idempotent; writing the MEMBER default would demote an admin
  // past both the gate and the last-admin check.
  it("re-adding the project's only admin leaves them its admin", async () => {
    const { admin, project } = await team()
    await addProjectMember({ projectId: project.id, userId: admin.id }, as(admin))
    expect(await roleOf(project.id, admin.id)).toBe('ADMIN')
  })

  it('an org admin may add anyone to an open project, and nobody else to a private one they are not in', async () => {
    const open = await team('OPEN')
    const hidden = await team()
    const newcomer = await createUser()
    await addProjectMember({ projectId: open.project.id, userId: newcomer.id }, as(open.orgAdmin))
    await expect(addProjectMember({ projectId: hidden.project.id, userId: newcomer.id }, as(hidden.orgAdmin)))
      .rejects.toMatchObject({ statusCode: 403 })
    expect([await roleOf(open.project.id, newcomer.id), await roleOf(hidden.project.id, newcomer.id)]).toEqual(['MEMBER', null])
  })

  it('an org admin may add themselves to a private project, as its admin', async () => {
    const { orgAdmin, project } = await team()
    await addProjectMember({ projectId: project.id, userId: orgAdmin.id, role: 'ADMIN' }, as(orgAdmin))
    expect(await roleOf(project.id, orgAdmin.id)).toBe('ADMIN')
  })

  it('refuses someone who has left the organisation', async () => {
    const { admin, project } = await team()
    const left = await createUser({ deactivatedAt: new Date() })
    await expect(addProjectMember({ projectId: project.id, userId: left.id }, as(admin))).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('setProjectMemberRole @SC-593', () => {
  it('an org admin may promote and demote in a project they can see, and in no private one they are not in', async () => {
    const open = await team('OPEN')
    await setProjectMemberRole({ projectId: open.project.id, userId: open.member.id, role: 'ADMIN' }, as(open.orgAdmin))
    await setProjectMemberRole({ projectId: open.project.id, userId: open.admin.id, role: 'MEMBER' }, as(open.orgAdmin))
    expect([await roleOf(open.project.id, open.member.id), await roleOf(open.project.id, open.admin.id)]).toEqual(['ADMIN', 'MEMBER'])

    const hidden = await team()
    await expect(setProjectMemberRole({ projectId: hidden.project.id, userId: hidden.member.id, role: 'ADMIN' }, as(hidden.orgAdmin)))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it("the project admin may demote an admin while another remains, and never the last one", async () => {
    const { admin, member, project } = await team()
    await expect(setProjectMemberRole({ projectId: project.id, userId: admin.id, role: 'MEMBER' }, as(admin)))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('without an admin') })

    await setProjectMemberRole({ projectId: project.id, userId: member.id, role: 'ADMIN' }, as(admin))
    await setProjectMemberRole({ projectId: project.id, userId: admin.id, role: 'MEMBER' }, as(member))
    expect(await roleOf(project.id, admin.id)).toBe('MEMBER')
  })

  it("makes a member the project's Viewer (adr-0102): their open tasks here wait for someone else, and only they change @SC-626", async () => {
    const { admin, member, project } = await team()
    const theirs = await makeTask(project.id, { onBehalfOfUserId: member.id })
    const others = await makeTask(project.id, { onBehalfOfUserId: admin.id })
    await setProjectMemberRole({ projectId: project.id, userId: member.id, role: 'VIEWER' }, as(admin))
    expect(await roleOf(project.id, member.id)).toBe('VIEWER')
    expect(await prisma.task.findUniqueOrThrow({ where: { id: theirs.id } }))
      .toMatchObject({ runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON })
    expect((await prisma.task.findUniqueOrThrow({ where: { id: others.id } })).runState).toBe('RUN_NONE')
  })

  it("adds a person as the project's Viewer @SC-626", async () => {
    const { admin, project } = await team()
    const newcomer = await createUser()
    await addProjectMember({ projectId: project.id, userId: newcomer.id, role: 'VIEWER' }, as(admin))
    expect(await roleOf(project.id, newcomer.id)).toBe('VIEWER')
  })

  it('never leaves a project without an admin by making its last admin a Viewer @SC-626', async () => {
    const { admin, project } = await team()
    await expect(setProjectMemberRole({ projectId: project.id, userId: admin.id, role: 'VIEWER' }, as(admin)))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(await roleOf(project.id, admin.id)).toBe('ADMIN')
  })

  it('answers 404 for a person who is not a member, promoting or demoting', async () => {
    const { admin, project } = await team()
    const stranger = await createUser()
    await expect(setProjectMemberRole({ projectId: project.id, userId: stranger.id, role: 'MEMBER' }, as(admin)))
      .rejects.toMatchObject({ statusCode: 404 })
    await expect(setProjectMemberRole({ projectId: project.id, userId: stranger.id, role: 'ADMIN' }, as(admin)))
      .rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('removeProjectMember @SC-593', () => {
  it('404s a person who is not a member, rather than a 500', async () => {
    const { admin, project } = await team()
    const stranger = await createUser()
    await expect(removeProjectMember({ projectId: project.id, userId: stranger.id, openTasks: WAIT }, as(admin))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('takes where their open tasks go as a required choice, and removes nobody without one @SC-594', async () => {
    const { admin, member, project } = await team()
    await expect(removeProjectMember({ projectId: project.id, userId: member.id }, as(admin))).rejects.toMatchObject({ statusCode: 400 })
    expect(await roleOf(project.id, member.id)).toBe('MEMBER')
  })

  it("refuses to remove the project's last admin, naming what to do first", async () => {
    const { admin, project } = await team()
    await expect(removeProjectMember({ projectId: project.id, userId: admin.id, openTasks: WAIT }, as(admin))).rejects.toMatchObject({
      statusCode: 400, message: expect.stringContaining('without an admin'),
    })
    expect(await roleOf(project.id, admin.id)).toBe('ADMIN')
  })

  it('removes an admin while another remains, and a plain member', async () => {
    const { admin, member, project } = await team()
    const second = await createUser()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: second.id, role: 'ADMIN' } })

    await removeProjectMember({ projectId: project.id, userId: second.id, openTasks: WAIT }, as(admin))
    await removeProjectMember({ projectId: project.id, userId: member.id, openTasks: WAIT }, as(admin))

    expect([await roleOf(project.id, second.id), await roleOf(project.id, member.id)]).toEqual([null, null])
  })

  it('an org admin may remove someone from a project they can see, and not from a private one they are not in', async () => {
    const open = await team('OPEN')
    await removeProjectMember({ projectId: open.project.id, userId: open.member.id, openTasks: WAIT }, as(open.orgAdmin))
    expect(await roleOf(open.project.id, open.member.id)).toBeNull()

    const hidden = await team()
    await expect(removeProjectMember({ projectId: hidden.project.id, userId: hidden.member.id, openTasks: WAIT }, as(hidden.orgAdmin)))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(await roleOf(hidden.project.id, hidden.member.id)).toBe('MEMBER')
  })

  it('hands their open tasks to the member chosen, and only to a member', async () => {
    const { admin, member, project } = await team()
    const outsider = await createUser()
    const theirs = await makeTask(project.id, { onBehalfOfUserId: member.id })
    await expect(removeProjectMember({ projectId: project.id, userId: member.id, openTasks: { kind: 'person', userId: outsider.id } }, as(admin)))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(await roleOf(project.id, member.id)).toBe('MEMBER')

    await removeProjectMember({ projectId: project.id, userId: member.id, openTasks: { kind: 'person', userId: admin.id } }, as(admin))
    expect(await prisma.task.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ onBehalfOfUserId: admin.id, runState: 'RUN_NONE' })
  })
})

describe('setProjectAccessLevel @SC-594', () => {
  it("is the project admin's alone, never the org admin's", async () => {
    const { admin, orgAdmin, project } = await team('OPEN')
    await expect(setProjectAccessLevel({ projectId: project.id, accessLevel: 'PRIVATE' }, as(orgAdmin))).rejects.toMatchObject({ statusCode: 403 })
    await setProjectAccessLevel({ projectId: project.id, accessLevel: 'PRIVATE' }, as(admin))
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).accessLevel).toBe('PRIVATE')
  })

  it('refuses a caller who is not signed in', async () => {
    const { project } = await team()
    await expect(setProjectAccessLevel({ projectId: project.id, accessLevel: 'OPEN' }, as(null))).rejects.toMatchObject({ statusCode: 401 })
  })

  // adr-0099: who may act is the member list either way.
  it("ends nobody's access, either way", async () => {
    const { admin, member, project } = await team('OPEN')
    const membersTask = await makeTask(project.id, { onBehalfOfUserId: member.id })
    await setProjectAccessLevel({ projectId: project.id, accessLevel: 'PRIVATE' }, as(admin))
    await setProjectAccessLevel({ projectId: project.id, accessLevel: 'OPEN' }, as(admin))
    expect(await prisma.heldSiteInstruction.count()).toBe(0)
    expect((await prisma.task.findUniqueOrThrow({ where: { id: membersTask.id } })).runState).toBe('RUN_NONE')
  })
})

// Person-scoped execution spec §4, "When membership ends"; adr-0089, adr-0099.
describe("ending someone's access @SC-595", () => {
  it.each(['PRIVATE', 'OPEN'] as const)('removing a member of a %s project holds memberLeftProject for each site holding their home, and leaves their tasks waiting', async (level) => {
    const { admin, member, project } = await team(level)
    const theirs = await makeTask(project.id, { onBehalfOfUserId: member.id })
    await createSession({ userId: member.id, agentId: (await createAgent()).id, primaryOwnerType: 'project', primaryOwnerId: project.id })

    await removeProjectMember({ projectId: project.id, userId: member.id, openTasks: WAIT }, as(admin))

    const rows = await held()
    expect(rows.map((r) => r.siteId)).toEqual([SITE])
    expect(rows[0]).toMatchObject({ method: MEMBERSHIP_METHODS.memberLeftProject, acknowledgedAt: null })
    expect(rows[0].params).toMatchObject({ userId: member.id, projectId: project.id, instructionId: rows[0].id })
    expect(await prisma.task.findUniqueOrThrow({ where: { id: theirs.id } }))
      .toMatchObject({ runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON })
  })

  it('succeeds when the site is slow to take it — the instruction stays held for its reconnect', async () => {
    const { admin, member, project } = await team()
    channel.isOnline.mockReturnValue(true)
    const reads = vi.spyOn(prisma.heldSiteInstruction, 'findMany').mockReturnValue(new Promise(() => {}) as never)
    await expect(removeProjectMember({ projectId: project.id, userId: member.id, openTasks: WAIT }, as(admin))).resolves.toMatchObject({ userId: member.id })
    reads.mockRestore()
    expect(await prisma.heldSiteInstruction.count()).toBe(1)
  })

  it('a removal that fails holds nothing and blocks nothing', async () => {
    const { admin, member, project } = await team()
    const theirs = await makeTask(project.id, { onBehalfOfUserId: member.id })
    const tx = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('constraint'))
    await expect(removeProjectMember({ projectId: project.id, userId: member.id, openTasks: WAIT }, as(admin))).rejects.toThrow('constraint')
    tx.mockRestore()
    expect(await prisma.heldSiteInstruction.count()).toBe(0)
    expect((await prisma.task.findUniqueOrThrow({ where: { id: theirs.id } })).runState).toBe('RUN_NONE')
  })
})

// adr-0099: anyone in the organisation joins an open project in one step.
describe('joinProject and leaveProject @SC-591', () => {
  it("never promotes a Viewer who asks to join again: joining keeps the role they have", async () => {
    const { project } = await team('OPEN')
    const viewer = await createUser()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: viewer.id, role: 'VIEWER' } })
    await joinProject({ projectId: project.id }, as(viewer))
    expect(await roleOf(project.id, viewer.id)).toBe('VIEWER')
  })

  it('joins an open project as a Member, once however often asked', async () => {
    const { project } = await team('OPEN')
    const newcomer = await createUser()
    await joinProject({ projectId: project.id }, as(newcomer))
    await joinProject({ projectId: project.id }, as(newcomer))
    expect(await roleOf(project.id, newcomer.id)).toBe('MEMBER')
  })

  it("answers a private project, or someone's own, as missing", async () => {
    const { project } = await team()
    const owner = await createUser()
    const personal = await createProject({ personalOwnerId: owner.id })
    const newcomer = await createUser()
    await expect(joinProject({ projectId: project.id }, as(newcomer))).rejects.toMatchObject({ statusCode: 404 })
    await expect(joinProject({ projectId: personal.id }, as(newcomer))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('leaves, with their open tasks waiting; never as the last admin', async () => {
    const { admin, member, project } = await team('OPEN')
    const theirs = await makeTask(project.id, { onBehalfOfUserId: member.id })
    await expect(leaveProject({ projectId: project.id }, as(admin))).rejects.toMatchObject({ statusCode: 400 })
    await leaveProject({ projectId: project.id }, as(member))
    expect(await roleOf(project.id, member.id)).toBeNull()
    expect((await prisma.task.findUniqueOrThrow({ where: { id: theirs.id } })).runStateReason).toBe(LOST_ACCESS_REASON)
  })
})

// Agents own schedule spec §4: exactly one member, its owner, for good — refused
// for its own admin (the owner) and an org admin alike.
describe('a personal project keeps exactly one member @SC-595', () => {
  async function personal() {
    const owner = await createUserWithRole('MEMBER')
    const orgAdmin = await createUserWithRole('ADMIN')
    const project = await createProject({ accessLevel: 'PRIVATE', personalOwnerId: owner.id })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id, role: 'ADMIN' } })
    return { owner, orgAdmin, project }
  }

  it('refuses adding anyone, an org admin adding themselves included', async () => {
    const { orgAdmin, project } = await personal()
    await expect(addProjectMember({ projectId: project.id, userId: orgAdmin.id }, as(orgAdmin))).rejects.toMatchObject({ statusCode: 400 })
    expect(await roleOf(project.id, orgAdmin.id)).toBeNull()
  })

  it("refuses changing its member's role either way, its owner leaving it, and changing its access level", async () => {
    const { owner, orgAdmin, project } = await personal()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: orgAdmin.id, role: 'ADMIN' } }) // so no last-admin rule answers first
    await expect(setProjectMemberRole({ projectId: project.id, userId: owner.id, role: 'MEMBER' }, as(owner))).rejects.toMatchObject({ statusCode: 400 })
    await expect(setProjectMemberRole({ projectId: project.id, userId: owner.id, role: 'ADMIN' }, as(orgAdmin))).rejects.toMatchObject({ statusCode: 400 })
    await expect(removeProjectMember({ projectId: project.id, userId: owner.id, openTasks: WAIT }, as(owner))).rejects.toMatchObject({ statusCode: 400 })
    await expect(setProjectAccessLevel({ projectId: project.id, accessLevel: 'OPEN' }, as(owner))).rejects.toMatchObject({ statusCode: 400 })

    expect(await roleOf(project.id, owner.id)).toBe('ADMIN')
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).accessLevel).toBe('PRIVATE')
  })
})

describe('the members operations refuse a malformed request with a 400, never a 500', () => {
  it('names the project or person that is missing', async () => {
    const { admin, member, project } = await team()
    const noProject = { message: 'A project id is required', statusCode: 400 }
    await expect(addProjectMember({ userId: member.id } as never, as(admin))).rejects.toMatchObject(noProject)
    await expect(setProjectMemberRole({ userId: member.id, role: 'MEMBER' } as never, as(admin))).rejects.toMatchObject(noProject)
    await expect(joinProject({} as never, as(admin))).rejects.toMatchObject(noProject)
    await expect(leaveProject({} as never, as(admin))).rejects.toMatchObject(noProject)
    await expect(setProjectAccessLevel({ accessLevel: 'OPEN' } as never, as(admin))).rejects.toMatchObject(noProject)
    await expect(addProjectMember({ projectId: project.id } as never, as(admin))).rejects.toMatchObject({ statusCode: 400, message: 'A person id is required' })
  })

  it('refuses a role or an access level that is not one of the values', async () => {
    const { admin, member, project } = await team()
    const newcomer = await createUser()
    await expect(addProjectMember({ projectId: project.id, userId: newcomer.id, role: 'OWNER' as never }, as(admin))).rejects.toMatchObject({ statusCode: 400 })
    await expect(setProjectMemberRole({ projectId: project.id, userId: member.id, role: 'OWNER' as never }, as(admin))).rejects.toMatchObject({ statusCode: 400 })
    await expect(setProjectAccessLevel({ projectId: project.id, accessLevel: 'SECRET' as never }, as(admin))).rejects.toMatchObject({ statusCode: 400 })
  })
})
