/** A task's run never starts its own task again (W13 of the live preview walk): it is that task's run. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db, scoped, runner } = vi.hoisted(() => ({
  db: { task: { findUnique: vi.fn() } },
  scoped: vi.fn(),
  runner: { runTask: vi.fn() },
}))
vi.mock('wasp/server', () => ({ prisma: db }))
vi.mock('../taskScoped', () => ({ loadTaskScoped: scoped }))
vi.mock('../../../agents/TaskRunner', () => ({ taskRunner: runner }))
vi.mock('../../../automation/automationStore', () => ({ effectiveForProject: vi.fn() }))

import { OWN_TASK, runTaskOp } from '../runTaskOp'
import type { CallerContext } from '../types'

const run = (taskId: string | null): CallerContext => ({ kind: 'run', claims: { taskId, startedBy: 'person' } as never })

beforeEach(() => {
  vi.clearAllMocks()
  scoped.mockResolvedValue({ id: 'task-1', projectId: 'p-1', boardId: 'b-1', runState: 'RUN_ACTIVE' })
})

describe('run_task from inside a task\'s own run', () => {
  it('is refused, by the task\'s id however the agent named it, and nothing is started', async () => {
    await expect(runTaskOp(run('task-1'), { taskId: 'SHOP-7' })).rejects.toMatchObject({ code: 'forbidden', message: OWN_TASK })
    expect(db.task.findUnique).not.toHaveBeenCalled()
    expect(runner.runTask).not.toHaveBeenCalled()
  })

  it('goes on to the usual checks for another task', async () => {
    db.task.findUnique.mockResolvedValue(null)
    await expect(runTaskOp(run('task-2'), { taskId: 'task-1' })).rejects.toMatchObject({ code: 'not_found' })
  })
})
