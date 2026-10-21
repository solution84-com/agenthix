/**
 * A task's agent comes from its project's roster, and a task records the person
 * it is done on behalf of (adr-0089), against the real test DB.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUserWithRole } from '../../test/factories'
import { assignAgent, ctx, makeTask } from './projectsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { createTask, updateTask } from '../actions'

async function cast() {
  // Assigning an agent is a change to the project, so it needs someone who works there (adr-0102).
  const operator = await createUserWithRole('MEMBER')
  const project = await createProject({ accessLevel: 'OPEN' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: operator.id } })
  const onRoster = await createAgent()
  await assignAgent(project.id, onRoster.id)
  // On another project's roster, never this one's.
  const stranger = await createAgent()
  await assignAgent((await createProject()).id, stranger.id)
  return { operator, project, onRoster, stranger }
}

describe('createTask assignedAgentId', () => {
  it("refuses an agent not on the project's roster (400) and creates nothing", async () => {
    const { operator, project, stranger } = await cast()
    await expect(createTask({ projectId: project.id, title: 'x', assignedAgentId: stranger.id }, ctx(operator)))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(0)
  })

  it("accepts an agent on the project's roster", async () => {
    const { operator, project, onRoster } = await cast()
    const task = await createTask({ projectId: project.id, title: 'x', assignedAgentId: onRoster.id }, ctx(operator))
    expect(task.assignedAgentId).toBe(onRoster.id)
  })

  it('records the person creating it as who it is done on behalf of, with no agent named at all', async () => {
    const { operator, project } = await cast()
    const task = await createTask({ projectId: project.id, title: 'x' }, ctx(operator))
    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ onBehalfOfUserId: operator.id, assignedAgentId: null })
  })
})

describe('updateTask assignedAgentId @SC-035', () => {
  it("refuses an agent not on the task's project's roster (400) and changes nothing", async () => {
    const { operator, project, onRoster, stranger } = await cast()
    const task = await makeTask(project.id, { assignedAgentId: onRoster.id })
    await expect(updateTask({ taskId: task.id, assignedAgentId: stranger.id }, ctx(operator))).rejects.toMatchObject({ statusCode: 400 })
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).assignedAgentId).toBe(onRoster.id)
  })

  it("reassigns to an agent on the roster, and unassigns with null", async () => {
    const { operator, project, onRoster } = await cast()
    const task = await makeTask(project.id)
    await updateTask({ taskId: task.id, assignedAgentId: onRoster.id }, ctx(operator))
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).assignedAgentId).toBe(onRoster.id)
    await updateTask({ taskId: task.id, assignedAgentId: null }, ctx(operator))
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).assignedAgentId).toBeNull()
  })

  it('leaves the assignee alone when the update does not touch it', async () => {
    const { operator, project, onRoster } = await cast()
    const task = await makeTask(project.id, { assignedAgentId: onRoster.id })
    await updateTask({ taskId: task.id, title: 'renamed' }, ctx(operator))
    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ title: 'renamed', assignedAgentId: onRoster.id })
  })
})
