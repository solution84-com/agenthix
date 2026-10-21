/**
 * A team joins a project as one member, written through to its members
 * (adr-0103), against the real test database. Every access check keeps reading
 * ProjectMember and ProjectAgent, so each case checks those rows and what the
 * checks themselves answer: adding, removing, overlap with someone's own
 * membership and with a second team, the higher role applying, and a Viewer
 * team. A team's own changes: teamChanges.integration.test.ts. No site is
 * connected, so held instructions stay held.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createUser, createUserWithRole, createAgent, createProject, createSession, ensureExecutionSite } from '../../../test/factories'
import { as, WAIT, setting, makeTeam, rowOf, agentRowOf } from './teamHarness'
import { makeTask } from '../../../projects/__tests__/projectsHarness'

const channel = vi.hoisted(() => ({ isOnline: vi.fn(), request: vi.fn() }))
vi.mock('../../../sites/channel', () => ({ siteChannelRegistry: channel }))
vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../server/dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../../agents/dispatchService', () => import('../../../test/fakes/dispatchService'))
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))
vi.mock('../../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { addTeamToProject, removeTeamFromProject, setProjectTeamRole } from '../projectTeamActions'
import { addProjectMember } from '../../../projects/memberActions'
import { isProjectMember, mayWorkInProject, projectRole } from '../../../projects/membership'

beforeEach(async () => {
  channel.isOnline.mockReset().mockReturnValue(false)
  await ensureExecutionSite({ siteId: 'site-1' })
})

describe('adding a team to a project @SC-671', () => {
  it("writes each of its people in with the team's role and each agent in, marked as there through the team", async () => {
    const { projectAdmin, orgAdmin, project } = await setting()
    const dana = await createUser()
    const writer = await createAgent()
    const team = await makeTeam(orgAdmin, [dana], [writer])

    await addTeamToProject({ projectId: project.id, teamId: team.id, role: 'MEMBER' }, as(projectAdmin))

    expect(await rowOf(project.id, dana.id)).toEqual({ role: 'MEMBER', direct: false, ownRole: null })
    expect(await agentRowOf(project.id, writer.id)).toEqual({ direct: false })
    // The access checks read those rows as they always have.
    expect(await isProjectMember(project.id, dana.id)).toBe(true)
    expect(await mayWorkInProject(project.id, dana.id)).toBe(true)
    expect(await prisma.projectTeam.findUniqueOrThrow({ where: { projectId_teamId: { projectId: project.id, teamId: team.id } } }))
      .toMatchObject({ role: 'MEMBER', addedById: projectAdmin.id })
  })

  it('a Viewer team lets its people read the project and change nothing', async () => {
    const { projectAdmin, orgAdmin, project } = await setting()
    const dana = await createUser()
    const team = await makeTeam(orgAdmin, [dana])

    await addTeamToProject({ projectId: project.id, teamId: team.id, role: 'VIEWER' }, as(projectAdmin))

    expect(await projectRole(project.id, dana.id)).toBe('VIEWER')
    expect(await isProjectMember(project.id, dana.id)).toBe(true)
    expect(await mayWorkInProject(project.id, dana.id)).toBe(false)
  })

  it('makes its first agent the default of a project that has none', async () => {
    const { projectAdmin, orgAdmin, project } = await setting()
    const writer = await createAgent()
    const team = await makeTeam(orgAdmin, [], [writer])
    await addTeamToProject({ projectId: project.id, teamId: team.id }, as(projectAdmin))
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).defaultAgentId).toBe(writer.id)
  })

  it('never writes in someone who has left the organisation', async () => {
    const { projectAdmin, orgAdmin, project } = await setting()
    const dana = await createUser()
    const team = await makeTeam(orgAdmin, [dana])
    await prisma.user.update({ where: { id: dana.id }, data: { deactivatedAt: new Date() } })

    await addTeamToProject({ projectId: project.id, teamId: team.id }, as(projectAdmin))

    expect(await rowOf(project.id, dana.id)).toBeNull()
    expect(await isProjectMember(project.id, dana.id)).toBe(false)
  })

  it("is refused to whoever may not change the project's people, and changes nothing", async () => {
    const { orgAdmin, project } = await setting()
    const member = await createUserWithRole('MEMBER')
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id, role: 'MEMBER' } })
    const outsiderAdmin = await createUserWithRole('ADMIN')
    const dana = await createUser()
    const team = await makeTeam(orgAdmin, [dana])

    await expect(addTeamToProject({ projectId: project.id, teamId: team.id }, as(null))).rejects.toMatchObject({ statusCode: 401 })
    await expect(addTeamToProject({ projectId: project.id, teamId: team.id }, as(member))).rejects.toMatchObject({ statusCode: 403 })
    // An org admin cannot reach a private project they are not in by way of a team.
    await expect(addTeamToProject({ projectId: project.id, teamId: team.id }, as(outsiderAdmin))).rejects.toMatchObject({ statusCode: 403 })
    expect(await rowOf(project.id, dana.id)).toBeNull()
    expect(await prisma.projectTeam.count()).toBe(0)
  })

  it("refuses a person's own project", async () => {
    const owner = await createUserWithRole('ADMIN')
    const own = await createProject({ personalOwnerId: owner.id })
    await prisma.projectMember.create({ data: { projectId: own.id, userId: owner.id, role: 'ADMIN' } })
    const team = await makeTeam(owner, [await createUser()])
    await expect(addTeamToProject({ projectId: own.id, teamId: team.id }, as(owner))).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('overlap with membership in their own right and with a second team @SC-672', () => {
  it('applies the higher role, and taking the team away gives back exactly their own', async () => {
    const { projectAdmin, orgAdmin, project } = await setting()
    const sam = await createUser()
    await addProjectMember({ projectId: project.id, userId: sam.id, role: 'MEMBER' }, as(projectAdmin))
    const team = await makeTeam(orgAdmin, [sam])

    await addTeamToProject({ projectId: project.id, teamId: team.id, role: 'ADMIN' }, as(projectAdmin))
    expect(await rowOf(project.id, sam.id)).toEqual({ role: 'ADMIN', direct: true, ownRole: 'MEMBER' })

    await removeTeamFromProject({ projectId: project.id, teamId: team.id, openTasks: WAIT, agentOpenTasksTo: null }, as(projectAdmin))
    expect(await rowOf(project.id, sam.id)).toEqual({ role: 'MEMBER', direct: true, ownRole: null })
  })

  it("keeps someone's own higher role over a Viewer team's", async () => {
    const { projectAdmin, orgAdmin, project } = await setting()
    const team = await makeTeam(orgAdmin, [projectAdmin])
    await addTeamToProject({ projectId: project.id, teamId: team.id, role: 'VIEWER' }, as(projectAdmin))
    expect(await rowOf(project.id, projectAdmin.id)).toEqual({ role: 'ADMIN', direct: true, ownRole: 'ADMIN' })
    expect(await mayWorkInProject(project.id, projectAdmin.id)).toBe(true)
  })

  it('removing one team leaves someone there through another, with that team\'s role', async () => {
    const { projectAdmin, orgAdmin, project } = await setting()
    const dana = await createUser()
    const marketing = await makeTeam(orgAdmin, [dana], [], 'Marketing')
    const support = await makeTeam(orgAdmin, [dana], [], 'Support')
    await addTeamToProject({ projectId: project.id, teamId: marketing.id, role: 'MEMBER' }, as(projectAdmin))
    await addTeamToProject({ projectId: project.id, teamId: support.id, role: 'VIEWER' }, as(projectAdmin))
    expect((await rowOf(project.id, dana.id))?.role).toBe('MEMBER')

    await removeTeamFromProject({ projectId: project.id, teamId: marketing.id, openTasks: WAIT, agentOpenTasksTo: null }, as(projectAdmin))

    expect(await rowOf(project.id, dana.id)).toEqual({ role: 'VIEWER', direct: false, ownRole: null })
    expect(await mayWorkInProject(project.id, dana.id)).toBe(false)
  })

  it("changing a team's role changes its people's, under anyone's own higher role", async () => {
    const { projectAdmin, orgAdmin, project } = await setting()
    const dana = await createUser()
    const team = await makeTeam(orgAdmin, [dana, projectAdmin])
    await addTeamToProject({ projectId: project.id, teamId: team.id, role: 'MEMBER' }, as(projectAdmin))

    await setProjectTeamRole({ projectId: project.id, teamId: team.id, role: 'VIEWER' }, as(projectAdmin))

    expect((await rowOf(project.id, dana.id))?.role).toBe('VIEWER')
    expect((await rowOf(project.id, projectAdmin.id))?.role).toBe('ADMIN')
  })
})

describe('removing a team from a project @SC-675', () => {
  it('removes everyone there only through it, after the required choice for their open tasks', async () => {
    const { projectAdmin, orgAdmin, project } = await setting()
    const dana = await createUser()
    const writer = await createAgent()
    const keeper = await createAgent()
    // Assigned first, so it is the project's default (as addAgentToProject makes it) and the team's agent is not.
    await prisma.projectAgent.create({ data: { projectId: project.id, agentId: keeper.id } })
    await prisma.project.update({ where: { id: project.id }, data: { defaultAgentId: keeper.id } })
    const team = await makeTeam(orgAdmin, [dana], [writer])
    await addTeamToProject({ projectId: project.id, teamId: team.id }, as(projectAdmin))
    const hers = await makeTask(project.id, { onBehalfOfUserId: dana.id })
    const its = await makeTask(project.id, { onBehalfOfUserId: projectAdmin.id, assignedAgentId: writer.id })

    // No choice, no change.
    await expect(removeTeamFromProject({ projectId: project.id, teamId: team.id }, as(projectAdmin))).rejects.toMatchObject({ statusCode: 400 })
    await expect(removeTeamFromProject({ projectId: project.id, teamId: team.id, openTasks: WAIT }, as(projectAdmin))).rejects.toMatchObject({ statusCode: 400 })
    expect(await rowOf(project.id, dana.id)).not.toBeNull()

    const result = await removeTeamFromProject({
      projectId: project.id, teamId: team.id,
      openTasks: { kind: 'person', userId: projectAdmin.id }, agentOpenTasksTo: keeper.id,
    }, as(projectAdmin))

    expect(result.left).toEqual({ people: [dana.id], agents: [writer.id] })
    expect(await rowOf(project.id, dana.id)).toBeNull()
    expect(await isProjectMember(project.id, dana.id)).toBe(false)
    expect(await agentRowOf(project.id, writer.id)).toBeNull()
    expect((await prisma.task.findUniqueOrThrow({ where: { id: hers.id } })).onBehalfOfUserId).toBe(projectAdmin.id)
    expect((await prisma.task.findUniqueOrThrow({ where: { id: its.id } })).assignedAgentId).toBe(keeper.id)
    expect(await prisma.projectTeam.count()).toBe(0)
  })

  it('refuses giving their open tasks to someone who is leaving with them, and changes nothing', async () => {
    const { projectAdmin, orgAdmin, project } = await setting()
    const dana = await createUser()
    const lee = await createUser()
    const team = await makeTeam(orgAdmin, [dana, lee])
    await addTeamToProject({ projectId: project.id, teamId: team.id }, as(projectAdmin))

    await expect(removeTeamFromProject({
      projectId: project.id, teamId: team.id, openTasks: { kind: 'person', userId: lee.id }, agentOpenTasksTo: null,
    }, as(projectAdmin))).rejects.toMatchObject({ statusCode: 400 })

    expect(await rowOf(project.id, dana.id)).not.toBeNull()
    expect(await prisma.projectTeam.count()).toBe(1)
  })

  it('never leaves a project without an admin, and rolls the whole change back', async () => {
    const orgAdmin = await createUserWithRole('ADMIN')
    const project = await createProject({ accessLevel: 'OPEN' })
    const dana = await createUser()
    const team = await makeTeam(orgAdmin, [dana])
    await addTeamToProject({ projectId: project.id, teamId: team.id, role: 'ADMIN' }, as(orgAdmin))
    expect((await rowOf(project.id, dana.id))?.role).toBe('ADMIN')

    await expect(removeTeamFromProject({ projectId: project.id, teamId: team.id, openTasks: WAIT, agentOpenTasksTo: null }, as(orgAdmin)))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('without an admin') })

    expect((await rowOf(project.id, dana.id))?.role).toBe('ADMIN')
    expect(await prisma.projectTeam.count()).toBe(1)
  })

  it('holds an instruction for the site that holds the home of each person who left', async () => {
    const { projectAdmin, orgAdmin, project } = await setting()
    const dana = await createUser()
    const team = await makeTeam(orgAdmin, [dana])
    await addTeamToProject({ projectId: project.id, teamId: team.id }, as(projectAdmin))
    await createSession({ userId: dana.id, agentId: (await createAgent()).id, primaryOwnerType: 'project', primaryOwnerId: project.id })

    await removeTeamFromProject({ projectId: project.id, teamId: team.id, openTasks: WAIT, agentOpenTasksTo: null }, as(projectAdmin))

    const held = await prisma.heldSiteInstruction.findMany()
    expect(held.map(h => (h.params as { userId: string }).userId)).toEqual([dana.id])
  })
})
