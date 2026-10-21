/**
 * Each agent's line, the optional throttle, and depth (agents own schedule
 * spec §2, adr-0091) against Postgres: the real pulse, slot claim, TaskRunner,
 * status listener, column moves and control-plane tool operations. Only the
 * site is stood in for — dispatch returns a run id, and run ends are handed to
 * the status listener the way a site sends them. Written by lane H; run by the
 * lead (it needs the lane's schema migrated).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CapabilityClaims } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createAgent, createProject, createSession, createTestTask, createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma: testDbPrisma } = await import('../../test/db')
  class HttpError extends Error {
    constructor(public statusCode: number, message?: string) { super(message) }
  }
  return { prisma: testDbPrisma, HttpError }
})

vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../sites/activeRunTracker', () => ({ registerActiveRunTracker: vi.fn() }))
const listeners = vi.hoisted(() => new Map<string, (e: unknown, siteId: string) => Promise<void>>())
vi.mock('../../sites/channel/siteEventHandler', () => ({
  onRunStatus: (name: string, l: (e: unknown, siteId: string) => Promise<void>) => listeners.set(name, l),
}))

import { taskRunner } from '../../agents/TaskRunner'
import { closeFinishedRounds, firePulsesDue } from '../pulse'
import { loadOrgAutomation, releaseThrottledWhereOff, saveProjectChoice } from '../automationStore'
import { ORG_AUTOMATION_DEFAULTS } from '../automationSettings'
import { createTaskOp, runTaskOp, updateTaskOp } from '../../server/controlplane/taskOps'
import { moveTaskToColumn } from '../../projects/taskService'
import { applyMoveToRunState, queueRunIfNone } from '../../projects/taskRunMoves'
import { ControlPlaneError } from '../../server/controlplane/types'
import * as dispatchFake from '../../test/fakes/dispatchService'

const COLUMNS = [
  { name: 'ready', label: 'Ready', status: 'TODO', order: 0, color: 'x', autoQueue: true },
  { name: 'doing', label: 'Doing', status: 'IN_PROGRESS', order: 1, color: 'x' },
  { name: 'done', label: 'Done', status: 'DONE', order: 2, color: 'x' },
]
const settle = () => new Promise(r => setTimeout(r, 20))
let runs = 0
let n = 0

async function world(automation: { enabled?: boolean; throttle?: boolean; batchSize?: number; maxDepth?: number } = {}) {
  // A Member: a run is held to its person's role (adr-0101).
  const person = await createUserWithRole('MEMBER')
  const project = await createProject({ accessLevel: 'OPEN' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: person.id } })
  const agent = await createAgent()
  const board = await prisma.board.create({ data: { name: 'Board', projectId: project.id, columns: COLUMNS } as never })
  await prisma.projectAutomation.create({
    data: { projectId: project.id, enabled: true, pulseDueAt: new Date(0), ...automation },
  })
  return { person, project, agent, board }
}

async function queued(w: Awaited<ReturnType<typeof world>>, title: string, extra: Record<string, unknown> = {}) {
  return createTestTask({
    data: {
      title, projectId: w.project.id, number: ++n, boardId: w.board.id, column: 'ready', status: 'TODO',
      assignedAgentId: w.agent.id, onBehalfOfUserId: w.person.id, runState: 'RUN_QUEUED', ...extra,
    } as never,
  })
}

async function tick() {
  const org = await loadOrgAutomation()
  const now = new Date()
  await closeFinishedRounds(org, now)
  await firePulsesDue(org, now)
  await settle()
}

async function end(taskId: string) {
  const { runId } = (await prisma.task.findUnique({ where: { id: taskId }, select: { runId: true } }))!
  await listeners.get('task-machine')!({
    runId, sessionId: `s-${taskId}`, taskId, agentId: 'agent', agentHandle: 'agent',
    status: 'COMPLETED', error: null, sessionPatch: null, manifestPending: null,
  }, 'site-1')
  await settle()
}

const stateOf = async (id: string) => (await prisma.task.findUnique({ where: { id }, select: { runState: true } }))!.runState

/** A run's caller, as its signed capability describes it. */
async function runCaller(w: Awaited<ReturnType<typeof world>>, startedBy: CapabilityClaims['startedBy'], taskId: string | null) {
  const session = await createSession({ userId: w.person.id, agentId: w.agent.id, sessionType: taskId ? 'task' : 'chat' })
  const claims: CapabilityClaims = {
    tokenType: 'capability', userId: w.person.id, runner: { kind: 'project', projectId: w.project.id }, startedBy,
    agentId: w.agent.id, sessionId: session.id, projectId: w.project.id, workspaceId: null, taskId, role: null,
    siteId: 'site-1', permissions: { bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
  }
  return { kind: 'run' as const, claims }
}

beforeEach(() => {
  runs = 0
  vi.clearAllMocks()
  dispatchFake.resolveSiteIdForTask.mockResolvedValue('site-1')
  dispatchFake.dispatchTaskRun.mockImplementation(async (taskId: string) => ({ runId: `run-${++runs}-${taskId}`, sessionId: 's' }))
})

describe('throttle off: each agent works through its line', () => {
  it('three tasks for one agent start one after another, and a newly queued higher-priority task goes next', async () => {
    const w = await world()
    const [t1, t2, t3] = [await queued(w, 'T1'), await queued(w, 'T2'), await queued(w, 'T3')]
    await tick()
    expect([await stateOf(t1.id), await stateOf(t2.id), await stateOf(t3.id)]).toEqual(['RUN_ACTIVE', 'RUN_QUEUED', 'RUN_QUEUED'])

    const urgent = await queued(w, 'Urgent', { priority: 'HIGH' })
    await end(t1.id); await tick()
    expect([await stateOf(t2.id), await stateOf(urgent.id)]).toEqual(['RUN_QUEUED', 'RUN_ACTIVE'])
    await end(urgent.id); await tick()
    expect(await stateOf(t2.id)).toBe('RUN_ACTIVE')
    await end(t2.id); await tick()
    expect(await stateOf(t3.id)).toBe('RUN_ACTIVE')
    expect(dispatchFake.dispatchTaskRun).toHaveBeenCalledTimes(4)
  })
})

describe('throttle on: a batch per agent per round', () => {
  it('a batch of 2 with 3 queued: the third is throttled until the next round', async () => {
    const w = await world({ throttle: true, batchSize: 2 })
    const ids: string[] = []
    for (const title of ['T1', 'T2', 'T3']) ids.push((await queued(w, title, { runState: 'RUN_THROTTLED' })).id)
    await tick()
    expect(await Promise.all(ids.map(stateOf))).toEqual(['RUN_ACTIVE', 'RUN_QUEUED', 'RUN_THROTTLED'])
    await end(ids[0]); await tick()
    expect(await Promise.all(ids.map(stateOf))).toEqual(['RUN_NONE', 'RUN_ACTIVE', 'RUN_THROTTLED'])
    await end(ids[1]); await tick()
    expect(await Promise.all(ids.map(stateOf))).toEqual(['RUN_NONE', 'RUN_NONE', 'RUN_THROTTLED'])
    const row = await prisma.projectAutomation.findUnique({ where: { projectId: w.project.id } })
    expect(row!.openRoundId).toBeNull()
    expect(row!.pulseDueAt!.getTime()).toBeGreaterThan(Date.now())
  })
})

describe('depth stops a chain of agent-queued work (adr-0091)', () => {
  it('each pulse-started run queues one deeper; past the maximum the task is created but not queued', async () => {
    const w = await world({ maxDepth: 2 })
    let current = await queued(w, 'Asked by a person')
    for (const expected of [1, 2]) {
      const res = await createTaskOp(await runCaller(w, 'pulse', current.id), { title: `depth ${expected}`, projectId: w.project.id, boardId: w.board.id, assignedAgentId: w.agent.id, queue: true })
      const made = await prisma.task.findUnique({ where: { id: res.taskId } })
      expect(made).toMatchObject({ runState: 'RUN_QUEUED', queueDepth: expected })
      current = made!
    }
    const res = await createTaskOp(await runCaller(w, 'pulse', current.id), { title: 'depth 3', projectId: w.project.id, boardId: w.board.id, assignedAgentId: w.agent.id, queue: true })
    expect(res).toMatchObject({ queued: false, note: expect.stringMatching(/maximum depth of 2/) })
    expect(await stateOf(res.taskId)).toBe('RUN_NONE')
  })

  it('moving an old, finished task back into a column that queues counts the same — it never resets the depth', async () => {
    const w = await world({ maxDepth: 1 })
    const deep = await queued(w, 'At depth 1', { queueDepth: 1 })
    const old = await queued(w, 'Finished long ago', { runState: 'RUN_NONE', column: 'done', status: 'DONE' })
    const res = await updateTaskOp(await runCaller(w, 'pulse', deep.id), { taskId: old.id, column: 'ready' })
    expect(res).toMatchObject({ queued: false, note: expect.stringMatching(/maximum depth of 1/) })
    expect(await prisma.task.findUnique({ where: { id: old.id } })).toMatchObject({ column: 'ready', runState: 'RUN_NONE' })

    // A person queueing it puts it back at depth 0.
    await moveTaskToColumn({ taskId: old.id, column: 'doing' })
    await moveTaskToColumn({ taskId: old.id, column: 'ready', queuer: { kind: 'person', userId: w.person.id } })
    expect(await prisma.task.findUnique({ where: { id: old.id } })).toMatchObject({ runState: 'RUN_QUEUED', queueDepth: 0 })
  })
})

describe('run_task cannot become an unbounded chain counted as the person\'s', () => {
  it('a person-started run starts a task as the agent\'s; that run cannot start another', async () => {
    const w = await world()
    const pressed = await queued(w, 'Run pressed', { runState: 'RUN_NONE' })
    const first = await queued(w, 'Started by run_task', { queueDepth: 2 })
    const second = await queued(w, 'Would be next')

    await runTaskOp(await runCaller(w, 'person', pressed.id), { taskId: first.id })
    expect(await prisma.task.findUnique({ where: { id: first.id } })).toMatchObject({
      runState: 'RUN_ACTIVE', runStartedBy: 'agent', queueDepth: 0,
    })
    expect(dispatchFake.dispatchTaskRun).toHaveBeenLastCalledWith(first.id, expect.anything(), 'agent')

    const refused = await runTaskOp(await runCaller(w, 'agent', first.id), { taskId: second.id }).catch(e => e)
    expect(refused).toBeInstanceOf(ControlPlaneError)
    expect(refused.code).toBe('forbidden')
    expect(await stateOf(second.id)).toBe('RUN_QUEUED')
  })
})

// Kept separate from the suites above: it reaches TaskRunner directly, the way a person's Run does.
describe('a person is never held to the throttle', () => {
  it('starting a throttled task directly starts it, at depth 0', async () => {
    const w = await world({ throttle: true })
    const t = await queued(w, 'Throttled', { runState: 'RUN_THROTTLED', queueDepth: 2 })
    expect((await taskRunner.runTask(t.id, w.agent, 'person')).outcome).toBe('started')
    expect(await prisma.task.findUnique({ where: { id: t.id } })).toMatchObject({ runState: 'RUN_ACTIVE', queueDepth: 0 })
  })
})

describe('throttle off: the pulse\'s line and a person\'s asks', () => {
  it('records each start the pulse made, in order', async () => {
    const w = await world()
    const ids = [(await queued(w, 'T1')).id, (await queued(w, 'T2')).id]
    await tick()
    await end(ids[0]); await tick()
    const records = await prisma.automationStart.findMany({ where: { projectId: w.project.id }, orderBy: { firedAt: 'asc' } })
    expect(records.map(r => (r.started as Array<Record<string, unknown>>)[0])).toEqual([
      expect.objectContaining({ taskId: ids[0], outcome: 'started' }),
      expect.objectContaining({ taskId: ids[1], outcome: 'started' }),
    ])
  })

  it('a start someone asked for goes ahead of the pulse\'s line', async () => {
    const w = await world()
    const [t1, t2] = [await queued(w, 'T1'), await queued(w, 'T2')]
    await tick()
    const asked = await queued(w, 'Asked', { priority: 'LOW' })
    expect((await taskRunner.runTask(asked.id, w.agent, 'person')).outcome).toBe('waiting')
    await end(t1.id)
    expect([await stateOf(t2.id), await stateOf(asked.id)]).toEqual(['RUN_QUEUED', 'RUN_ACTIVE'])
  })

  it('with automation off nothing starts by itself — only a start someone asked for, when the agent comes free', async () => {
    const w = await world({ enabled: false })
    const [t1, t2, t3] = [await queued(w, 'T1'), await queued(w, 'T2'), await queued(w, 'T3')]
    await tick()
    expect(await Promise.all([t1, t2, t3].map(t => stateOf(t.id)))).toEqual(['RUN_QUEUED', 'RUN_QUEUED', 'RUN_QUEUED'])

    expect((await taskRunner.runTask(t1.id, w.agent, 'person')).outcome).toBe('started')
    expect((await taskRunner.runTask(t2.id, w.agent, 'person')).outcome).toBe('waiting')
    await end(t1.id)
    expect([await stateOf(t1.id), await stateOf(t2.id)]).toEqual(['RUN_NONE', 'RUN_ACTIVE'])
    await end(t2.id); await tick()
    expect(await stateOf(t3.id)).toBe('RUN_QUEUED')
  })
})

describe('throttle on: holding, releasing and withdrawing', () => {
  it('queueing in a throttled boundary holds the task for the next round', async () => {
    const w = await world({ throttle: true })
    const t = await queued(w, 'T1', { runState: 'RUN_NONE' })
    expect(await queueRunIfNone(t.id, null)).toBe(true)
    expect(await stateOf(t.id)).toBe('RUN_THROTTLED')
  })

  it('a run end starts the agent\'s next queued task only — never a throttled one', async () => {
    const w = await world({ throttle: true, batchSize: 1 })
    const [t1, t2] = [await queued(w, 'T1', { runState: 'RUN_THROTTLED' }), await queued(w, 'T2', { runState: 'RUN_THROTTLED' })]
    await tick()
    expect(await stateOf(t1.id)).toBe('RUN_ACTIVE')
    await end(t1.id)
    expect([await stateOf(t1.id), await stateOf(t2.id)]).toEqual(['RUN_NONE', 'RUN_THROTTLED'])
  })

  it('switching the throttle off lets every throttled task into its agent\'s line', async () => {
    const w = await world({ throttle: true })
    const [t1, t2] = [await queued(w, 'T1', { runState: 'RUN_THROTTLED' }), await queued(w, 'T2', { runState: 'RUN_THROTTLED' })]
    await saveProjectChoice(w.project.id, {
      enabled: true, intervalMinutes: null, batchSize: null, queueLimit: null, agentSchedules: false, throttle: false, maxDepth: null,
    }, w.person.id)
    expect(await Promise.all([t1, t2].map(t => stateOf(t.id)))).toEqual(['RUN_QUEUED', 'RUN_QUEUED'])
  })

  it('the org requiring the throttle keeps it on for a project that chose it off; lifting it releases the tasks', async () => {
    const w = await world({ throttle: false })
    await prisma.org.create({ data: { name: 'Org', automationThrottle: true } })
    const t = await queued(w, 'T1', { runState: 'RUN_NONE' })
    await queueRunIfNone(t.id, null)
    expect(await stateOf(t.id)).toBe('RUN_THROTTLED')
    expect(await releaseThrottledWhereOff({ ...ORG_AUTOMATION_DEFAULTS, throttle: true })).toBe(0)
    expect(await stateOf(t.id)).toBe('RUN_THROTTLED')
    expect(await releaseThrottledWhereOff(ORG_AUTOMATION_DEFAULTS)).toBe(1)
    expect(await stateOf(t.id)).toBe('RUN_QUEUED')
  })

  it('moving a task into a done column withdraws a throttled run as well as a queued one', async () => {
    const w = await world({ throttle: true })
    const [held, waiting] = [await queued(w, 'T1', { runState: 'RUN_THROTTLED' }), await queued(w, 'T2')]
    expect(await applyMoveToRunState(held.id, { status: 'DONE', autoQueue: false }, { queuer: null })).toBe('withdrawn')
    expect(await applyMoveToRunState(waiting.id, { status: 'DONE', autoQueue: false }, { queuer: null })).toBe('withdrawn')
    expect(await Promise.all([held, waiting].map(t => stateOf(t.id)))).toEqual(['RUN_NONE', 'RUN_NONE'])
  })
})
