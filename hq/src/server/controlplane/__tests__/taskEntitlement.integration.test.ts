/**
 * Who may reach a board or a task over the control plane, against the real
 * test database. A chat run carries one person's authority (ADR-0060), and that
 * person's authority stops at the projects they are entitled to (ADR-0062) —
 * the same rule the browser applies to the same resources. A door closed in
 * the browser and left open here would be a privilege escalation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createUser, createProject, createTestTask } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../dashboard/activity', () => import('../../../test/fakes/activity'))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))
vi.mock('../../../agents/dispatchService', () => import('../../../test/fakes/dispatchService'))

import * as taskOps from '../taskOps'
import * as boardOps from '../boardOps'
import * as agentOps from '../agentOps'
import type { CallerContext } from '../types'
import * as taskRunnerFake from '../../../test/fakes/TaskRunner'
import { seedWorld, chatCtx, runCtx, connCtx, expectForbidden, setProjectRole, type World } from './controlPlaneFixtures'

let w: World
beforeEach(async () => {
  w = await seedWorld()
})

const taskRow = () => prisma.task.findUnique({ where: { id: w.task.id } })

type Call = [string, (ctx: CallerContext) => Promise<unknown>]
const taskCalls = (): Call[] => [
  ['get_task_details', (ctx) => taskOps.getTaskDetailsOp(ctx, { taskId: w.task.id })],
  ['update_task', (ctx) => taskOps.updateTaskOp(ctx, { taskId: w.task.id, title: 'x' })],
  ['archive_task', (ctx) => taskOps.archiveTaskOp(ctx, { taskId: w.task.id })],
  ['delete_task', (ctx) => taskOps.deleteTaskOp(ctx, { taskId: w.task.id })],
  ['add_comment', (ctx) => taskOps.addCommentOp(ctx, { taskId: w.task.id, content: 'hi' })],
  ['run_task', (ctx) => taskOps.runTaskOp(ctx, { taskId: w.task.id })],
]

describe("a chat caller outside the task's project is refused", () => {
  it.each([0, 1, 2, 3, 4, 5])('call %i refuses an outsider and serves a member', async (i) => {
    const [, call] = taskCalls()[i]
    await expectForbidden(call(chatCtx(w.outsider.id)))
    await expect(call(chatCtx(w.member.id))).resolves.toBeDefined()
  })

  it('the refusal happens before the operation does any work', async () => {
    await expectForbidden(taskOps.archiveTaskOp(chatCtx(w.outsider.id), { taskId: w.task.id }))
    await expectForbidden(taskOps.deleteTaskOp(chatCtx(w.outsider.id), { taskId: w.task.id }))
    await expectForbidden(taskOps.updateTaskOp(chatCtx(w.outsider.id), { taskId: w.task.id, title: 'stolen' }))
    expect(await taskRow()).toMatchObject({ title: 'T', archived: false })
    await expectForbidden(taskOps.runTaskOp(chatCtx(w.outsider.id), { taskId: w.task.id }))
    expect(taskRunnerFake.taskRunner.runTask).not.toHaveBeenCalled()
  })
})

describe("run_task starts work, so a chat on behalf of the project's Viewer is refused even inside the project (adr-0102)", () => {
  it('refuses its Viewer, serves its Member and Admin, and runs nothing for the Viewer', async () => {
    await setProjectRole(w.project.id, w.member.id, 'VIEWER')
    await expectForbidden(taskOps.runTaskOp(chatCtx(w.member.id), { taskId: w.task.id }))
    expect(taskRunnerFake.taskRunner.runTask).not.toHaveBeenCalled()
    await setProjectRole(w.project.id, w.member.id, 'MEMBER')
    await expect(taskOps.runTaskOp(chatCtx(w.member.id), { taskId: w.task.id })).resolves.toBeDefined()
    await setProjectRole(w.project.id, w.member.id, 'ADMIN')
    await expect(taskOps.runTaskOp(chatCtx(w.member.id), { taskId: w.task.id })).resolves.toBeDefined()
  })
})

describe("a chat caller outside the board's project is refused", () => {
  it('get_board refuses an outsider and serves a member', async () => {
    await expectForbidden(boardOps.getBoardOp(chatCtx(w.outsider.id), { boardId: w.board.id }))
    await expect(boardOps.getBoardOp(chatCtx(w.member.id), { boardId: w.board.id })).resolves.toMatchObject({ boardId: w.board.id })
  })

  it('create_board refuses an outsider, creating nothing, and serves a member', async () => {
    await expectForbidden(boardOps.createBoardOp(chatCtx(w.outsider.id), { projectId: w.project.id, name: 'Theirs' }))
    expect(await prisma.board.count()).toBe(1)
    await expect(boardOps.createBoardOp(chatCtx(w.member.id), { projectId: w.project.id, name: 'Mine' })).resolves.toMatchObject({ success: true })
    expect(await prisma.board.count()).toBe(2)
  })

  it('create_task refuses an outsider, creating nothing, and serves a member onto the board', async () => {
    await expectForbidden(taskOps.createTaskOp(chatCtx(w.outsider.id), { title: 't', projectId: w.project.id }))
    expect(await prisma.task.count()).toBe(1)
    const created = await taskOps.createTaskOp(chatCtx(w.member.id), { title: 't', projectId: w.project.id, boardId: w.board.id })
    expect(created).toMatchObject({ success: true })
    expect(await prisma.task.findUnique({ where: { id: (created as { taskId: string }).taskId } })).toMatchObject({ boardId: w.board.id })
  })

  it('create_task records the member whose chat it was as the person the task is done on behalf of (adr-0089)', async () => {
    const created = await taskOps.createTaskOp(chatCtx(w.member.id), { title: 't', projectId: w.project.id }) as { taskId: string }
    expect(await prisma.task.findUniqueOrThrow({ where: { id: created.taskId } })).toMatchObject({ onBehalfOfUserId: w.member.id })
  })
})

describe('the org-wide listings are narrowed to the caller, not the org', () => {
  let open: { id: string }
  let otherPrivate: { id: string }
  let theirPersonal: { id: string }
  beforeEach(async () => {
    open = await createProject({ accessLevel: 'OPEN' })
    otherPrivate = await createProject({ accessLevel: 'PRIVATE' })
    theirPersonal = await createProject({ accessLevel: 'PRIVATE', personalOwnerId: (await createUser()).id })
    await prisma.projectMember.create({ data: { projectId: open.id, userId: w.member.id } })
    for (const p of [open, otherPrivate, theirPersonal]) {
      const board = await prisma.board.create({ data: { name: 'B', projectId: p.id } })
      await createTestTask({ data: { title: 't', projectId: p.id, boardId: board.id, number: 1, onBehalfOfUserId: 'x' } })
    }
  })

  async function seen(ctx: CallerContext) {
    const tasks = (await taskOps.listTasksOp(ctx, {}) as { tasks: Array<{ projectId: string }> }).tasks.map((t) => t.projectId)
    const boards = (await boardOps.listBoardsOp(ctx, {})).boards.map((b) => b.projectId)
    const projects = (await agentOps.listProjectsOp(ctx, {})).projects.map((p) => p.projectId)
    return { tasks: new Set(tasks), boards: new Set(boards), projects: new Set(projects) }
  }

  it.each([
    ['a chat caller', (id: string) => chatCtx(id)],
    ["a connection — an admin's included, never org-wide (adr-0090)", (id: string) => connCtx(id, { role: 'ADMIN' })],
  ])('%s sees only the projects its person is entitled to', async (_who, ctx) => {
    for (const listing of Object.values(await seen(ctx(w.outsider.id)))) expect(listing).toEqual(new Set())
    for (const listing of Object.values(await seen(ctx(w.member.id)))) expect(listing).toEqual(new Set([open.id, w.project.id]))
  })

  it('a connection limited to chosen projects sees only those of them its person is entitled to', async () => {
    const limited = connCtx(w.member.id, { projectIds: [w.project.id, otherPrivate.id] })
    for (const listing of Object.values(await seen(limited))) expect(listing).toEqual(new Set([w.project.id]))
  })

  it("a run in a project sees that project alone, and only while its person is a member of it (adr-0101)", async () => {
    await prisma.projectMember.create({ data: { projectId: otherPrivate.id, userId: w.member.id } })
    for (const listing of Object.values(await seen(runCtx(otherPrivate.id)))) expect(listing).toEqual(new Set([otherPrivate.id]))
    await prisma.projectMember.deleteMany({ where: { projectId: otherPrivate.id } })
    for (const listing of Object.values(await seen(runCtx(otherPrivate.id)))) expect(listing).toEqual(new Set())
  })
})

describe('the other caller kinds are unaffected', () => {
  it("a run in the project is served while its person is a member", async () => {
    await expect(taskOps.getTaskDetailsOp(runCtx(w.project.id), { taskId: w.task.id })).resolves.toMatchObject({ taskId: w.task.id })
  })

  it('an open project is reachable by its members only, as it is in the browser (adr-0099)', async () => {
    await prisma.project.update({ where: { id: w.project.id }, data: { accessLevel: 'OPEN' } })
    await expectForbidden(taskOps.getTaskDetailsOp(chatCtx(w.outsider.id), { taskId: w.task.id }))
    await expect(taskOps.getTaskDetailsOp(chatCtx(w.member.id), { taskId: w.task.id })).resolves.toMatchObject({ taskId: w.task.id })
  })
})

// A personal project (agents own schedule spec §4): its own person alone reaches it —
// not someone with a member row in it, not an org admin's connection, not another boundary's run.
describe("a personal project's tasks and boards are its person's alone", () => {
  let owner: { id: string }
  beforeEach(async () => {
    owner = await createUser()
    await prisma.userSettings.create({ data: { userId: owner.id, role: 'MEMBER' } })
    await prisma.project.update({ where: { id: w.project.id }, data: { personalOwnerId: owner.id } })
    await prisma.task.update({ where: { id: w.task.id }, data: { onBehalfOfUserId: owner.id } })
    await prisma.agentSession.create({ data: { id: 's-owner', userId: owner.id, agentId: w.agentId, sessionType: 'chat' } })
  })

  const calls = (): Call[] => [
    ...taskCalls().filter(([name]) => ['get_task_details', 'update_task', 'add_comment', 'run_task'].includes(name)),
    ['get_board', (ctx) => boardOps.getBoardOp(ctx, { boardId: w.board.id })],
    ['create_task', (ctx) => taskOps.createTaskOp(ctx, { title: 't', projectId: w.project.id })],
  ]

  it.each([0, 1, 2, 3, 4, 5])(
    "call %i refuses anyone else, their connections and other boundaries' runs, and serves its owner, their connection and its own run",
    async (i) => {
      const [, call] = calls()[i]
      // w.member keeps a member row, which must not matter.
      await expectForbidden(call(chatCtx(w.member.id, 'ADMIN')))
      await expectForbidden(call(connCtx(w.member.id, { role: 'ADMIN' })))
      await expectForbidden(call(runCtx('some-other-project', { userId: w.member.id })))
      await expect(call(connCtx(owner.id))).resolves.toBeDefined()
      await expect(call(chatCtx(owner.id, 'MEMBER', { sessionId: 's-owner' }))).resolves.toBeDefined()
      await expect(call(runCtx(w.project.id, { userId: owner.id, taskId: w.task.id }))).resolves.toBeDefined()
    },
  )
})

// A person's own connection (adr-0090) acts as its person and never as more:
// their membership, their role, and then its own project list on top.
describe("a person's connection reaches what its person does, narrowed by its project list", () => {
  const calls = (): Call[] => [
    ...taskCalls(),
    ['get_board', (ctx) => boardOps.getBoardOp(ctx, { boardId: w.board.id })],
    ['create_board', (ctx) => boardOps.createBoardOp(ctx, { projectId: w.project.id, name: 'B' })],
    ['create_task', (ctx) => taskOps.createTaskOp(ctx, { title: 't', projectId: w.project.id })],
  ]

  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8])('call %i: a non-member\'s connection is refused (an admin\'s included), and a member\'s, limited elsewhere, too', async (i) => {
    const [, call] = calls()[i]
    await expectForbidden(call(connCtx(w.outsider.id)))
    await expectForbidden(call(connCtx(w.outsider.id, { role: 'ADMIN' })))
    const err = await expectForbidden(call(connCtx(w.member.id, { projectIds: ['some-other-project'] })))
    expect(err.message).toMatch(/not limited to/)
  })

  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8])("call %i: a member's connection is served, unlimited or limited to this project", async (i) => {
    const [name, call] = calls()[i]
    await expect(call(connCtx(w.member.id, { projectIds: [w.project.id] }))).resolves.toBeDefined()
    // Archiving or deleting twice is not the point here.
    if (name !== 'delete_task' && name !== 'archive_task') await expect(call(connCtx(w.member.id))).resolves.toBeDefined()
  })

  it("is held to its person's role in the project: the connection of its Viewer — an org admin even — cannot run, archive or delete a task", async () => {
    await setProjectRole(w.project.id, w.member.id, 'VIEWER')
    const viewer = connCtx(w.member.id, { role: 'ADMIN' })
    await expectForbidden(taskOps.runTaskOp(viewer, { taskId: w.task.id }))
    await expectForbidden(taskOps.archiveTaskOp(viewer, { taskId: w.task.id }))
    await expectForbidden(taskOps.deleteTaskOp(viewer, { taskId: w.task.id }))
    expect(taskRunnerFake.taskRunner.runTask).not.toHaveBeenCalled()
    expect(await taskRow()).toMatchObject({ archived: false })
  })

  it('moving a task to a board in a project outside its list is refused, and the task stays', async () => {
    const elsewhere = await createProject({ accessLevel: 'OPEN' })
    const foreignBoard = await prisma.board.create({ data: { name: 'X', projectId: elsewhere.id } })
    await expectForbidden(taskOps.updateTaskOp(connCtx(w.member.id, { projectIds: [w.project.id] }), { taskId: w.task.id, boardId: foreignBoard.id }))
    expect(await taskRow()).toMatchObject({ boardId: w.board.id })
  })

  it('writes a comment as its person, through the connection — never as an agent it names', async () => {
    await taskOps.addCommentOp(connCtx(w.member.id, { connectionId: 'conn-7' }), { taskId: w.task.id, agentId: 'agent-impersonated', content: 'hi' })
    expect(await prisma.taskComment.findFirstOrThrow()).toMatchObject({
      taskId: w.task.id, authorType: 'USER', userId: w.member.id, connectionId: 'conn-7', content: 'hi', agentId: null,
    })
  })
})
