/**
 * An agent's line in a project, against the real database (agents own schedule spec §2): what claiming a
 * task writes, what it leaves waiting, and which task of the line goes next — a start someone asked for first,
 * then, for the pulse only, the rest, each by priority then age, never one whose time is still to come. Racing
 * claims are taskSlotClaim.integration's.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { addTask, agentInProject, stateOf } from './taskRunFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
const socket = vi.hoisted(() => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/socket', () => socket)

import { claimNext, claimTask, SLOT_TAKEN_REASON, WAITING_FOR_AGENT_REASON } from '../taskSlotClaim'
import { createAgent } from '../../test/factories'

beforeEach(() => socket.emitTaskUpdated.mockReset())

const row = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } })
const later = () => new Date(Date.now() + 6 * 3_600_000)

describe('claimTask', () => {
  it.each(['RUN_QUEUED', 'RUN_THROTTLED'] as const)('a person steps a %s task to RUN_ACTIVE, recording it, from depth 0', async (runState) => {
    const where = await agentInProject()
    const task = await addTask(where, { runState, queueDepth: 2, runId: 'old-run' })
    expect(await claimTask(task.id, where.agent.id, where.project.id, 'person')).toBe('claimed')
    expect(await row(task.id)).toMatchObject({
      runState: 'RUN_ACTIVE', runStateReason: SLOT_TAKEN_REASON, runStartedBy: 'person', runId: null, queueDepth: 0,
    })
  })

  it('an agent starting a task (run_task) also counts it from depth 0, as the person in its run asked (adr-0091)', async () => {
    const where = await agentInProject()
    const task = await addTask(where, { queueDepth: 2 })
    await claimTask(task.id, where.agent.id, where.project.id, 'agent')
    expect(await row(task.id)).toMatchObject({ runStartedBy: 'agent', queueDepth: 0 })
  })

  it('the pulse claims only what is in line, at the depth it was queued — never a throttled task', async () => {
    const where = await agentInProject()
    const queued = await addTask(where, { queueDepth: 2 })
    const throttled = await addTask({ ...where, agent: await createAgent() }, { runState: 'RUN_THROTTLED' })
    expect(await claimTask(queued.id, where.agent.id, where.project.id, 'pulse')).toBe('claimed')
    expect(await row(queued.id)).toMatchObject({ runState: 'RUN_ACTIVE', queueDepth: 2, runStartedBy: 'pulse' })
    expect(await claimTask(throttled.id, throttled.assignedAgentId!, where.project.id, 'pulse')).toBe('skipped')
    expect((await row(throttled.id)).runState).toBe('RUN_THROTTLED')
  })

  it('leaves the task queued, asked to start, with a reason, while the agent runs another task in the project', async () => {
    const where = await agentInProject()
    await addTask(where, { runState: 'RUN_ACTIVE' })
    const task = await addTask(where, { queueDepth: 3 })
    expect(await claimTask(task.id, where.agent.id, where.project.id, 'schedule')).toBe('waiting')
    expect(await row(task.id)).toMatchObject({
      runState: 'RUN_QUEUED', runStateReason: WAITING_FOR_AGENT_REASON, runStartedBy: 'schedule', queueDepth: 0,
    })
  })

  it("another agent's running task in the project does not hold this agent's slot", async () => {
    const where = await agentInProject()
    await addTask({ ...where, agent: await createAgent() }, { runState: 'RUN_ACTIVE' })
    const task = await addTask(where)
    expect(await claimTask(task.id, where.agent.id, where.project.id, 'person')).toBe('claimed')
  })
})

describe('claimNext', () => {
  it('takes nothing while the slot is held', async () => {
    const where = await agentInProject()
    await addTask(where, { runState: 'RUN_ACTIVE' })
    const asked = await addTask(where, { runStartedBy: 'person' })
    expect(await claimNext(where.agent.id, where.project.id, true)).toBeNull()
    expect((await row(asked.id)).runState).toBe('RUN_QUEUED')
  })

  it('takes a start someone asked for first, by priority then age, with what asked for it', async () => {
    const where = await agentInProject()
    await addTask(where, { priority: 'HIGH' })
    await addTask(where, { runStartedBy: 'person', priority: 'MEDIUM' })
    const older = await addTask(where, { runStartedBy: 'schedule', priority: 'HIGH', title: 'Two' })
    await addTask(where, { runStartedBy: 'person', priority: 'HIGH' })

    expect(await claimNext(where.agent.id, where.project.id, false)).toEqual({ id: older.id, title: 'Two', startedBy: 'schedule', asked: true })
    expect(await row(older.id)).toMatchObject({ runState: 'RUN_ACTIVE', runStateReason: SLOT_TAKEN_REASON, runStartedBy: 'schedule', runId: null })
  })

  it('without the pulse, leaves the rest of the line alone — nothing starts by itself with automation off', async () => {
    const where = await agentInProject()
    const line = await addTask(where)
    expect(await claimNext(where.agent.id, where.project.id, false)).toBeNull()
    expect((await row(line.id)).runState).toBe('RUN_QUEUED')
  })

  it('with the pulse, starts the first of the rest of the line, by priority, as the pulse', async () => {
    const where = await agentInProject()
    await addTask(where, { priority: 'LOW' })
    const first = await addTask(where, { priority: 'HIGH', title: 'Three' })
    expect(await claimNext(where.agent.id, where.project.id, true)).toEqual({ id: first.id, title: 'Three', startedBy: 'pulse', asked: false })
  })

  it('the pulse never takes a task whose start time or round time is still to come; one someone asked for is not held to it', async () => {
    const where = await agentInProject()
    const scheduled = await addTask(where, { scheduleNextDueAt: later(), priority: 'HIGH' })
    const round = await addTask(where, { roundAt: later(), priority: 'HIGH' })
    expect(await claimNext(where.agent.id, where.project.id, true)).toBeNull()
    expect(await Promise.all([scheduled, round].map(async t => (await row(t.id)).runState))).toEqual(['RUN_QUEUED', 'RUN_QUEUED'])

    const asked = await addTask(where, { scheduleNextDueAt: later(), runStartedBy: 'person' })
    expect(await claimNext(where.agent.id, where.project.id, true)).toMatchObject({ id: asked.id, asked: true })
  })

  it('never reads a starter it cannot parse as a person', async () => {
    const where = await agentInProject()
    const task = await addTask(where, { runStartedBy: 'Person' })
    expect((await claimNext(where.agent.id, where.project.id, false))?.startedBy).toBe('pulse')
    expect((await stateOf(task.id)).runStartedBy).toBe('pulse')
  })
})

describe("the task's board is told when a claim changes its run state", () => {
  async function onBoard() {
    const where = await agentInProject()
    const board = await prisma.board.create({ data: { name: 'B', projectId: where.project.id } })
    return { ...where, board }
  }

  it('a claimed task, and one left waiting for its agent, but not one that was skipped', async () => {
    const where = await onBoard()
    const first = await addTask(where, { boardId: where.board.id })
    const second = await addTask(where, { boardId: where.board.id })
    const idle = await addTask(where, { boardId: where.board.id, runState: 'RUN_NONE' })

    await claimTask(first.id, where.agent.id, where.project.id, 'person')
    await claimTask(second.id, where.agent.id, where.project.id, 'person')
    expect(socket.emitTaskUpdated).toHaveBeenCalledTimes(2)
    socket.emitTaskUpdated.mockReset()
    await claimTask(idle.id, where.agent.id, where.project.id, 'person')
    expect(socket.emitTaskUpdated).not.toHaveBeenCalled()
  })

  it('the next task of an agent line once claimed, and nothing when none is', async () => {
    const where = await onBoard()
    expect(await claimNext(where.agent.id, where.project.id, true)).toBeNull()
    expect(socket.emitTaskUpdated).not.toHaveBeenCalled()
    await addTask(where, { boardId: where.board.id, runStartedBy: 'person' })
    await claimNext(where.agent.id, where.project.id, false)
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(where.board.id)
  })
})
