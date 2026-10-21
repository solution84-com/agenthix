/**
 * A project's conversations close when the project ends, or a person's place in it does, as their chats do on
 * each site (conversational experience spec, Conversation lifecycle): removing a person, a person leaving, a team
 * leaving that takes a person with it, and deleting the project. Against the real test database; no site is
 * connected, so held instructions stay held.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createConversation, createUser, createUserWithRole, createProject, ensureExecutionSite } from '../../test/factories'
import { as, WAIT, setting, makeTeam } from '../../org/teams/__tests__/teamHarness'

const files = vi.hoisted(() => ({ removeLocationOnSite: vi.fn() }))
vi.mock('../../storage/locationFileStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../storage/locationFileStore')>()),
  ...files,
}))
const channel = vi.hoisted(() => ({ isOnline: vi.fn(), request: vi.fn() }))
vi.mock('../../sites/channel', () => ({ siteChannelRegistry: channel }))
vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { removeProjectMember, leaveProject } from '../../projects/memberActions'
import { deleteProject } from '../../projects/actions'
import { addTeamToProject, removeTeamFromProject } from '../../org/teams/projectTeamActions'

beforeEach(async () => {
  channel.isOnline.mockReset().mockReturnValue(false)
  await ensureExecutionSite({ siteId: 'site-1' })
})

const stateOf = async (id: string) =>
  prisma.conversation.findUniqueOrThrow({ where: { id }, select: { status: true, closedReason: true } })

/** A project with an admin who stays and a member who leaves, each with a conversation there, and one of the member's own. */
async function cast() {
  const { projectAdmin, orgAdmin, project } = await setting()
  const member = await createUserWithRole('MEMBER')
  await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id, role: 'MEMBER' } })
  const leaving = await createConversation({ openedById: member.id, home: 'PROJECT', projectId: project.id })
  const staying = await createConversation({ openedById: projectAdmin.id, home: 'PROJECT', projectId: project.id })
  const elsewhere = await createConversation({ openedById: member.id })
  return { projectAdmin, orgAdmin, project, member, leaving, staying, elsewhere }
}

describe("a person's project conversations @SC-943", () => {
  it('close when they are removed from the project; no one else\'s, and none elsewhere', async () => {
    const { projectAdmin, project, member, leaving, staying, elsewhere } = await cast()

    await removeProjectMember({ projectId: project.id, userId: member.id, openTasks: WAIT }, as(projectAdmin))

    expect(await stateOf(leaving.id)).toEqual({ status: 'CLOSED', closedReason: 'LEFT_PROJECT' })
    expect(await stateOf(staying.id)).toEqual({ status: 'ACTIVE', closedReason: null })
    expect(await stateOf(elsewhere.id)).toEqual({ status: 'ACTIVE', closedReason: null })
  })

  it('close when they leave the project themselves', async () => {
    const { project, member, leaving } = await cast()
    await leaveProject({ projectId: project.id }, as(member))
    expect(await stateOf(leaving.id)).toEqual({ status: 'CLOSED', closedReason: 'LEFT_PROJECT' })
  })

  it('close when a team that brought them in leaves the project', async () => {
    const { projectAdmin, orgAdmin, project } = await setting()
    const dana = await createUser()
    const team = await makeTeam(orgAdmin, [dana])
    await addTeamToProject({ projectId: project.id, teamId: team.id, role: 'MEMBER' }, as(projectAdmin))
    const hers = await createConversation({ openedById: dana.id, home: 'PROJECT', projectId: project.id })

    await removeTeamFromProject({ projectId: project.id, teamId: team.id, openTasks: WAIT, agentOpenTasksTo: null }, as(projectAdmin))

    expect(await stateOf(hers.id)).toEqual({ status: 'CLOSED', closedReason: 'LEFT_PROJECT' })
  })
})

describe("a project's conversations @SC-943", () => {
  it('all close when the project is deleted, and those in other projects do not', async () => {
    const { project, leaving, staying } = await cast()
    const admin = await createUserWithRole('ADMIN')
    const other = await createProject()
    const otherConversation = await createConversation({ openedById: admin.id, home: 'PROJECT', projectId: other.id })

    await deleteProject({ projectId: project.id }, as(admin))

    for (const id of [leaving.id, staying.id]) expect(await stateOf(id)).toEqual({ status: 'CLOSED', closedReason: 'PROJECT_DELETED' })
    expect(await stateOf(otherConversation.id)).toEqual({ status: 'ACTIVE', closedReason: null })
  })
})
