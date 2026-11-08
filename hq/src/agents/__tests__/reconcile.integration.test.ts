/**
 * Reconcile on reconnect, against the real database (@SC-340, @SC-341): a site that comes back is asked about
 * every running task of its own, and a run that ended while it was away is fed through the same path a live
 * frame takes; a task the site has no run for is failed with why. The runs are held by the siteRuntimeStore fake.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser, ensureExecutionSite } from '../../test/factories'
import { addTask, agentInProject, stateOf } from './taskRunFixtures'
import { secondSite } from './manifestFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
const socket = vi.hoisted(() => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/socket', () => socket)

import { reconcileSite, type EmitStatus } from '../reconcileService'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const NO_RECORD = "site has no record of this task's run"
let emitStatus: Mock<EmitStatus>

beforeEach(() => {
  socket.emitTaskUpdated.mockReset()
  emitStatus = vi.fn<EmitStatus>().mockResolvedValue(undefined)
})

async function runningOnHere(data: Record<string, unknown> = {}) {
  const here = await ensureExecutionSite()
  const where = await agentInProject({ executionSiteId: here.id })
  const task = await addTask(where, { runState: 'RUN_ACTIVE', ...data })
  return { here, ...where, task }
}

describe('which tasks are reconciled', () => {
  it("this site's running tasks only: not another site's, and not a queued one", async () => {
    const { here, task, agent, project, person } = await runningOnHere()
    const there = await secondSite()
    const elsewhere = await addTask(await agentInProject({ executionSiteId: there.id }), { runState: 'RUN_ACTIVE' })
    const queued = await addTask({ agent, project, person })

    await reconcileSite(here.siteId, emitStatus)

    expect(await stateOf(task.id)).toMatchObject({ runState: 'RUN_FAILED', runStateReason: NO_RECORD })
    expect((await stateOf(elsewhere.id)).runState).toBe('RUN_ACTIVE')
    expect((await stateOf(queued.id)).runState).toBe('RUN_QUEUED')
  })

  it("a personal project's task, on the site holding its person's storage (agents own schedule spec §4)", async () => {
    const here = await ensureExecutionSite()
    const there = await secondSite()
    const owner = await createUser()
    await prisma.userStoragePlacement.create({ data: { userId: owner.id, siteId: here.id } })
    const personal = await createProject({ name: 'Mine', personalOwnerId: owner.id, personalSpace: true, executionSiteId: null, accessLevel: 'PRIVATE' })
    const task = await addTask({ project: personal, agent: await createAgent(), person: owner }, { runState: 'RUN_ACTIVE' })

    await reconcileSite(there.siteId, emitStatus)
    expect((await stateOf(task.id)).runState).toBe('RUN_ACTIVE')

    await reconcileSite(here.siteId, emitStatus)
    expect((await stateOf(task.id)).runStateReason).toBe(NO_RECORD)
  })

  it('a task with no agent is skipped without asking the site', async () => {
    const { here, task } = await runningOnHere({ assignedAgentId: null })
    await reconcileSite(here.siteId, emitStatus)
    expect((await stateOf(task.id)).runState).toBe('RUN_ACTIVE')
    expect(siteStore.listRuns).not.toHaveBeenCalled()
  })
})

describe('what reconciling does', () => {
  it('feeds a run that ended while the site was away through the status path, as a frame', async () => {
    const { here, task, agent } = await runningOnHere()
    siteStore.addRun(here.siteId, { id: 'run-old', taskId: task.id, sessionId: 's0', agentId: agent.id, status: 'FAILED', createdAt: '2026-10-01T00:00:00Z' })
    siteStore.addRun(here.siteId, { id: 'run-1', taskId: task.id, sessionId: 's1', agentId: agent.id, status: 'COMPLETED', createdAt: '2026-10-02T00:00:00Z' })

    await reconcileSite(here.siteId, emitStatus)

    expect(emitStatus).toHaveBeenCalledWith(here.siteId, {
      runId: 'run-1', sessionId: 's1', taskId: task.id, agentId: agent.id, agentHandle: agent.handle,
      status: 'COMPLETED', error: null, sessionPatch: null, manifestPending: null,
    })
    // The frame settles the task; reconcile itself writes nothing.
    expect((await stateOf(task.id)).runState).toBe('RUN_ACTIVE')
  })

  it('carries a pending tool request through', async () => {
    const { here, task, agent } = await runningOnHere()
    siteStore.addRun(here.siteId, {
      id: 'run-1', taskId: task.id, agentId: agent.id, status: 'FAILED', error: 'boom',
      manifestStatus: 'PENDING_APPROVAL', pendingManifest: { tools: ['bash'] } as never,
    })
    await reconcileSite(here.siteId, emitStatus)
    expect(emitStatus.mock.calls[0][1].manifestPending).toEqual({ runId: 'run-1', summary: null, pendingManifest: { tools: ['bash'] } })
  })

  it('fails a task the site has no run for, with why, and tells its board', async () => {
    const here = await ensureExecutionSite()
    const where = await agentInProject({ executionSiteId: here.id })
    const task = await addTask(where, { runState: 'RUN_ACTIVE' })

    await reconcileSite(here.siteId, emitStatus)

    expect(await stateOf(task.id)).toMatchObject({ runState: 'RUN_FAILED', runStateReason: NO_RECORD })
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(where.project.id)
    expect(emitStatus).not.toHaveBeenCalled()
  })

  it.each(['PENDING', 'RUNNING'] as const)('leaves a task whose newest run is %s alone', async (status) => {
    const { here, task, agent } = await runningOnHere()
    siteStore.addRun(here.siteId, { id: 'run-1', taskId: task.id, agentId: agent.id, status })
    await reconcileSite(here.siteId, emitStatus)
    expect((await stateOf(task.id)).runState).toBe('RUN_ACTIVE')
    expect(emitStatus).not.toHaveBeenCalled()
  })

  it('stops quietly when the site goes away again mid-sweep, changing nothing', async () => {
    const { here, task, agent, project, person } = await runningOnHere()
    const other = await addTask({ agent: await createAgent(), project, person }, { runState: 'RUN_ACTIVE' })
    siteStore.makeSiteUnreachable(here.siteId)

    await expect(reconcileSite(here.siteId, emitStatus)).resolves.toBeUndefined()

    expect((await stateOf(task.id)).runState).toBe('RUN_ACTIVE')
    expect((await stateOf(other.id)).runState).toBe('RUN_ACTIVE')
    expect(siteStore.listRuns).toHaveBeenCalledTimes(1)
  })

  it("one task's error does not stop the sweep reaching the next", async () => {
    const { here, task, agent, project, person } = await runningOnHere()
    const other = await addTask({ agent, project, person }, { runState: 'RUN_ACTIVE' })
    siteStore.addRun(here.siteId, { id: 'run-a', taskId: task.id, agentId: agent.id, status: 'COMPLETED' })
    siteStore.addRun(here.siteId, { id: 'run-b', taskId: other.id, agentId: agent.id, status: 'COMPLETED' })
    siteStore.listRuns.mockRejectedValueOnce(new Error('boom'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})

    await reconcileSite(here.siteId, emitStatus)
    errorLog.mockRestore()

    expect(emitStatus).toHaveBeenCalledTimes(1)
  })
})
