/**
 * A conversation's turn at the one tool entry, against the real test database (adr-0082, adr-0101): it acts as
 * the person whose message it answers, in the conversation's place, and never beyond what that person may do
 * there. A task it makes waits for a person to start it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createUserWithRole, createProject, createTestTask } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../dashboard/activity', () => import('../../../test/fakes/activity'))
vi.mock('../../socket', () => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))
vi.mock('../../../agents/dispatchService', () => import('../../../test/fakes/dispatchService'))

import { callOperation } from '../operations'
import type { CallerContext } from '../types'
import { expectForbidden } from './controlPlaneFixtures'
import { turnCaller } from './turnFixtures'

let member: { id: string }
let viewer: { id: string }
let project: { id: string; key: string }
let otherProject: { id: string; key: string }
let task: { id: string }

beforeEach(async () => {
  member = await createUserWithRole('MEMBER')
  viewer = await createUserWithRole('ADMIN')
  project = await createProject({ accessLevel: 'PRIVATE' })
  otherProject = await createProject({ accessLevel: 'PRIVATE' })
  for (const p of [project, otherProject]) {
    await prisma.projectMember.create({ data: { projectId: p.id, userId: member.id, role: 'MEMBER' } })
    await prisma.projectMember.create({ data: { projectId: p.id, userId: viewer.id, role: 'VIEWER' } })
  }
  await prisma.agent.create({ data: { id: 'agent-1', name: 'Agent', handle: 'agent-1' } })
  task = await createTestTask({ data: { title: 'T', projectId: project.id, number: 1, onBehalfOfUserId: member.id } })
})

const inProject = (personId: string | null, over = {}): CallerContext =>
  turnCaller({ home: 'PROJECT', projectId: project.id, actingUserId: personId, ...over })

describe("a turn in a project's conversation @SC-950", () => {
  it('reads and changes the project as its Member', async () => {
    await expect(callOperation('get_task_details', inProject(member.id), { taskId: task.id })).resolves.toMatchObject({ taskId: task.id })
    await expect(callOperation('add_comment', inProject(member.id), { taskId: task.id, content: 'hi', runId: 'run-x' })).resolves.toMatchObject({ success: true })
    // The comment is the agent's, and names no run: a turn is none.
    expect(await prisma.taskComment.findFirst({ where: { taskId: task.id } })).toMatchObject({ authorType: 'AGENT', agentId: 'agent-1', runId: null })
  })

  it("makes a task on its person's behalf, which waits for a person to start it", async () => {
    const made = await callOperation('create_task', inProject(member.id), { projectId: project.id, title: 'Later', queue: true }) as { taskId: string; queued?: boolean }
    expect(made.queued).toBe(false)
    expect(await prisma.task.findUnique({ where: { id: made.taskId } })).toMatchObject({ onBehalfOfUserId: member.id, runState: 'RUN_NONE' })
  })

  it("on its Viewer's behalf reads and changes nothing", async () => {
    await expect(callOperation('get_task_details', inProject(viewer.id), { taskId: task.id })).resolves.toBeDefined()
    await expectForbidden(callOperation('archive_task', inProject(viewer.id), { taskId: task.id }))
    await expectForbidden(callOperation('add_comment', inProject(viewer.id), { taskId: task.id, content: 'hi' }))
    expect(await prisma.taskComment.count()).toBe(0)
  })

  it("never reaches another project, though its person is a member there", async () => {
    const elsewhere = await createTestTask({ data: { title: 'E', projectId: otherProject.id, number: 1, onBehalfOfUserId: member.id } })
    await expectForbidden(callOperation('get_task_details', inProject(member.id), { taskId: elsewhere.id }))
    await expectForbidden(callOperation('list_tasks', inProject(member.id), { projectId: otherProject.id }))
    await expectForbidden(callOperation('create_task', inProject(member.id), { projectId: otherProject.id, title: 'X' }))
  })

  it('reads and changes a task named by its key, in any case, as by its id', async () => {
    const key = `${project.key}-1`
    await expect(callOperation('get_task_details', inProject(member.id), { taskId: key })).resolves.toMatchObject({ taskId: task.id })
    await expect(callOperation('get_task_details', inProject(member.id), { taskId: key.toLowerCase() })).resolves.toMatchObject({ taskId: task.id })
    await callOperation('update_task', inProject(member.id), { taskId: key, title: 'Renamed' })
    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ title: 'Renamed' })
  })

  it('refuses a key that names no task, and a key of a task in a place it does not reach', async () => {
    await expect(callOperation('get_task_details', inProject(member.id), { taskId: `${project.key}-99` })).rejects.toMatchObject({ code: 'not_found' })
    const elsewhere = await createTestTask({ data: { title: 'E', projectId: otherProject.id, number: 1, onBehalfOfUserId: member.id } })
    await expectForbidden(callOperation('get_task_details', inProject(member.id), { taskId: `${otherProject.key}-${elsewhere.number}` }))
  })

  it('is refused once its person has left the organisation', async () => {
    await prisma.user.update({ where: { id: member.id }, data: { deactivatedAt: new Date() } })
    await expectForbidden(callOperation('get_task_details', inProject(member.id), { taskId: task.id }))
  })

  it('answering no one, it reads as the conversation\'s reader and changes nothing', async () => {
    const report = inProject(null, { readerUserId: member.id })
    await expect(callOperation('get_task_details', report, { taskId: task.id })).resolves.toBeDefined()
    await expectForbidden(callOperation('add_comment', report, { taskId: task.id, content: 'hi' }))
  })
})
