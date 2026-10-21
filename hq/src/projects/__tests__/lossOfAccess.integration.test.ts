/**
 * adr-0089: when a person loses access to a project, the unfinished tasks done
 * on their behalf there are blocked, a run already going is stopped on its site
 * after the block is written, and their routines there pause until a project
 * admin takes them over (spec §3). Against the real test DB, with the site as
 * the shared fake.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser } from '../../test/factories'
import { makeBoard, makeTask } from './projectsHarness'

const socket = vi.hoisted(() => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/socket', () => socket)
vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { blockTasksForLostAccess } from '../lossOfAccess'
import { LOST_ACCESS_REASON } from '../taskOnBehalfOf'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

async function cast() {
  const dana = await createUser()
  const other = await createUser()
  const project = await createProject()
  const board = await makeBoard(project.id)
  return { dana, other, project, board }
}
const task = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } })

describe('blockTasksForLostAccess (adr-0089)', () => {
  it('blocks every unfinished task the filter selects, with the reason that says why, and tells its board', async () => {
    const { dana, other, project, board } = await cast()
    const queued = await makeTask(project.id, { onBehalfOfUserId: dana.id, runState: 'RUN_QUEUED', boardId: board.id })
    const idle = await makeTask(project.id, { onBehalfOfUserId: dana.id })
    const done = await makeTask(project.id, { onBehalfOfUserId: dana.id, status: 'DONE' })
    const archived = await makeTask(project.id, { onBehalfOfUserId: dana.id, archived: true })
    const someoneElses = await makeTask(project.id, { onBehalfOfUserId: other.id })

    expect(await blockTasksForLostAccess({ projectId: project.id, onBehalfOfUserId: dana.id })).toBe(2)

    for (const t of [queued, idle]) expect(await task(t.id)).toMatchObject({ runState: 'RUN_BLOCKED', runStateReason: LOST_ACCESS_REASON })
    for (const t of [done, archived, someoneElses]) expect((await task(t.id)).runState).toBe('RUN_NONE')
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(board.id)
    expect(siteStore.cancelledRuns).toEqual([])
  })

  it("stops a running task's run on its site, after the block is written", async () => {
    const { dana, project } = await cast()
    const running = await makeTask(project.id, { onBehalfOfUserId: dana.id, runState: 'RUN_ACTIVE' })
    siteStore.addRun('site-1', { id: 'run-1', taskId: running.id, status: 'RUNNING' })
    let taskAtCancel: string | undefined
    siteStore.cancelRun.mockImplementationOnce(async () => { taskAtCancel = (await task(running.id)).runState })

    await blockTasksForLostAccess({ onBehalfOfUserId: dana.id })

    expect(siteStore.cancelRun).toHaveBeenCalledWith('site-1', 'run-1')
    expect(taskAtCancel).toBe('RUN_BLOCKED')
  })

  it('keeps the block when the site cannot be reached to stop the run', async () => {
    const { dana, project } = await cast()
    const running = await makeTask(project.id, { onBehalfOfUserId: dana.id, runState: 'RUN_ACTIVE' })
    siteStore.makeSiteUnreachable('site-1')

    await expect(blockTasksForLostAccess({ onBehalfOfUserId: dana.id })).resolves.toBe(1)
    expect((await task(running.id)).runState).toBe('RUN_BLOCKED')
  })

  it("pauses the person's routines there too, until a project admin takes them over (spec §3)", async () => {
    const { dana, other, project } = await cast()
    const routine = (onBehalfOfUserId: string) => prisma.routine.create({
      data: { projectId: project.id, title: 'R', scheduleAt: new Date(), scheduleRule: {}, scheduleTimezone: 'UTC', onBehalfOfUserId },
    })
    const danas = await routine(dana.id)
    const others = await routine(other.id)

    await blockTasksForLostAccess({ projectId: project.id, onBehalfOfUserId: dana.id })

    expect(await prisma.routine.findUniqueOrThrow({ where: { id: danas.id } }))
      .toMatchObject({ enabled: false, pausedReason: expect.stringContaining('take it over') })
    expect((await prisma.routine.findUniqueOrThrow({ where: { id: others.id } })).enabled).toBe(true)
  })

  it("answers 0 and writes nothing when no task is done on that person's behalf", async () => {
    const { dana, other, project } = await cast()
    const t = await makeTask(project.id, { onBehalfOfUserId: other.id })
    await expect(blockTasksForLostAccess({ onBehalfOfUserId: dana.id })).resolves.toBe(0)
    expect((await task(t.id)).runState).toBe('RUN_NONE')
  })

  it('never throws — the change that ended the access has already committed', async () => {
    const { dana } = await cast()
    const reads = vi.spyOn(prisma.task, 'findMany').mockRejectedValueOnce(new Error('db down'))
    await expect(blockTasksForLostAccess({ onBehalfOfUserId: dana.id })).resolves.toBe(0)
    reads.mockRestore()
  })
})
