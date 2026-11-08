/**
 * Removing an agent from a project (every screen reviewed spec §3, §9): what
 * happens to its open tasks there is a required choice — another agent assigned
 * to the project, or none — with no default. Its open tasks and its routines
 * there move in the same transaction as the removal; its done tasks, and its
 * work in other projects, are untouched. When it is the project's default
 * agent, the new default is a required choice too. Against the real test
 * database, through the action a project admin uses.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createTestTask, createUser } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { removeAgentFromProject } from '../actions'

const as = (user: { id: string }) => ({ user }) as any

async function setUp() {
  const project = await createProject()
  const admin = await createUser()
  await prisma.projectMember.create({ data: { projectId: project.id, userId: admin.id, role: 'ADMIN' } })
  const leaving = await createAgent()
  const staying = await createAgent()
  await prisma.projectAgent.createMany({ data: [{ projectId: project.id, agentId: leaving.id }, { projectId: project.id, agentId: staying.id }] })
  const task = (status: 'TODO' | 'IN_PROGRESS' | 'DONE', projectId = project.id) =>
    createTestTask({ data: { projectId, number: Math.floor(Math.random() * 1e9), title: status, status, assignedAgentId: leaving.id, onBehalfOfUserId: admin.id } })
  const open = [await task('TODO'), await task('IN_PROGRESS')]
  const done = await task('DONE')
  return { project, admin, leaving, staying, open, done, task }
}

const routineIn = (projectId: string, agentId: string, onBehalfOfUserId: string) => prisma.routine.create({
  data: {
    projectId, title: 'Daily audit', agentId, onBehalfOfUserId, cron: '0 9 * * *', timezone: 'UTC',
  },
})
const routineAgentOf = async (routineId: string) => (await prisma.routine.findUniqueOrThrow({ where: { id: routineId } })).agentId
const defaultOf = async (projectId: string) => (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).defaultAgentId

const assigneeOf = async (taskId: string) => (await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).assignedAgentId
const isAssigned = async (projectId: string, agentId: string) =>
  (await prisma.projectAgent.count({ where: { projectId, agentId } })) === 1

describe('removing an agent from a project @SC-572', () => {
  it('gives its open tasks there to the agent chosen, and leaves its done tasks alone', async () => {
    const { project, admin, leaving, staying, open, done } = await setUp()

    await removeAgentFromProject({ projectId: project.id, agentId: leaving.id, openTasksTo: staying.id }, as(admin))

    expect(await isAssigned(project.id, leaving.id)).toBe(false)
    for (const t of open) expect(await assigneeOf(t.id)).toBe(staying.id)
    expect(await assigneeOf(done.id)).toBe(leaving.id)
  })

  it('leaves its open tasks with no agent when the choice is none', async () => {
    const { project, admin, leaving, open, done } = await setUp()

    await removeAgentFromProject({ projectId: project.id, agentId: leaving.id, openTasksTo: null }, as(admin))

    for (const t of open) expect(await assigneeOf(t.id)).toBeNull()
    expect(await assigneeOf(done.id)).toBe(leaving.id)
  })

  it("never touches its tasks in another project", async () => {
    const { project, admin, leaving, staying, task } = await setUp()
    const elsewhere = await createProject()
    const other = await task('TODO', elsewhere.id)

    await removeAgentFromProject({ projectId: project.id, agentId: leaving.id, openTasksTo: staying.id }, as(admin))

    expect(await assigneeOf(other.id)).toBe(leaving.id)
  })

  it('is refused without the choice, and nothing changes', async () => {
    const { project, admin, leaving, open } = await setUp()

    await expect(removeAgentFromProject({ projectId: project.id, agentId: leaving.id } as any, as(admin)))
      .rejects.toMatchObject({ statusCode: 400 })

    expect(await isAssigned(project.id, leaving.id)).toBe(true)
    expect(await assigneeOf(open[0].id)).toBe(leaving.id)
  })

  it.each([
    ['an agent not assigned to the project', async () => (await createAgent()).id],
    ['the agent being removed', null],
  ])('is refused when the tasks would go to %s, and nothing changes', async (_what, makeTarget) => {
    const { project, admin, leaving, open } = await setUp()
    const target = makeTarget ? await makeTarget() : leaving.id

    await expect(removeAgentFromProject({ projectId: project.id, agentId: leaving.id, openTasksTo: target }, as(admin)))
      .rejects.toMatchObject({ statusCode: 400 })

    expect(await isAssigned(project.id, leaving.id)).toBe(true)
    expect(await assigneeOf(open[0].id)).toBe(leaving.id)
  })

  it("is refused to a member who is not the project's admin", async () => {
    const { project, leaving } = await setUp()
    const member = await createUser()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id, role: 'MEMBER' } })

    await expect(removeAgentFromProject({ projectId: project.id, agentId: leaving.id, openTasksTo: null }, as(member)))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(await isAssigned(project.id, leaving.id)).toBe(true)
  })

  it('moves its routines there with its open tasks, and never its routines in another project', async () => {
    const { project, admin, leaving, staying } = await setUp()
    const here = await routineIn(project.id, leaving.id, admin.id)
    const elsewhere = await routineIn((await createProject()).id, leaving.id, admin.id)

    await removeAgentFromProject({ projectId: project.id, agentId: leaving.id, openTasksTo: staying.id }, as(admin))

    expect(await routineAgentOf(here.id)).toBe(staying.id)
    expect(await routineAgentOf(elsewhere.id)).toBe(leaving.id)
  })

  it('leaves its routines there with no agent when the choice is none', async () => {
    const { project, admin, leaving } = await setUp()
    const here = await routineIn(project.id, leaving.id, admin.id)

    await removeAgentFromProject({ projectId: project.id, agentId: leaving.id, openTasksTo: null }, as(admin))

    expect(await routineAgentOf(here.id)).toBeNull()
  })
})

describe("removing the project's default agent @SC-572", () => {
  it('is refused without a new default, and nothing changes', async () => {
    const { project, admin, leaving, open } = await setUp()
    await prisma.project.update({ where: { id: project.id }, data: { defaultAgentId: leaving.id } })

    await expect(removeAgentFromProject({ projectId: project.id, agentId: leaving.id, openTasksTo: null }, as(admin)))
      .rejects.toMatchObject({ statusCode: 400 })

    expect(await isAssigned(project.id, leaving.id)).toBe(true)
    expect(await assigneeOf(open[0].id)).toBe(leaving.id)
    expect(await defaultOf(project.id)).toBe(leaving.id)
  })

  it('makes the agent chosen the default', async () => {
    const { project, admin, leaving, staying } = await setUp()
    await prisma.project.update({ where: { id: project.id }, data: { defaultAgentId: leaving.id } })

    await removeAgentFromProject({ projectId: project.id, agentId: leaving.id, openTasksTo: null, newDefaultAgentId: staying.id }, as(admin))

    expect(await defaultOf(project.id)).toBe(staying.id)
    expect(await isAssigned(project.id, leaving.id)).toBe(false)
  })

  it('leaves the project with no default when the choice is none', async () => {
    const { project, admin, leaving } = await setUp()
    await prisma.project.update({ where: { id: project.id }, data: { defaultAgentId: leaving.id } })

    await removeAgentFromProject({ projectId: project.id, agentId: leaving.id, openTasksTo: null, newDefaultAgentId: null }, as(admin))

    expect(await defaultOf(project.id)).toBeNull()
  })

  it.each([
    ['an agent not assigned to the project', async () => (await createAgent()).id],
    ['the agent being removed', null],
  ])('is refused when the new default would be %s, and nothing changes', async (_what, makeTarget) => {
    const { project, admin, leaving } = await setUp()
    await prisma.project.update({ where: { id: project.id }, data: { defaultAgentId: leaving.id } })
    const target = makeTarget ? await makeTarget() : leaving.id

    await expect(removeAgentFromProject({ projectId: project.id, agentId: leaving.id, openTasksTo: null, newDefaultAgentId: target }, as(admin)))
      .rejects.toMatchObject({ statusCode: 400 })

    expect(await isAssigned(project.id, leaving.id)).toBe(true)
    expect(await defaultOf(project.id)).toBe(leaving.id)
  })

  it('needs no new default when the agent is not the default, and keeps the default there is', async () => {
    const { project, admin, leaving, staying } = await setUp()
    await prisma.project.update({ where: { id: project.id }, data: { defaultAgentId: staying.id } })

    await removeAgentFromProject({ projectId: project.id, agentId: leaving.id, openTasksTo: null, newDefaultAgentId: null }, as(admin))

    expect(await defaultOf(project.id)).toBe(staying.id)
  })
})
