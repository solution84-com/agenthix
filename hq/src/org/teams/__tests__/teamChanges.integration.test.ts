/**
 * A team's change following into its projects, someone there through a team
 * being changed through it, and a project's teams as its members read them
 * (adr-0103), against the real test database. Adding and removing a team:
 * teamMembership.integration.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createUser, createUserWithRole, createAgent, createProject, ensureExecutionSite } from '../../../test/factories'
import { makeTask } from '../../../projects/__tests__/projectsHarness'
import { as, WAIT, setting, makeTeam, rowOf, agentRowOf } from './teamHarness'

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


import { addTeamToProject, removeTeamFromProject } from '../projectTeamActions'
import { updateTeam, deleteTeam } from '../teamActions'
import { addProjectMember, removeProjectMember, setProjectMemberRole, leaveProject } from '../../../projects/memberActions'
import { removeAgentFromProject } from '../../../projects/agentAssignment'
import { isProjectMember } from '../../../projects/membership'
import { getProjectTeams } from '../teamQueries'

beforeEach(async () => {
  channel.isOnline.mockReset().mockReturnValue(false)
  await ensureExecutionSite({ siteId: 'site-1' })
})

describe("a team's change follows it into every project it is in @SC-673", () => {
  it('someone added joins them; someone taken out leaves those they were in only through it', async () => {
    const { projectAdmin, orgAdmin, project } = await setting()
    const other = await createProject({ accessLevel: 'OPEN' })
    await prisma.projectMember.create({ data: { projectId: other.id, userId: projectAdmin.id, role: 'ADMIN' } })
    const dana = await createUser()
    const sam = await createUser()
    await addProjectMember({ projectId: other.id, userId: sam.id }, as(projectAdmin))
    const team = await makeTeam(orgAdmin, [dana])
    await addTeamToProject({ projectId: project.id, teamId: team.id }, as(projectAdmin))
    await addTeamToProject({ projectId: other.id, teamId: team.id }, as(projectAdmin))

    await updateTeam({ id: team.id, userIds: [dana.id, sam.id] }, as(orgAdmin))
    expect(await rowOf(project.id, sam.id)).toEqual({ role: 'MEMBER', direct: false, ownRole: null })
    expect(await rowOf(other.id, sam.id)).toEqual({ role: 'MEMBER', direct: true, ownRole: 'MEMBER' })

    await updateTeam({ id: team.id, userIds: [dana.id] }, as(orgAdmin))
    expect(await rowOf(project.id, sam.id)).toBeNull()
    expect(await rowOf(other.id, sam.id)).toEqual({ role: 'MEMBER', direct: true, ownRole: null })
  })

  it("follows its agents too: one taken out leaves, and its open tasks there have no agent", async () => {
    const { projectAdmin, orgAdmin, project } = await setting()
    const writer = await createAgent()
    const team = await makeTeam(orgAdmin, [], [writer])
    await addTeamToProject({ projectId: project.id, teamId: team.id }, as(projectAdmin))
    const its = await makeTask(project.id, { onBehalfOfUserId: projectAdmin.id, assignedAgentId: writer.id })

    await updateTeam({ id: team.id, agentIds: [] }, as(orgAdmin))

    expect(await agentRowOf(project.id, writer.id)).toBeNull()
    expect((await prisma.task.findUniqueOrThrow({ where: { id: its.id } })).assignedAgentId).toBeNull()
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).defaultAgentId).toBeNull()
  })

  it("refuses an org admin changing the people of a team in a private project they are not in", async () => {
    const { projectAdmin, project } = await setting()
    const outsiderAdmin = await createUserWithRole('ADMIN')
    const dana = await createUser()
    const team = await makeTeam(outsiderAdmin, [])
    await addTeamToProject({ projectId: project.id, teamId: team.id }, as(projectAdmin))

    await expect(updateTeam({ id: team.id, userIds: [dana.id, outsiderAdmin.id] }, as(outsiderAdmin))).rejects.toMatchObject({ statusCode: 403 })

    expect(await isProjectMember(project.id, outsiderAdmin.id)).toBe(false)
    expect(await prisma.teamPerson.count({ where: { teamId: team.id } })).toBe(0)
  })

  it('refuses a change that would leave a project without an admin', async () => {
    const orgAdmin = await createUserWithRole('ADMIN')
    const project = await createProject({ accessLevel: 'OPEN' })
    const dana = await createUser()
    const team = await makeTeam(orgAdmin, [dana])
    await addTeamToProject({ projectId: project.id, teamId: team.id, role: 'ADMIN' }, as(orgAdmin))

    await expect(updateTeam({ id: team.id, userIds: [] }, as(orgAdmin))).rejects.toMatchObject({ statusCode: 400 })
    expect((await rowOf(project.id, dana.id))?.role).toBe('ADMIN')
    expect(await prisma.teamPerson.count({ where: { teamId: team.id } })).toBe(1)
  })

  it('refuses deleting a team that is still in a project @SC-670', async () => {
    const { projectAdmin, orgAdmin, project } = await setting()
    const team = await makeTeam(orgAdmin, [await createUser()])
    await addTeamToProject({ projectId: project.id, teamId: team.id }, as(projectAdmin))
    await expect(deleteTeam({ id: team.id }, as(orgAdmin))).rejects.toMatchObject({ statusCode: 409 })
    expect(await prisma.team.count()).toBe(1)
  })
})

describe('someone there through a team is changed through the team @SC-674', () => {
  it("refuses changing the role of, or removing, someone there only through a team", async () => {
    const { projectAdmin, orgAdmin, project } = await setting()
    const dana = await createUser()
    const team = await makeTeam(orgAdmin, [dana])
    await addTeamToProject({ projectId: project.id, teamId: team.id }, as(projectAdmin))

    await expect(setProjectMemberRole({ projectId: project.id, userId: dana.id, role: 'ADMIN' }, as(projectAdmin)))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('Marketing') })
    await expect(removeProjectMember({ projectId: project.id, userId: dana.id, openTasks: WAIT }, as(projectAdmin)))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(leaveProject({ projectId: project.id }, as(dana))).rejects.toMatchObject({ statusCode: 400 })
    expect(await rowOf(project.id, dana.id)).toEqual({ role: 'MEMBER', direct: false, ownRole: null })
  })

  it('removing someone in their own right who is also there through a team leaves them with the team role', async () => {
    const { projectAdmin, orgAdmin, project } = await setting()
    const sam = await createUser()
    await addProjectMember({ projectId: project.id, userId: sam.id, role: 'ADMIN' }, as(projectAdmin))
    const team = await makeTeam(orgAdmin, [sam])
    await addTeamToProject({ projectId: project.id, teamId: team.id, role: 'MEMBER' }, as(projectAdmin))

    await removeProjectMember({ projectId: project.id, userId: sam.id, openTasks: WAIT }, as(projectAdmin))

    expect(await rowOf(project.id, sam.id)).toEqual({ role: 'MEMBER', direct: false, ownRole: null })
  })

  it("adding someone there only through a team makes them a member in their own right too", async () => {
    const { projectAdmin, orgAdmin, project } = await setting()
    const dana = await createUser()
    const team = await makeTeam(orgAdmin, [dana])
    await addTeamToProject({ projectId: project.id, teamId: team.id, role: 'VIEWER' }, as(projectAdmin))

    await addProjectMember({ projectId: project.id, userId: dana.id, role: 'MEMBER' }, as(projectAdmin))

    expect(await rowOf(project.id, dana.id)).toEqual({ role: 'MEMBER', direct: true, ownRole: 'MEMBER' })
    await removeTeamFromProject({ projectId: project.id, teamId: team.id, openTasks: WAIT, agentOpenTasksTo: null }, as(projectAdmin))
    expect(await rowOf(project.id, dana.id)).toEqual({ role: 'MEMBER', direct: true, ownRole: null })
  })

  it('an agent there only through a team is removed from the team; one also assigned itself stays', async () => {
    const { projectAdmin, orgAdmin, project } = await setting()
    const writer = await createAgent()
    const both = await createAgent()
    await prisma.projectAgent.create({ data: { projectId: project.id, agentId: both.id } })
    const team = await makeTeam(orgAdmin, [], [writer, both])
    await addTeamToProject({ projectId: project.id, teamId: team.id }, as(projectAdmin))

    await expect(removeAgentFromProject({ projectId: project.id, agentId: writer.id, openTasksTo: null, newDefaultAgentId: null }))
      .rejects.toMatchObject({ statusCode: 400 })
    await removeAgentFromProject({ projectId: project.id, agentId: both.id, openTasksTo: null, newDefaultAgentId: null })

    expect(await agentRowOf(project.id, writer.id)).toEqual({ direct: false })
    expect(await agentRowOf(project.id, both.id)).toEqual({ direct: false })
  })
})

describe("a project's teams, read by its members @SC-676", () => {
  it('names each team with its role, and who of its people and agents are there through which team', async () => {
    const { projectAdmin, orgAdmin, project } = await setting()
    const dana = await createUser()
    const writer = await createAgent()
    const team = await makeTeam(orgAdmin, [dana, projectAdmin], [writer])
    await addTeamToProject({ projectId: project.id, teamId: team.id, role: 'MEMBER' }, as(projectAdmin))

    const read = await getProjectTeams({ projectId: project.id }, as(dana))

    expect(read.teams).toEqual([expect.objectContaining({ id: team.id, name: 'Marketing', role: 'MEMBER', agentIds: [writer.id] })])
    expect(read.people).toEqual(expect.arrayContaining([
      { userId: dana.id, direct: false, ownRole: null, teamIds: [team.id] },
      { userId: projectAdmin.id, direct: true, ownRole: 'ADMIN', teamIds: [team.id] },
      { userId: orgAdmin.id, direct: true, ownRole: 'MEMBER', teamIds: [] },
    ]))
    expect(read.agents).toEqual([{ agentId: writer.id, direct: false, teamIds: [team.id] }])

    const outsider = await createUserWithRole('MEMBER')
    await expect(getProjectTeams({ projectId: project.id }, as(outsider))).rejects.toMatchObject({ statusCode: 404 })
  })
})
