/**
 * A run is bounded by the person it is for (adr-0101), against the real test
 * database: each control-plane operation checks the run's person — their
 * current organisation role for what is organisation-wide, and their role in
 * the project for the rest, a Viewer reading and changing nothing (adr-0102) —
 * as the browser checks the signed-in person, inside the run's own project. The
 * agent's permissions, Bypassed included, change none of it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CapabilityClaims } from '@agenthix/core'
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
// A board template whose column starts work by itself, without a template file on disk.
vi.mock('../../../library/boardTemplateService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../library/boardTemplateService')>()),
  readBoardColumns: vi.fn(async () => [
    { name: 'ready', label: 'Ready', status: 'TODO', order: 0, color: 'x', autoQueue: true },
    { name: 'done', label: 'Done', status: 'DONE', order: 1, color: 'x' },
  ]),
}))

import { callOperation } from '../operations'
import { createBoard } from '../../../projects/boardService'
import { createMilestone } from '../../../projects/taskPlanService'
import type { CallerContext } from '../types'
import { claims, expectForbidden } from './controlPlaneFixtures'

let viewer: { id: string }
let member: { id: string }
let routingAdmin: { id: string }
let project: { id: string }
let otherProject: { id: string }
let task: { id: string }
let sprintBoardId: string
let milestoneId: string

beforeEach(async () => {
  // The organisation's admin, and its Viewer in both projects: no organisation role grants work in a project.
  viewer = await createUserWithRole('ADMIN')
  member = await createUserWithRole('MEMBER')
  routingAdmin = await createUserWithRole('ADMIN')
  project = await createProject({ accessLevel: 'PRIVATE' })
  otherProject = await createProject({ accessLevel: 'PRIVATE' })
  for (const [userId, role] of [[viewer.id, 'VIEWER'], [member.id, 'MEMBER']] as const) {
    await prisma.projectMember.create({ data: { projectId: project.id, userId, role } })
    await prisma.projectMember.create({ data: { projectId: otherProject.id, userId, role } })
  }
  await prisma.agent.create({ data: { id: 'agent-1', name: 'Agent', handle: 'agent-1' } })
  task = await createTestTask({ data: { title: 'T', projectId: project.id, number: 1, onBehalfOfUserId: member.id } })
  sprintBoardId = (await createBoard({ projectId: project.id, name: 'Sprints', kind: 'SPRINTS' })).id
  milestoneId = (await createMilestone({ projectId: project.id, name: 'Beta', date: '2026-11-01' })).id
  await prisma.boardTemplate.create({ data: { id: 'tpl-auto', name: 'Auto', assetPath: 'auto.json', isSystem: false } })
  await prisma.agentSession.create({ data: { id: 'task-session', userId: routingAdmin.id, agentId: 'agent-1', sessionType: 'task', taskId: task.id } })
})

/** A chat in the project, its conversation `personId`'s own. */
async function projectChat(personId: string, over: Partial<CapabilityClaims> = {}): Promise<CallerContext> {
  const id = `chat-${personId}`
  await prisma.agentSession.upsert({ where: { id }, update: {}, create: { id, userId: personId, agentId: 'agent-1', sessionType: 'chat' } })
  return { kind: 'run', claims: claims({ userId: personId, role: null, projectId: project.id, sessionId: id, runner: { kind: 'project', projectId: project.id }, ...over }) }
}

/** A run of the task, its session owned by a routing admin; `onBehalfOfUserId` when a person started it. */
function taskRun(over: Partial<CapabilityClaims> = {}): CallerContext {
  return {
    kind: 'run',
    claims: claims({
      userId: routingAdmin.id, role: null, projectId: project.id, taskId: task.id, sessionId: 'task-session',
      runner: { kind: 'project', projectId: project.id }, startedBy: 'pulse', ...over,
    }),
  }
}

/** A chat in `personId`'s own storage. */
async function ownChat(personId: string, role: CapabilityClaims['role']): Promise<CallerContext> {
  const id = `own-${personId}`
  await prisma.agentSession.upsert({ where: { id }, update: {}, create: { id, userId: personId, agentId: 'agent-1', sessionType: 'chat' } })
  return { kind: 'run', claims: claims({ userId: personId, role, projectId: null, taskId: null, sessionId: id, runner: { kind: 'person', userId: personId } }) }
}

/** Changes to the project: the browser asks someone who works in it, so a run asks it of its person too. */
const CHANGES: Array<[string, string, () => Record<string, unknown>]> = [
  ['delete_task', 'delete_task', () => ({ taskId: task.id })],
  ['archive_task', 'archive_task', () => ({ taskId: task.id })],
  ['create_board, with a column that starts work', 'create_board', () => ({ projectId: project.id, name: 'New', templateId: 'tpl-auto' })],
  ['create_board, a plain one', 'create_board', () => ({ projectId: project.id, name: 'New' })],
  ['finish_sprint', 'finish_sprint', () => ({ boardId: sprintBoardId, unfinished: 'backlog' })],
  ['delete_milestone', 'delete_milestone', () => ({ milestoneId })],
  ['add_comment', 'add_comment', () => ({ taskId: task.id, content: 'hi' })],
]

const call = (ctx: CallerContext, name: string, args: Record<string, unknown>) => callOperation(name, ctx, args)

async function nothingChanged() {
  expect(await prisma.task.findUnique({ where: { id: task.id } })).toMatchObject({ archived: false })
  expect(await prisma.board.count({ where: { projectId: project.id, name: 'New' } })).toBe(0)
  expect(await prisma.sprint.count({ where: { boardId: sprintBoardId } })).toBe(1)
  expect(await prisma.milestone.count({ where: { id: milestoneId } })).toBe(1)
  expect(await prisma.taskComment.count()).toBe(0)
}

describe('a project chat is checked against its person (adr-0101) @SC-621', () => {
  it.each(CHANGES)("the project's Viewer — the organisation's admin — is refused %s, and nothing changes", async (_what, tool, args) => {
    await expectForbidden(call(await projectChat(viewer.id), tool, args()))
    await nothingChanged()
  })

  it.each(CHANGES)('the same by a Member of the project is allowed: %s', async (_what, tool, args) => {
    await expect(call(await projectChat(member.id), tool, args())).resolves.toBeDefined()
  })

  it("its Viewer still reads what a member reads", async () => {
    await expect(call(await projectChat(viewer.id), 'get_task_details', { taskId: task.id })).resolves.toBeDefined()
    await expect(call(await projectChat(viewer.id), 'list_milestones', { projectId: project.id })).resolves.toBeDefined()
  })

  it('an outsider may not, whatever their role', async () => {
    const outsider = await createUserWithRole('ADMIN')
    for (const [, tool, args] of CHANGES) await expectForbidden(call(await projectChat(outsider.id), tool, args()))
  })

  it("is still confined to its own project, even one its person is a member of", async () => {
    await expectForbidden(call(await projectChat(member.id), 'create_board', { projectId: otherProject.id, name: 'New' }))
    await expectForbidden(call(await projectChat(member.id), 'list_tasks', { projectId: otherProject.id }))
  })

  it('a bypassed agent changes none of it', async () => {
    const bypassed = await projectChat(viewer.id, { permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: [] } })
    for (const [, tool, args] of CHANGES) await expectForbidden(call(bypassed, tool, args()))
    await nothingChanged()
  })
})

describe("a task's runs @SC-622", () => {
  it("a person stepping into another person's task conversation is checked as themselves", async () => {
    await expectForbidden(call(taskRun({ onBehalfOfUserId: viewer.id, startedBy: 'person' }), 'delete_task', { taskId: task.id }))
    await nothingChanged()
    await prisma.task.update({ where: { id: task.id }, data: { onBehalfOfUserId: viewer.id } })
    await expect(call(taskRun({ onBehalfOfUserId: member.id, startedBy: 'person' }), 'archive_task', { taskId: task.id })).resolves.toBeDefined()
  })

  it("a task run nobody started is checked as the task's person, never the session's routing admin", async () => {
    await prisma.task.update({ where: { id: task.id }, data: { onBehalfOfUserId: viewer.id } })
    await expectForbidden(call(taskRun(), 'delete_task', { taskId: task.id }))
    await nothingChanged()
    await prisma.task.update({ where: { id: task.id }, data: { onBehalfOfUserId: member.id } })
    await expect(call(taskRun(), 'delete_task', { taskId: task.id })).resolves.toBeDefined()
  })

  it('a task run is refused the organisation-wide tools, whatever its person may do', async () => {
    await prisma.userSettings.update({ where: { userId: member.id }, data: { role: 'ADMIN' } })
    await expectForbidden(call(taskRun({ onBehalfOfUserId: member.id, startedBy: 'person' }), 'create_agent', { name: 'A', role: 'r', responsibilities: 'x' }))
  })
})

describe('from the next call @SC-622', () => {
  it('a person removed from the project is refused', async () => {
    const chat = await projectChat(member.id)
    await expect(call(chat, 'get_task_details', { taskId: task.id })).resolves.toBeDefined()
    await prisma.projectMember.deleteMany({ where: { projectId: project.id, userId: member.id } })
    await expectForbidden(call(chat, 'get_task_details', { taskId: task.id }))
    await expect(call(taskRun({ onBehalfOfUserId: member.id, startedBy: 'person' }), 'list_tasks', {})).resolves.toMatchObject({ tasks: [] })
  })

  it('a person who has left the organisation is refused everything, reads included', async () => {
    const chat = await projectChat(member.id)
    await expect(call(chat, 'get_org', {})).resolves.toBeDefined()
    await prisma.user.update({ where: { id: member.id }, data: { deactivatedAt: new Date() } })
    await expectForbidden(call(chat, 'get_org', {}))
    await expectForbidden(call(chat, 'get_task_details', { taskId: task.id }))
  })

  it("a person made the project's Viewer is held to it", async () => {
    const chat = await projectChat(member.id)
    await prisma.projectMember.update({ where: { projectId_userId: { projectId: project.id, userId: member.id } }, data: { role: 'VIEWER' } })
    await expectForbidden(call(chat, 'delete_task', { taskId: task.id }))
    await nothingChanged()
  })
})

describe("a chat in its person's own storage keeps working, through the same checks @SC-622", () => {
  it("uses the person's role as it is now, never the one its capability carries", async () => {
    const admin = await createUserWithRole('ADMIN')
    const chat = await ownChat(admin.id, 'ADMIN')
    await expect(call(chat, 'create_team', { name: 'T', purpose: 'p', agentIds: [] })).resolves.toMatchObject({ success: true })
    await prisma.userSettings.update({ where: { userId: admin.id }, data: { role: 'MEMBER' } })
    await expectForbidden(call(chat, 'create_team', { name: 'U', purpose: 'p', agentIds: [] }))
  })

  it('reaches the projects its person is a member of, and no other', async () => {
    const chat = await ownChat(member.id, 'MEMBER')
    await expect(call(chat, 'get_task_details', { taskId: task.id })).resolves.toBeDefined()
    const stranger = await createProject({ accessLevel: 'OPEN' })
    const theirs = await createTestTask({ data: { title: 'X', projectId: stranger.id, number: 1, onBehalfOfUserId: viewer.id } })
    await expectForbidden(call(chat, 'get_task_details', { taskId: theirs.id }))
  })
})

describe('a run on behalf of no one @SC-623', () => {
  it('a task run whose task is gone is refused everything but its own runtime support', async () => {
    const orphan = taskRun({ taskId: 'gone-task' })
    for (const [tool, args] of [['get_org', {}], ['list_agents', {}], ['list_tasks', {}], ['create_task', { title: 't', projectId: project.id }]] as const) {
      const err = await expectForbidden(call(orphan, tool, args))
      expect(err.message).toMatch(/on behalf of no one/)
    }
  })

  it("a task session with no task, and no person signed in, is refused", async () => {
    await prisma.agentSession.create({ data: { id: 'bare-task-session', userId: routingAdmin.id, agentId: 'agent-1', sessionType: 'task' } })
    await expectForbidden(call(taskRun({ taskId: null, sessionId: 'bare-task-session' }), 'get_org', {}))
  })
})
