/**
 * Sprint boards (adr-0097), against the real test DB: a sprint board starts in
 * its first sprint; a task in one of its columns is in the current sprint and
 * one in its Backlog in none; finishing a sprint keeps its done tasks recorded
 * in it, starts the next with the same length, and sends the unfinished tasks
 * where whoever finishes it says — which they must say, in hq's action and in
 * the agents' tool alike. Written by lane W of the every-screen-reviewed unit;
 * run by the lead.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { createBoard, moveTaskToColumn, returnTaskToBacklog, createTask, finishSprint as finishSprintRecord, currentSprint } from '../projectService'
import { finishSprint, renameSprint, getBoardSprints, getSprintTasks, getProjectBoards } from '../boardOperations'
import { getBoard } from '../queries'
import { originByPerson } from '../taskOnBehalfOf'
import { finishSprintOp } from '../../server/controlplane/boardOps'
import { chatCtx, chatSession } from '../../server/controlplane/__tests__/controlPlaneFixtures'
import { ctx } from './projectsHarness'

const COLUMNS = [
  { name: 'todo', label: 'To Do', status: 'todo' },
  { name: 'doing', label: 'Doing', status: 'in_progress' },
  { name: 'done', label: 'Done', status: 'done' },
]

async function sprintBoard() {
  const person = await createUserWithRole('MEMBER')
  const project = await createProject({ accessLevel: 'OPEN' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: person.id } })
  await chatSession(person.id)
  const board = await createBoard({ projectId: project.id, name: 'Web', kind: 'SPRINTS', columns: COLUMNS, sprintDays: 14, now: new Date('2026-10-01T10:00:00Z') })
  const task = (title: string, column?: string) => createTask({ title, projectId: project.id, boardId: board.id, column, origin: originByPerson(person.id) })
  return { person, project, board, task }
}

const row = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } })

describe('a sprint board @SC-547', () => {
  it('starts in Sprint 1, of the length asked for', async () => {
    const { board } = await sprintBoard()
    expect(await currentSprint(board.id)).toMatchObject({
      number: 1, name: null, finishedAt: null,
      startDate: new Date('2026-10-01T00:00:00Z'), finishDate: new Date('2026-10-15T00:00:00Z'),
    })
  })

  it('puts a task in one of its columns in the current sprint, and one in its Backlog in none', async () => {
    const { board, task } = await sprintBoard()
    const sprint = (await currentSprint(board.id))!
    const inColumn = await task('A', 'todo')
    const inBacklog = await task('B')
    expect((await row(inColumn.id)).sprintId).toBe(sprint.id)
    expect((await row(inBacklog.id)).sprintId).toBeNull()

    await moveTaskToColumn({ taskId: inBacklog.id, column: 'doing' })
    expect((await row(inBacklog.id)).sprintId).toBe(sprint.id)
    await returnTaskToBacklog({ taskId: inColumn.id })
    expect(await row(inColumn.id)).toMatchObject({ sprintId: null, column: null })
  })

  it("shows the current sprint's tasks in its columns, and the tasks in no sprint in its Backlog", async () => {
    const { person, board, task } = await sprintBoard()
    const a = await task('A', 'todo')
    const b = await task('B')
    const view = await getBoard({ boardId: board.id }, ctx(person))
    expect(view.tasks.map(t => t.id)).toEqual([a.id])
    expect(view.backlog.map(t => t.id)).toEqual([b.id])
    expect(view.currentSprint).toMatchObject({ number: 1, label: 'Sprint 1' })
  })
})

describe('finishing a sprint', () => {
  it('keeps the done tasks in it, starts the next with the same length, and sends the unfinished to the next sprint @SC-548', async () => {
    const { board, task } = await sprintBoard()
    const first = (await currentSprint(board.id))!
    const done = await task('Done', 'done')
    const open = await task('Open', 'doing')
    const result = await finishSprintRecord(board.id, 'next', new Date('2026-10-14T16:00:00Z'))

    expect(result.next).toMatchObject({ number: 2, startDate: new Date('2026-10-14T00:00:00Z'), finishDate: new Date('2026-10-28T00:00:00Z') })
    expect((await prisma.sprint.findUniqueOrThrow({ where: { id: first.id } })).finishedAt).not.toBeNull()
    expect(await row(done.id)).toMatchObject({ sprintId: first.id, column: 'done' })
    expect(await row(open.id)).toMatchObject({ sprintId: result.next.id, column: 'doing' })
    expect(result.movedTaskIds).toEqual([open.id])
  })

  it("sends the unfinished to the Backlog when asked, withdrawing a queued run there, and leaves the done ones recorded @SC-548", async () => {
    const { board, task } = await sprintBoard()
    const first = (await currentSprint(board.id))!
    const done = await task('Done', 'done')
    const open = await task('Open', 'doing')
    await prisma.task.update({ where: { id: open.id }, data: { runState: 'RUN_QUEUED' } })
    await finishSprintRecord(board.id, 'backlog')
    expect(await row(open.id)).toMatchObject({ sprintId: null, column: null, status: 'TODO', runState: 'RUN_NONE' })
    expect(await row(done.id)).toMatchObject({ sprintId: first.id })
  })

  it('takes no default: with no destination, hq refuses and nothing changes @SC-548', async () => {
    const { person, board, task } = await sprintBoard()
    const open = await task('Open', 'doing')
    const before = await prisma.sprint.findMany({ where: { boardId: board.id } })
    await expect(finishSprint({ boardId: board.id } as never, ctx(person))).rejects.toMatchObject({ statusCode: 400 })
    await expect(finishSprint({ boardId: board.id, unfinished: 'later' } as never, ctx(person))).rejects.toMatchObject({ statusCode: 400 })
    await expect(finishSprintRecord(board.id, undefined as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.sprint.findMany({ where: { boardId: board.id } })).toEqual(before)
    expect((await row(open.id)).sprintId).toBe(before[0].id)
  })

  it("takes no default in the agents' tool either @SC-548", async () => {
    const { person, board } = await sprintBoard()
    await expect(finishSprintOp(chatCtx(person.id), { boardId: board.id } as never)).rejects.toMatchObject({ code: 'invalid' })
    expect(await prisma.sprint.count({ where: { boardId: board.id } })).toBe(1)
    const done = await finishSprintOp(chatCtx(person.id), { boardId: board.id, unfinished: 'next' })
    expect(done).toMatchObject({ unfinished: 'next', next: { number: 2 } })
  })

  it('finishes it once when two finish it at the same moment @SC-549', async () => {
    const { board } = await sprintBoard()
    const results = await Promise.allSettled([finishSprintRecord(board.id, 'next'), finishSprintRecord(board.id, 'next')])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(await prisma.sprint.count({ where: { boardId: board.id } })).toBe(2)
  })

  it('is refused on a board with no sprints @SC-549', async () => {
    const { project } = await sprintBoard()
    const workflow = await createBoard({ projectId: project.id, name: 'Flow' })
    await expect(finishSprintRecord(workflow.id, 'next')).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('past sprints, and a rename @SC-550', () => {
  it('a renamed sprint keeps its number; past sprints and their done tasks stay readable', async () => {
    const { person, board, task } = await sprintBoard()
    const first = (await currentSprint(board.id))!
    const done = await task('Done', 'done')
    await renameSprint({ sprintId: first.id, name: 'Pricing push' }, ctx(person))
    await finishSprintRecord(board.id, 'next')

    const sprints = await getBoardSprints({ boardId: board.id }, ctx(person))
    expect(sprints.map(s => [s.number, s.label, s.taskCount, s.doneCount])).toEqual([
      [2, 'Sprint 2', 0, 0],
      [1, 'Sprint 1 · Pricing push', 1, 1],
    ])
    expect((await getSprintTasks({ sprintId: first.id }, ctx(person))).map(t => t.id)).toEqual([done.id])
  })

  it("the boards list shows a sprint board's current sprint and its days left @SC-546", async () => {
    const { person, project, board } = await sprintBoard()
    const [summary] = (await getProjectBoards({ projectId: project.id }, ctx(person))).filter(b => b.id === board.id)
    expect(summary.currentSprint).toMatchObject({ number: 1, label: 'Sprint 1' })
    expect(typeof summary.currentSprint!.daysLeft).toBe('number')
  })
})
