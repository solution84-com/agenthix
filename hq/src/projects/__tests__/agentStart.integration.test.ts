/**
 * An agent's Start and Start all agents, against the real database (spec D6, D17, N3, adr-0175, adr-0095): which
 * tasks are ready, what a Start puts in the agent's line and on whose behalf, the order the agent takes them in, and
 * the races — two Starts at once, a Start beside a Run, a reassignment or a move, and a run ending while its next task
 * is claimed. Only the site is stood in for, by the dispatchService fake.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { addTask, agentInProject, startsLanded } from '../../agents/__tests__/taskRunFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
const socket = vi.hoisted(() => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/socket', () => socket)
vi.mock('../../sites/activeRunTracker', () => ({ registerActiveRunTracker: vi.fn() }))
vi.mock('../../sites/channel/siteEventHandler', () => ({ onRunStatus: vi.fn() }))

import { startAgent, startAllAgents, checkedTaskIds } from '../agentStart'
import { startPlan } from '../agentStartPlan'
import { taskRunner } from '../../agents/TaskRunner'
import { createAgent } from '../../test/factories'
import * as dispatchFake from '../../test/fakes/dispatchService'

beforeEach(() => socket.emitTaskUpdated.mockReset())

const later = () => new Date(Date.now() + 6 * 3_600_000)
/** A task ready for its agent: in To do, never run, nothing pending. */
const ready = (rank: string, data: Record<string, unknown> = {}) => ({ runState: 'RUN_NONE', state: 'TODO', rank, ...data })
const row = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } })
const runStates = async (ids: string[]) => Promise.all(ids.map(async id => (await row(id)).runState))

describe('the ready tasks a Start lists', () => {
  it("are the agent's To do tasks never run, in rank order; an epic and a Run at… time cannot run; others are not listed", async () => {
    const w = await agentInProject()
    const second = await addTask(w, ready('m', { title: 'Second' }))
    const first = await addTask(w, ready('c', { title: 'First' }))
    const epic = await addTask(w, ready('d', { isEpic: true }))
    const timed = await addTask(w, ready('e', { scheduleNextDueAt: later() }))
    await addTask(w, ready('a', { state: 'BACKLOG' }))
    await addTask(w, ready('a', { state: 'IN_PROGRESS' }))
    await addTask(w, ready('a', { executionState: 'FINISHED' }))
    await addTask(w, ready('a', { runState: 'RUN_FAILED' }))
    await addTask(w, ready('a', { archived: true }))
    await addTask({ ...w, agent: await createAgent() }, ready('a'))

    const plan = await startPlan(w.project.id, w.agent.id)
    expect(plan.agents).toHaveLength(1)
    expect(plan.agents[0].ready.map(t => t.id)).toEqual([first.id, second.id])
    expect(plan.cantRun.map(t => [t.id, t.reason])).toEqual([[epic.id, 'epic'], [timed.id, 'startTime']])
  })

  it('for Start all agents, are grouped by agent, with a task that has no agent among what cannot run', async () => {
    const w = await agentInProject()
    const other = await createAgent()
    await prisma.projectAgent.create({ data: { projectId: w.project.id, agentId: other.id } })
    const mine = await addTask(w, ready('b'))
    const orphan = await addTask({ ...w, agent: null }, ready('c'))

    const plan = await startPlan(w.project.id, null)
    expect(Object.fromEntries(plan.agents.map(a => [a.agentId, a.ready.map(t => t.id)]))).toEqual({ [other.id]: [], [w.agent.id]: [mine.id] })
    expect(plan.cantRun).toEqual([expect.objectContaining({ id: orphan.id, reason: 'noAgent' })])
  })
})

describe("an agent's Start", () => {
  it("puts the ticked ready tasks in its line on the person's behalf at depth 0, and starts the first in rank order", async () => {
    const w = await agentInProject()
    const b = await addTask(w, ready('m', { queueDepth: 4 }))
    const a = await addTask(w, ready('c'))
    const unticked = await addTask(w, ready('e'))

    expect(await startAgent(w.project.id, w.agent.id, [b.id, a.id], w.person.id)).toEqual({ started: 2, agents: 1 })
    await startsLanded([a.id])
    expect(await row(a.id)).toMatchObject({ runState: 'RUN_ACTIVE', runStartedBy: 'person', runOnBehalfOfUserId: w.person.id, queuedByUserId: w.person.id, queueDepth: 0 })
    expect(await row(b.id)).toMatchObject({ runState: 'RUN_QUEUED', runStartedBy: 'person', runOnBehalfOfUserId: w.person.id, queueDepth: 0, executionState: 'WAITING' })
    expect((await row(unticked.id)).runState).toBe('RUN_NONE')
    expect(dispatchFake.dispatchedTaskRuns.map(r => r.taskId)).toEqual([a.id])
  })

  it('takes the next one when the run before it ends — a failure does not hold the line (N3)', async () => {
    const w = await agentInProject()
    const a = await addTask(w, ready('c'))
    const b = await addTask(w, ready('m'))
    await startAgent(w.project.id, w.agent.id, [a.id, b.id], w.person.id)
    await startsLanded([a.id])

    await prisma.task.update({ where: { id: a.id }, data: { runState: 'RUN_FAILED', runStateReason: 'boom' } })
    await taskRunner.triggerNext(w.agent, w.project.id)
    await startsLanded([b.id])
    expect(await runStates([a.id, b.id])).toEqual(['RUN_FAILED', 'RUN_ACTIVE'])
  })

  it('never puts in line a task that is not ready for this agent: another agent\'s, another project\'s, an epic, a Run at…, one not in To do', async () => {
    const w = await agentInProject()
    const elsewhere = await agentInProject()
    const others = await addTask({ ...w, agent: await createAgent() }, ready('a'))
    const foreign = await addTask({ ...elsewhere, agent: w.agent }, ready('a'))
    const epic = await addTask(w, ready('a', { isEpic: true }))
    const timed = await addTask(w, ready('a', { scheduleNextDueAt: later() }))
    const backlog = await addTask(w, ready('a', { state: 'BACKLOG' }))
    const ids = [others.id, foreign.id, epic.id, timed.id, backlog.id]

    expect(await startAgent(w.project.id, w.agent.id, ids, w.person.id)).toEqual({ started: 0, agents: 0 })
    expect(await runStates(ids)).toEqual(Array(5).fill('RUN_NONE'))
    expect(dispatchFake.dispatchedTaskRuns).toHaveLength(0)
  })

  it('two Starts at once put each task in line once and start one run', async () => {
    const w = await agentInProject()
    const tasks = await Promise.all(['c', 'e', 'g'].map(r => addTask(w, ready(r))))
    const ids = tasks.map(t => t.id)

    const results = await Promise.all([
      startAgent(w.project.id, w.agent.id, ids, w.person.id),
      startAgent(w.project.id, w.agent.id, ids, w.person.id),
    ])
    expect(results.reduce((n, r) => n + r.started, 0)).toBe(3)
    await startsLanded(ids)
    expect((await runStates(ids)).sort()).toEqual(['RUN_ACTIVE', 'RUN_QUEUED', 'RUN_QUEUED'])
    expect(dispatchFake.dispatchedTaskRuns).toHaveLength(1)
  })

  it('a Start beside a Run of the same task leaves it in line once', async () => {
    const w = await agentInProject()
    const task = await addTask(w, ready('c'))
    await Promise.all([
      startAgent(w.project.id, w.agent.id, [task.id], w.person.id),
      taskRunner.runTask(task.id, w.agent, 'person', w.person.id),
    ])
    await startsLanded([task.id])
    expect(dispatchFake.dispatchedTaskRuns.filter(r => r.taskId === task.id)).toHaveLength(1)
  })

  it('a task reassigned before the Start lands is not started for the agent it left', async () => {
    const w = await agentInProject()
    const task = await addTask(w, ready('c'))
    await prisma.task.update({ where: { id: task.id }, data: { assignedAgentId: (await createAgent()).id } })
    expect((await startAgent(w.project.id, w.agent.id, [task.id], w.person.id)).started).toBe(0)
  })

  it('a run ending while two Starts claim the next task starts it once', async () => {
    const w = await agentInProject()
    const running = await addTask(w, { runState: 'RUN_ACTIVE', runId: 'run-x', rank: 'a' })
    const next = await addTask(w, ready('c'))
    await prisma.task.update({ where: { id: running.id }, data: { runState: 'RUN_NONE' } })
    await Promise.all([
      startAgent(w.project.id, w.agent.id, [next.id], w.person.id),
      taskRunner.triggerNext(w.agent, w.project.id),
      taskRunner.triggerNext(w.agent, w.project.id),
    ])
    await startsLanded([next.id])
    expect(dispatchFake.dispatchedTaskRuns.map(r => r.taskId)).toEqual([next.id])
  })
})

describe('Start all agents', () => {
  it('starts each agent on its own ticked tasks, side by side, one run each', async () => {
    const w = await agentInProject()
    const otherAgent = await createAgent()
    const a1 = await addTask(w, ready('c'))
    const a2 = await addTask(w, ready('e'))
    const b1 = await addTask({ ...w, agent: otherAgent }, ready('d'))
    const orphan = await addTask({ ...w, agent: null }, ready('f'))

    expect(await startAllAgents(w.project.id, [a1.id, a2.id, b1.id, orphan.id], w.person.id)).toEqual({ started: 3, agents: 2 })
    await startsLanded([a1.id, b1.id])
    expect(await runStates([a1.id, a2.id, b1.id, orphan.id])).toEqual(['RUN_ACTIVE', 'RUN_QUEUED', 'RUN_ACTIVE', 'RUN_NONE'])
  })

  it("never starts another project's task given with the ticks", async () => {
    const w = await agentInProject()
    const foreign = await addTask({ ...(await agentInProject()), agent: w.agent }, ready('c'))
    expect(await startAllAgents(w.project.id, [foreign.id], w.person.id)).toEqual({ started: 0, agents: 0 })
    expect((await row(foreign.id)).runState).toBe('RUN_NONE')
  })
})

describe('the ticks', () => {
  it('are a list of 1 to 500 ids; anything else is refused before anything changes', () => {
    expect(checkedTaskIds(['a', 'a', 'b'])).toEqual(['a', 'b'])
    for (const bad of [[], 'a', [1], [''], null, Array(501).fill('x')]) expect(() => checkedTaskIds(bad)).toThrow(/Nothing was changed/)
  })
})
