/**
 * The agents' board and task tools on lasting boards (adr-0097) and a task's
 * plan (adr-0098), against the real test DB, under the authority rules they
 * had: a run reaches its own project only; a person's chat reaches the
 * projects its person is on. Written by lane W of the every-screen-reviewed
 * unit; run by the lead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'

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

import * as boardOps from '../boardOps'
import * as taskOps from '../taskOps'
import { seedWorld, chatCtx, runCtx, expectForbidden, setProjectRole, type World } from './controlPlaneFixtures'

let w: World
beforeEach(async () => {
  w = await seedWorld()
})

describe('create_board, list_boards and get_board @SC-556', () => {
  it('make a sprint board in Sprint 1, and read its kind, its columns and its current sprint', async () => {
    const made = await boardOps.createBoardOp(runCtx(w.project.id), {
      projectId: w.project.id, name: 'Web', kind: 'sprints', sprintDays: 7,
      columns: [{ name: 'todo', label: 'To Do', status: 'todo' }, { name: 'done', label: 'Done', status: 'done' }],
    })
    expect(made).toMatchObject({ success: true, kind: 'SPRINTS' })
    const board = await boardOps.getBoardOp(runCtx(w.project.id), { boardId: made.boardId })
    expect(board).toMatchObject({ kind: 'SPRINTS', archived: false, currentSprint: { number: 1, label: 'Sprint 1', finished: false } })
    expect(board.columns.map(c => c.name)).toEqual(['todo', 'done'])
  })

  it('refuse a column named backlog — every board has one already @SC-542', async () => {
    await expect(boardOps.createBoardOp(runCtx(w.project.id), {
      projectId: w.project.id, name: 'X', columns: [{ name: 'backlog', label: 'Backlog', status: 'todo' }],
    })).rejects.toMatchObject({ code: 'invalid' })
  })

  it('list archived boards only when asked', async () => {
    await prisma.board.update({ where: { id: w.board.id }, data: { archivedAt: new Date() } })
    expect((await boardOps.listBoardsOp(runCtx(w.project.id), {})).boards.map(b => b.boardId)).not.toContain(w.board.id)
    expect((await boardOps.listBoardsOp(runCtx(w.project.id), { includeArchived: true })).boards).toEqual(
      expect.arrayContaining([expect.objectContaining({ boardId: w.board.id, archived: true })]),
    )
  })

  it("stay inside a run's own project", async () => {
    const elsewhere = runCtx('another-project')
    await expectForbidden(boardOps.createBoardOp(elsewhere, { projectId: w.project.id, name: 'X' }))
    await expectForbidden(boardOps.getBoardOp(elsewhere, { boardId: w.board.id }))
  })
})

describe('finish_sprint and rename_sprint', () => {
  async function sprintBoard() {
    const made = await boardOps.createBoardOp(runCtx(w.project.id), { projectId: w.project.id, name: 'Web', kind: 'sprints' })
    const sprint = await prisma.sprint.findFirstOrThrow({ where: { boardId: made.boardId } })
    return { boardId: made.boardId, sprint }
  }

  it("finish_sprint needs a destination for the unfinished tasks, and a chat on behalf of the project's Viewer is refused @SC-548 @SC-549", async () => {
    const { boardId } = await sprintBoard()
    await expect(boardOps.finishSprintOp(chatCtx(w.member.id), { boardId } as never)).rejects.toMatchObject({ code: 'invalid' })
    await setProjectRole(w.project.id, w.member.id, 'VIEWER')
    await expectForbidden(boardOps.finishSprintOp(chatCtx(w.member.id), { boardId, unfinished: 'backlog' }))
    await setProjectRole(w.project.id, w.member.id, 'MEMBER')
    await expectForbidden(boardOps.finishSprintOp(runCtx('another-project'), { boardId, unfinished: 'backlog' }))
    expect(await prisma.sprint.count({ where: { boardId } })).toBe(1)
    expect(await boardOps.finishSprintOp(chatCtx(w.member.id), { boardId, unfinished: 'backlog' })).toMatchObject({ unfinished: 'backlog', next: { number: 2 } })
  })

  it('rename_sprint keeps the number @SC-550', async () => {
    const { sprint } = await sprintBoard()
    expect(await boardOps.renameSprintOp(runCtx(w.project.id), { sprintId: sprint.id, name: 'Pricing push' }))
      .toMatchObject({ sprint: { number: 1, label: 'Sprint 1 · Pricing push' } })
  })
})

describe('update_task and get_task_details on columns, boards and plans @SC-556', () => {
  it("moves a task by column, back to the Backlog with null, and to another board's Backlog @SC-543", async () => {
    const other = await prisma.board.create({ data: { name: 'Other', projectId: w.project.id } })
    await taskOps.updateTaskOp(runCtx(w.project.id), { taskId: w.task.id, column: 'in_progress' })
    expect(await prisma.task.findUniqueOrThrow({ where: { id: w.task.id } })).toMatchObject({ column: 'in_progress', status: 'IN_PROGRESS' })
    await taskOps.updateTaskOp(runCtx(w.project.id), { taskId: w.task.id, column: null })
    expect(await prisma.task.findUniqueOrThrow({ where: { id: w.task.id } })).toMatchObject({ column: null, status: 'TODO' })
    await taskOps.updateTaskOp(runCtx(w.project.id), { taskId: w.task.id, boardId: other.id })
    expect(await prisma.task.findUniqueOrThrow({ where: { id: w.task.id } })).toMatchObject({ boardId: other.id, column: null })
  })

  it('refuses a column the board does not have, naming the ones it does @SC-543', async () => {
    await expect(taskOps.updateTaskOp(runCtx(w.project.id), { taskId: w.task.id, column: 'review' }))
      .rejects.toMatchObject({ code: 'invalid', message: expect.stringContaining('todo, in_progress, done') })
  })

  it("reads back the task's column, its board's columns, and its plan", async () => {
    await taskOps.updateTaskOp(runCtx(w.project.id), { taskId: w.task.id, column: 'todo', planStart: '2026-10-10', planFinish: '2026-10-12' })
    const details = await taskOps.getTaskDetailsOp(runCtx(w.project.id), { taskId: w.task.id })
    expect(details).toMatchObject({
      column: 'todo', boardKind: 'WORKFLOW', planStart: '2026-10-10', planFinish: '2026-10-12', isEpic: false, epic: null, milestone: null,
    })
    expect(details.availableColumns.map(c => c.name)).toEqual(['todo', 'in_progress', 'done'])
  })

  it('create_task with a plan that breaks a rule creates nothing', async () => {
    const before = await prisma.task.count()
    await expect(taskOps.createTaskOp(runCtx(w.project.id, { taskId: w.task.id }), { title: 't', projectId: w.project.id, epicId: w.task.id }))
      .rejects.toMatchObject({ code: 'invalid' })
    expect(await prisma.task.count()).toBe(before)
  })
})
