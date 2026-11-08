/**
 * Telling the browsers watching a project's boards that a task changed, against
 * the real test DB: the project's own room and each saved board's, once, from the
 * tasks' own rows, and never at the cost of the write it follows.
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

import { projectsOfTasksWhere, notifyBoardsOfTasks, notifyProjectBoards } from '../boardNotify'

beforeEach(() => socket.emitTaskUpdated.mockClear())

/** Two projects: one with a saved board, one with none. */
async function twoProjects() {
  const project = await createProject()
  const other = await createProject()
  const saved = await makeBoard(project.id)
  const tasks = [
    await makeTask(project.id, { runState: 'RUN_BLOCKED' }),
    await makeTask(project.id),
    await makeTask(other.id),
  ]
  return { project, other, saved, tasks }
}
const told = () => socket.emitTaskUpdated.mock.calls.map((c) => c[0]).sort()

describe('notifying boards', () => {
  it("tells each project's own room, every board of it, and each saved board's room, once", async () => {
    const { project, other, saved, tasks } = await twoProjects()
    await notifyBoardsOfTasks(tasks.map((t) => t.id))
    expect(told()).toEqual([project.id, other.id, saved.id].sort())
  })

  it('tells every board of a project when asked', async () => {
    const { project, saved } = await twoProjects()
    await notifyProjectBoards(project.id)
    expect(told()).toEqual([project.id, saved.id].sort())
  })

  it('reads the projects a bulk write will change before it runs', async () => {
    const { project } = await twoProjects()
    expect(await projectsOfTasksWhere({ runState: 'RUN_BLOCKED' })).toEqual([project.id])
  })

  it('never fails the write it follows', async () => {
    const { tasks } = await twoProjects()
    const reads = vi.spyOn(prisma.task, 'findMany').mockRejectedValueOnce(new Error('db down'))
    await expect(notifyBoardsOfTasks([tasks[0].id])).resolves.toBeUndefined()
    reads.mockRestore()
    expect(socket.emitTaskUpdated).not.toHaveBeenCalled()
  })
})
