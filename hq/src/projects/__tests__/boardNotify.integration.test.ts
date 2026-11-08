/**
 * Telling the browsers watching a board that a task's run state changed,
 * against the real test DB: each board once, from the tasks' own rows, and
 * never at the cost of the write it follows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject } from '../../test/factories'
import { makeBoard, makeTask } from './projectsHarness'

const socket = vi.hoisted(() => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/socket', () => socket)
vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { boardsOfTasksWhere, notifyBoardsOfTasks, notifyProjectBoards } from '../boardNotify'

beforeEach(() => socket.emitTaskUpdated.mockClear())

async function twoBoards() {
  const project = await createProject()
  const b1 = await makeBoard(project.id)
  const b2 = await makeBoard(project.id)
  const tasks = [
    await makeTask(project.id, { boardId: b1.id, runState: 'RUN_BLOCKED' }),
    await makeTask(project.id, { boardId: b1.id }),
    await makeTask(project.id, { boardId: b2.id }),
  ]
  return { project, b1, b2, tasks }
}
const told = () => socket.emitTaskUpdated.mock.calls.map((c) => c[0]).sort()

describe('notifying boards', () => {
  it('tells each board of the tasks once', async () => {
    const { b1, b2, tasks } = await twoBoards()
    await notifyBoardsOfTasks(tasks.map((t) => t.id))
    expect(told()).toEqual([b1.id, b2.id].sort())
  })

  it('tells every board of a project when asked', async () => {
    const { project, b1, b2 } = await twoBoards()
    await notifyProjectBoards(project.id)
    expect(told()).toEqual([b1.id, b2.id].sort())
  })

  it('reads the boards a bulk write will change before it runs', async () => {
    const { b1 } = await twoBoards()
    expect(await boardsOfTasksWhere({ runState: 'RUN_BLOCKED' })).toEqual([b1.id])
  })

  it('never fails the write it follows', async () => {
    const { tasks } = await twoBoards()
    const reads = vi.spyOn(prisma.task, 'findMany').mockRejectedValueOnce(new Error('db down'))
    await expect(notifyBoardsOfTasks([tasks[0].id])).resolves.toBeUndefined()
    reads.mockRestore()
    expect(socket.emitTaskUpdated).not.toHaveBeenCalled()
  })
})
