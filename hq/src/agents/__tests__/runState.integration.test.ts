/**
 * The run state against Postgres (agents own schedule spec §6), reproducing the
 * owner's walkthrough of the pulse. A batch of three is claimed through
 * TaskRunner; the agent acts on its tasks mid-run through the real moves
 * (taskColumnService.setTaskState); run.status frames arrive the way a site sends
 * them, into the real status listener. The batch must carry on, and the run
 * states must stay consistent with the task states:
 *
 *   finding 1 — the agent moves its running task to review;
 *   finding 2 — the agent moves its running task to done just before the run ends;
 *   finding 4 — no run state contradicts the task state, and none is DONE;
 *   finding 5 — the agent moves its other, waiting task to done.
 *
 * Only the site is stood in for: dispatch returns a run id, and frames are
 * handed to the listener directly. Written by lane G; run by the lead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createTestTask } from '../../test/factories'
import { startsLanded } from './taskRunFixtures'

vi.mock('wasp/server', async () => {
  const { prisma: testDbPrisma } = await import('../../test/db')
  class HttpError extends Error {
    constructor(public statusCode: number, message?: string) { super(message) }
  }
  return { prisma: testDbPrisma, HttpError }
})

vi.mock('../dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../sites/activeRunTracker', () => ({ registerActiveRunTracker: vi.fn() }))
const listeners = vi.hoisted(() => new Map<string, (e: unknown, siteId: string) => Promise<void>>())
vi.mock('../../sites/channel/siteEventHandler', () => ({
  onRunStatus: (name: string, l: (e: unknown, siteId: string) => Promise<void>) => listeners.set(name, l),
}))

import { taskRunner } from '../TaskRunner'
import { setTaskState } from '../../projects/taskColumnService'
import * as dispatchFake from '../../test/fakes/dispatchService'

const RUN_STATES = new Set(['RUN_NONE', 'RUN_QUEUED', 'RUN_ACTIVE', 'RUN_BLOCKED', 'RUN_FAILED'])

let runs = 0
/** The batch the test made: an end's trigger-next starts the next of them without waiting. */
let batch: string[] = []

async function batchOfThree() {
  const project = await createProject()
  const agent = await createAgent()
  const ids: string[] = []
  // A line is in the project's rank order; with no rank, by number, so T1, T2, T3 is the line's order.
  const made = Date.now() - 10_000
  for (let i = 0; i < 3; i++) {
    const t = await createTestTask({
      data: {
        title: `T${i + 1}`, projectId: project.id, number: i + 1, state: 'TODO', assignedAgentId: agent.id, onBehalfOfUserId: 'person-1', runState: 'RUN_QUEUED',
        createdAt: new Date(made + i * 1_000),
      } as never,
    })
    ids.push(t.id)
  }
  for (const id of ids) await taskRunner.runTask(id, agent, 'schedule')
  batch = ids
  return { project, agent, ids }
}

async function states(ids: string[]) {
  const rows = await prisma.task.findMany({ where: { id: { in: ids } }, select: { id: true, runState: true } })
  const byId = new Map(rows.map(r => [r.id, r.runState as string]))
  return ids.map(id => byId.get(id))
}

/** The run's end, as the site sends it: for the run hq recorded on dispatch. */
async function end(taskId: string, status: 'COMPLETED' | 'FAILED' | 'CANCELLED' = 'COMPLETED') {
  const { runId } = (await prisma.task.findUnique({ where: { id: taskId }, select: { runId: true } }))!
  await listeners.get('task-machine')!({
    runId, sessionId: `sess-${taskId}`, taskId, agentId: 'agent', agentHandle: 'agent',
    status, error: status === 'FAILED' ? 'boom' : null, sessionPatch: null, manifestPending: null,
  }, 'site-1')
  await startsLanded(batch)
}

/** Finding 4: every run state is one of the six, and a task in a done column has no run queued. */
async function expectConsistent(projectId: string) {
  const tasks = await prisma.task.findMany({ where: { projectId }, select: { state: true, runState: true } })
  for (const t of tasks) {
    expect(RUN_STATES.has(t.runState)).toBe(true)
    if (t.state === 'DONE') expect(['RUN_QUEUED']).not.toContain(t.runState)
  }
}

beforeEach(() => {
  runs = 0
  vi.clearAllMocks()
  dispatchFake.resolveSiteIdForTask.mockResolvedValue('site-1')
  dispatchFake.dispatchTaskRun.mockImplementation(async (taskId: string) => ({ runId: `run-${++runs}-${taskId}`, sessionId: 's' }))
})

describe('a pulse batch of three, with the agent acting on its tasks mid-run', () => {
  it('starts one and leaves two queued behind it, asked to start', async () => {
    const { ids, project } = await batchOfThree()
    expect(await states(ids)).toEqual(['RUN_ACTIVE', 'RUN_QUEUED', 'RUN_QUEUED'])
    await expectConsistent(project.id)
  })

  it('finding 1: the agent moves its running task to review; its end starts the next', async () => {
    const { ids, project } = await batchOfThree()
    await setTaskState(ids[0], 'IN_PROGRESS')
    expect(await states(ids)).toEqual(['RUN_ACTIVE', 'RUN_QUEUED', 'RUN_QUEUED'])

    await end(ids[0])
    expect(await states(ids)).toEqual(['RUN_NONE', 'RUN_ACTIVE', 'RUN_QUEUED'])
    await end(ids[1])
    await end(ids[2])
    expect(await states(ids)).toEqual(['RUN_NONE', 'RUN_NONE', 'RUN_NONE'])
    await expectConsistent(project.id)
  })

  it('finding 2: the agent moves its running task to done before the run ends; the end still starts the next', async () => {
    const { ids, project } = await batchOfThree()
    await setTaskState(ids[0], 'DONE')
    expect(await states(ids)).toEqual(['RUN_ACTIVE', 'RUN_QUEUED', 'RUN_QUEUED'])

    await end(ids[0])
    expect(await states(ids)).toEqual(['RUN_NONE', 'RUN_ACTIVE', 'RUN_QUEUED'])
    await expectConsistent(project.id)
  })

  it('finding 5: the agent moves its other, waiting task to done; that run is withdrawn and the batch carries on', async () => {
    const { ids, project } = await batchOfThree()
    await setTaskState(ids[2], 'DONE')
    expect(await states(ids)).toEqual(['RUN_ACTIVE', 'RUN_QUEUED', 'RUN_NONE'])

    await end(ids[0])
    expect(await states(ids)).toEqual(['RUN_NONE', 'RUN_ACTIVE', 'RUN_NONE'])
    await end(ids[1])
    expect(await states(ids)).toEqual(['RUN_NONE', 'RUN_NONE', 'RUN_NONE'])
    expect(dispatchFake.dispatchTaskRun).toHaveBeenCalledTimes(2)
    await expectConsistent(project.id)
  })

  it('a failed run, then a duplicate of its end: the failure stays, the next starts once', async () => {
    const { ids, project } = await batchOfThree()
    await end(ids[0], 'FAILED')
    const duplicate = await prisma.task.findUnique({ where: { id: ids[0] }, select: { runId: true } })
    expect(duplicate!.runId).toBe(`run-1-${ids[0]}`)
    await end(ids[0], 'FAILED')
    expect(await states(ids)).toEqual(['RUN_FAILED', 'RUN_ACTIVE', 'RUN_QUEUED'])
    expect(dispatchFake.dispatchTaskRun).toHaveBeenCalledTimes(2)
    await expectConsistent(project.id)
  })
})
