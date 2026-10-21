/**
 * The membership rules every project operation reaches its resources through
 * (spec §6.4, SC-397, adr-0099), against the real test DB: who belongs to a
 * project — its member list, open or private — who administers it, how a task
 * or board resolves to its project, and that what a caller may not see answers
 * exactly as what does not exist.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createProject } from '../../test/factories'
import { makeBoard, makeTask } from './projectsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import {
  isProjectMember, entitledProjectsFilter, visibleProjectsFilter, isProjectVisibleTo, requireProjectMember,
  requireProjectAdmin, mayManageProjectPeople, projectsLeftWithoutAnAdmin,
  projectStanding, mayWorkInProject, requireMayWorkInProject,
} from '../membership'
import {
  requireTaskAccess, requireBoardAccess, projectOfTask, requireTaskVisible, requireBoardVisible, requireProjectVisible, canSeeTask,
} from '../resourceEntitlement'

async function privateWith(memberRole: 'ADMIN' | 'MEMBER' | 'VIEWER' = 'MEMBER') {
  const member = await createUser()
  const outsider = await createUserWithRole('ADMIN')
  const project = await createProject({ accessLevel: 'PRIVATE' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id, role: memberRole } })
  const task = await makeTask(project.id)
  const board = await makeBoard(project.id)
  return { member, outsider, project, task, board }
}

describe('isProjectMember @SC-588', () => {
  it('is true only for a listed person when the project is open, as when it is private', async () => {
    const project = await createProject({ accessLevel: 'OPEN' })
    const member = await createUser()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id } })
    expect(await isProjectMember(project.id, member.id)).toBe(true)
    expect(await isProjectMember(project.id, (await createUser()).id)).toBe(false)
  })

  it('is true for a listed person and false for anyone else, an org admin included, when it is private', async () => {
    const { member, outsider, project } = await privateWith()
    expect(await isProjectMember(project.id, member.id)).toBe(true)
    expect(await isProjectMember(project.id, outsider.id)).toBe(false)
  })

  it('is false when the project does not exist', async () => {
    expect(await isProjectMember('nope', (await createUser()).id)).toBe(false)
  })

  // Agents own schedule spec §4.
  it('is true for a personal project\'s owner alone, whatever its access level or member rows say', async () => {
    const owner = await createUser()
    const withARow = await createUser()
    const project = await createProject({ accessLevel: 'OPEN', personalOwnerId: owner.id })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: withARow.id, role: 'ADMIN' } })
    expect(await isProjectMember(project.id, owner.id)).toBe(true)
    expect(await isProjectMember(project.id, withARow.id)).toBe(false)
  })

  // adr-0100: a person who has left can no longer act, even in their own space.
  it("is false for a personal project's owner once they have left", async () => {
    const owner = await createUser({ deactivatedAt: new Date() })
    const project = await createProject({ personalOwnerId: owner.id })
    expect(await isProjectMember(project.id, owner.id)).toBe(false)
  })
})

describe('isProjectVisibleTo @SC-588', () => {
  it('shows an open project to anyone, and a private one to its members only', async () => {
    const { member, outsider, project: hidden } = await privateWith()
    const open = await createProject({ accessLevel: 'OPEN' })
    expect(await isProjectVisibleTo(open.id, outsider.id)).toBe(true)
    expect(await isProjectVisibleTo(hidden.id, member.id)).toBe(true)
    expect(await isProjectVisibleTo(hidden.id, outsider.id)).toBe(false)
  })

  it("never shows someone else's personal project, whatever its access level", async () => {
    const theirs = await createProject({ accessLevel: 'OPEN', personalOwnerId: (await createUser()).id })
    expect(await isProjectVisibleTo(theirs.id, (await createUser()).id)).toBe(false)
  })
})

describe('entitledProjectsFilter and visibleProjectsFilter @SC-588', () => {
  it("entitled selects the listed projects that are not personal, and the person's own personal project", async () => {
    const me = await createUser()
    const someone = await createUser()
    const open = await createProject({ accessLevel: 'OPEN' })
    const listed = await createProject({ accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: listed.id, userId: me.id } })
    await createProject({ accessLevel: 'PRIVATE' })
    const mine = await createProject({ personalOwnerId: me.id })
    const theirs = await createProject({ accessLevel: 'OPEN', personalOwnerId: someone.id })
    await prisma.projectMember.create({ data: { projectId: theirs.id, userId: me.id } })

    const found = await prisma.project.findMany({ where: entitledProjectsFilter(me.id), select: { id: true } })
    const visible = await prisma.project.findMany({ where: visibleProjectsFilter(me.id), select: { id: true } })

    expect(found.map((p) => p.id).sort()).toEqual([listed.id, mine.id].sort())
    expect(visible.map((p) => p.id).sort()).toEqual([open.id, listed.id, mine.id].sort())
  })
})

describe('requireProjectMember, requireProjectAdmin and mayManageProjectPeople @SC-589', () => {
  it('requireProjectMember throws 403 naming the act for someone not entitled, and passes a member', async () => {
    const { member, outsider, project } = await privateWith()
    await expect(requireProjectMember(project.id, outsider.id, 'Reading this project'))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('Reading this project') })
    await expect(requireProjectMember(project.id, member.id, 'Reading this project')).resolves.toBeUndefined()
  })

  it("requireProjectAdmin passes the project's admin and refuses a plain member and an org admin who is not its admin", async () => {
    const { member: admin, outsider: orgAdmin, project } = await privateWith('ADMIN')
    const plain = await createUser()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: plain.id } })
    await expect(requireProjectAdmin(project.id, admin.id, 'Changing this project')).resolves.toBeUndefined()
    await expect(requireProjectAdmin(project.id, plain.id, 'Changing this project')).rejects.toMatchObject({ statusCode: 403 })
    await expect(requireProjectAdmin(project.id, orgAdmin.id, 'Changing this project')).rejects.toMatchObject({ statusCode: 403 })
  })

  it("mayManageProjectPeople passes the project's admin, and an org admin only in a project they can see", async () => {
    const { member: admin, outsider: orgAdmin, project: hidden } = await privateWith('ADMIN')
    const operator = await createUserWithRole('MEMBER')
    const open = await createProject({ accessLevel: 'OPEN' })
    const joined = await createProject({ accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: joined.id, userId: orgAdmin.id } })
    const personal = await createProject({ personalOwnerId: orgAdmin.id })
    expect(await mayManageProjectPeople(hidden.id, admin.id)).toBe(true)
    expect(await mayManageProjectPeople(hidden.id, orgAdmin.id)).toBe(false)
    expect(await mayManageProjectPeople(open.id, orgAdmin.id)).toBe(true)
    expect(await mayManageProjectPeople(joined.id, orgAdmin.id)).toBe(true)
    expect(await mayManageProjectPeople(personal.id, orgAdmin.id)).toBe(false)
    expect(await mayManageProjectPeople(open.id, operator.id)).toBe(false)
  })
})

describe('projectsLeftWithoutAnAdmin @SC-593', () => {
  it('names a project whose only admin is this person, and not one where another admin remains', async () => {
    const me = await createUser()
    const other = await createUser()
    const alone = await createProject({ name: 'Website', key: 'WEB' })
    const shared = await createProject()
    await prisma.projectMember.createMany({ data: [
      { projectId: alone.id, userId: me.id, role: 'ADMIN' },
      { projectId: shared.id, userId: me.id, role: 'ADMIN' },
      { projectId: shared.id, userId: other.id, role: 'ADMIN' },
    ] })
    expect(await projectsLeftWithoutAnAdmin(me.id)).toEqual([{ id: alone.id, name: 'Website', key: 'WEB' }])
  })

  it('never counts a personal project, which goes with its person, and names nothing for someone who administers none', async () => {
    const me = await createUser()
    const personal = await createProject({ personalOwnerId: me.id })
    await prisma.projectMember.create({ data: { projectId: personal.id, userId: me.id, role: 'ADMIN' } })
    expect(await projectsLeftWithoutAnAdmin(me.id)).toEqual([])
    expect(await projectsLeftWithoutAnAdmin((await createUser()).id)).toEqual([])
  })
})

describe('a resource is reached through the project that owns it @SC-589', () => {
  it('returns the project id to a member of a private project, and refuses anyone else', async () => {
    const { member, outsider, project, task, board } = await privateWith()
    expect(await requireTaskAccess(task.id, member.id, 'Reading this task')).toBe(project.id)
    expect(await requireBoardAccess(board.id, member.id, 'Reading this board')).toBe(project.id)
    await expect(requireTaskAccess(task.id, outsider.id, 'Reading this task')).rejects.toMatchObject({ statusCode: 403 })
    await expect(requireBoardAccess(board.id, outsider.id, 'Reading this board')).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses someone who has not joined an open project', async () => {
    const project = await createProject({ accessLevel: 'OPEN' })
    const task = await makeTask(project.id)
    await expect(requireTaskAccess(task.id, (await createUser()).id, 'Reading this task')).rejects.toMatchObject({ statusCode: 403 })
    await expect(requireTaskVisible(task.id, (await createUser()).id)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('reports an absent task as 404, before any membership question', async () => {
    await expect(projectOfTask('gone')).rejects.toMatchObject({ statusCode: 404 })
  })
})

// SC-397: what a caller may not see answers as what does not exist.
describe('a read of something the caller may not see answers as a missing thing @SC-589', () => {
  it('returns the project id to a member', async () => {
    const { member, project, task, board } = await privateWith()
    expect(await requireTaskVisible(task.id, member.id)).toBe(project.id)
    expect(await requireBoardVisible(board.id, member.id)).toBe(project.id)
    await expect(requireProjectVisible(project.id, member.id)).resolves.toBeUndefined()
    expect(await canSeeTask(task.id, member.id)).toBe(true)
  })

  it('answers a non-member 404 with the same message as an absent task, board and project', async () => {
    const { outsider, project, task, board } = await privateWith()
    const hidden = [
      await requireTaskVisible(task.id, outsider.id).catch((e: Error) => e),
      await requireBoardVisible(board.id, outsider.id).catch((e: Error) => e),
      await requireProjectVisible(project.id, outsider.id).catch((e: Error) => e),
    ]
    const missing = [
      await requireTaskVisible('gone', outsider.id).catch((e: Error) => e),
      await requireBoardVisible('gone', outsider.id).catch((e: Error) => e),
      await requireProjectVisible('gone', outsider.id).catch((e: Error) => e),
    ]
    expect(await canSeeTask(task.id, outsider.id)).toBe(false)
    expect(hidden.map((e) => (e as Error).message)).toEqual(['Task not found', 'Board not found', 'Project not found'])
    expect(missing.map((e) => (e as Error).message)).toEqual(['Task not found', 'Board not found', 'Project not found'])
    for (const e of [...hidden, ...missing]) expect(e).toMatchObject({ statusCode: 404 })
  })

  it('uses the wording the caller supplies, for hidden and absent alike', async () => {
    const { outsider, task } = await privateWith()
    await expect(requireTaskVisible(task.id, outsider.id, 'Session not found')).rejects.toMatchObject({ statusCode: 404, message: 'Session not found' })
    await expect(requireTaskVisible('gone', outsider.id, 'Session not found')).rejects.toMatchObject({ statusCode: 404, message: 'Session not found' })
  })
})

describe('a project Viewer reads and works in nothing (adr-0102) @SC-625', () => {
  it('a Viewer reads the project but may not work in it; a Member and an Admin may', async () => {
    for (const [role, standing] of [['VIEWER', 'reads'], ['MEMBER', 'works'], ['ADMIN', 'works']] as const) {
      const { member, project } = await privateWith(role)
      expect(await projectStanding(project.id, member.id)).toBe(standing)
      expect(await isProjectMember(project.id, member.id)).toBe(true)
      expect(await mayWorkInProject(project.id, member.id)).toBe(standing === 'works')
    }
  })

  it("an organisation role grants nothing: an org admin who is a project's Viewer may not work in it", async () => {
    const admin = await createUserWithRole('ADMIN')
    const project = await createProject({ accessLevel: 'OPEN' })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: admin.id, role: 'VIEWER' } })
    expect(await mayWorkInProject(project.id, admin.id)).toBe(false)
  })

  it("a person's own Chat is theirs to work in, whatever their organisation role", async () => {
    const owner = await createUserWithRole('MEMBER')
    const project = await createProject({ personalOwnerId: owner.id })
    expect(await mayWorkInProject(project.id, owner.id)).toBe(true)
  })

  it('requireMayWorkInProject refuses a Viewer saying so, a non-member as before, and passes a Member', async () => {
    const { member: viewer, project, task, board } = await privateWith('VIEWER')
    await expect(requireMayWorkInProject(project.id, viewer.id, 'Changing this task')).rejects.toMatchObject({
      statusCode: 403, message: expect.stringContaining('A Viewer reads this project and changes nothing'),
    })
    await expect(requireTaskAccess(task.id, viewer.id, 'Changing this task')).rejects.toMatchObject({ statusCode: 403 })
    await expect(requireBoardAccess(board.id, viewer.id, 'Changing this board')).rejects.toMatchObject({ statusCode: 403 })
    await expect(requireMayWorkInProject(project.id, (await createUser()).id, 'Changing this task')).rejects.toMatchObject({
      statusCode: 403, message: expect.stringContaining('requires membership of this project'),
    })
    const member = await createUser()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id, role: 'MEMBER' } })
    await expect(requireMayWorkInProject(project.id, member.id, 'Changing this task')).resolves.toBeUndefined()
  })

  it('a Viewer still reads its tasks and boards', async () => {
    const { member: viewer, project, task, board } = await privateWith('VIEWER')
    expect(await requireTaskVisible(task.id, viewer.id)).toBe(project.id)
    expect(await requireBoardVisible(board.id, viewer.id)).toBe(project.id)
  })
})
