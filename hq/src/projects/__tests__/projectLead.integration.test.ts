/**
 * A project's lead (every screen reviewed spec §9), against the real test
 * database: an optional member of the project, set by its admin, shown in the
 * project's data, and carrying no rights of its own.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser } from '../../test/factories'
import { ctx } from './projectsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { setProjectLead } from '../projectLead'
import { getProject, getProjectByKey } from '../queries'
import { requireProjectAdmin } from '../membership'

async function privateProject() {
  const admin = await createUser()
  const member = await createUser()
  const outsider = await createUser()
  const project = await createProject({ accessLevel: 'PRIVATE', key: 'LEAD' })
  await prisma.projectMember.createMany({
    data: [
      { projectId: project.id, userId: admin.id, role: 'ADMIN' },
      { projectId: project.id, userId: member.id, role: 'MEMBER' },
    ],
  })
  return { admin, member, outsider, project }
}

describe('setProjectLead @SC-502', () => {
  it("lets a project admin make a member the lead, and the project's data names them", async () => {
    const { admin, member, project } = await privateProject()

    await setProjectLead({ projectId: project.id, userId: member.id }, ctx(admin))

    const shown = await getProject({ projectId: project.id }, ctx(member))
    expect(shown.lead).toMatchObject({ userId: member.id, username: member.id.slice(0, 8), person: { userId: member.id, state: 'active' } })
    expect((await getProjectByKey({ key: 'LEAD' }, ctx(member))).lead).toEqual(shown.lead)
  })

  it('clears the lead', async () => {
    const { admin, member, project } = await privateProject()
    await setProjectLead({ projectId: project.id, userId: member.id }, ctx(admin))

    await setProjectLead({ projectId: project.id, userId: null }, ctx(admin))

    expect((await getProject({ projectId: project.id }, ctx(admin))).lead).toBeNull()
  })

  it('refuses a person who is not a member of a private project', async () => {
    const { admin, outsider, project } = await privateProject()
    await expect(setProjectLead({ projectId: project.id, userId: outsider.id }, ctx(admin))).rejects.toMatchObject({ statusCode: 400 })
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).leadUserId).toBeNull()
  })

  it('refuses a person in the organisation who has not joined an open project, and accepts them once they have (adr-0099)', async () => {
    const admin = await createUser()
    const anyone = await createUser()
    const project = await createProject({ accessLevel: 'OPEN' })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: admin.id, role: 'ADMIN' } })

    await expect(setProjectLead({ projectId: project.id, userId: anyone.id }, ctx(admin))).rejects.toMatchObject({ statusCode: 400 })
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).leadUserId).toBeNull()

    await prisma.projectMember.create({ data: { projectId: project.id, userId: anyone.id, role: 'MEMBER' } })
    await setProjectLead({ projectId: project.id, userId: anyone.id }, ctx(admin))

    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).leadUserId).toBe(anyone.id)
  })

  it('refuses a member who is not a project admin', async () => {
    const { member, project } = await privateProject()
    await expect(setProjectLead({ projectId: project.id, userId: member.id }, ctx(member))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses a personal project, which has no one else to lead it', async () => {
    const owner = await createUser()
    const project = await createProject({ accessLevel: 'PRIVATE', personalOwnerId: owner.id })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: owner.id, role: 'ADMIN' } })
    await expect(setProjectLead({ projectId: project.id, userId: owner.id }, ctx(owner))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('refuses a caller who is not signed in', async () => {
    const { member, project } = await privateProject()
    await expect(setProjectLead({ projectId: project.id, userId: member.id }, ctx(null))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('gives the lead no rights of their own', async () => {
    const { admin, member, project } = await privateProject()
    await setProjectLead({ projectId: project.id, userId: member.id }, ctx(admin))
    await expect(requireProjectAdmin(project.id, member.id, 'Changing this project')).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe("the lead in a project's data @SC-502", () => {
  it('is not shown once the lead is no longer a member', async () => {
    const { admin, member, project } = await privateProject()
    await setProjectLead({ projectId: project.id, userId: member.id }, ctx(admin))
    await prisma.projectMember.delete({ where: { projectId_userId: { projectId: project.id, userId: member.id } } })

    expect((await getProject({ projectId: project.id }, ctx(admin))).lead).toBeNull()
  })

  it('is cleared when the person is removed from the organisation', async () => {
    const { admin, member, project } = await privateProject()
    await setProjectLead({ projectId: project.id, userId: member.id }, ctx(admin))
    await prisma.projectMember.deleteMany({ where: { userId: member.id } })
    await prisma.user.delete({ where: { id: member.id } })

    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).leadUserId).toBeNull()
  })
})
