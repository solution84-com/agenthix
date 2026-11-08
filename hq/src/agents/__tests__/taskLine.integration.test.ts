/**
 * An agent's line in a project, against the real database (spec "The words", D14, adr-0175): what claiming a
 * task writes, what it leaves waiting, and which task of the line goes next — the first in the project's rank
 * order, whatever started it; never a task no explicit act started. Racing claims are taskSlotClaim.integration's.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { addTask, agentInProject } from './taskRunFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
const socket = vi.hoisted(() => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/socket', () => socket)

import { claimNext, claimTask, SLOT_TAKEN_REASON, WAITING_FOR_AGENT_REASON } from '../taskSlotClaim'
import { createAgent, createProject } from '../../test/factories'

beforeEach(() => socket.emitTaskUpdated.mockReset())

const row = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } })

describe('claimTask', () => {
  it('a person steps a queued task to RUN_ACTIVE, recording it, from depth 0', async () => {
    const where = await agentInProject()
    const task = await addTask(where, { queueDepth: 2, runId: 'old-run' })
    expect(await claimTask(task.id, where.agent.id, where.project.id, 'person')).toBe('claimed')
    expect(await row(task.id)).toMatchObject({
      runState: 'RUN_ACTIVE', runStateReason: SLOT_TAKEN_REASON, runStartedBy: 'person', runId: null, queueDepth: 0,
    })
  })

  it("an agent's start keeps the depth its tool wrote, so a chain is never reset by its own links (adr-0091)", async () => {
    const where = await agentInProject()
    const task = await addTask(where, { queueDepth: 2 })
    await claimTask(task.id, where.agent.id, where.project.id, 'agent')
    expect(await row(task.id)).toMatchObject({ runStartedBy: 'agent', queueDepth: 2 })
  })

  it("never claims another agent's task, or one moved to another project meanwhile", async () => {
    const where = await agentInProject()
    const task = await addTask(where)
    const other = await createAgent()
    expect(await claimTask(task.id, other.id, where.project.id, 'person')).toBe('skipped')
    expect(await claimTask(task.id, where.agent.id, (await createProject({ name: 'Q' })).id, 'person')).toBe('skipped')
    expect((await row(task.id)).runState).toBe('RUN_QUEUED')
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
    expect(await claimNext(where.agent.id, where.project.id)).toBeNull()
    expect((await row(asked.id)).runState).toBe('RUN_QUEUED')
  })

  it("takes the first task of the line in the project's rank order, whatever its priority, age or starter", async () => {
    const where = await agentInProject()
    await addTask(where, { runStartedBy: 'person', priority: 'HIGH', rank: 'm' })
    await addTask(where, { runStartedBy: 'person', rank: null })
    const first = await addTask(where, { runStartedBy: 'schedule', priority: 'LOW', rank: 'c', title: 'Two' })
    await addTask(where, { runStartedBy: 'agent', rank: 'k' })

    expect(await claimNext(where.agent.id, where.project.id)).toEqual({ id: first.id, title: 'Two', startedBy: 'schedule' })
    expect(await row(first.id)).toMatchObject({ runState: 'RUN_ACTIVE', runStateReason: SLOT_TAKEN_REASON, runStartedBy: 'schedule', runId: null })
  })

  it('never starts a queued task no explicit act started: no pulse, no starter, or one it cannot read (adr-0175)', async () => {
    const where = await agentInProject()
    const none = await addTask(where, { runStartedBy: null, rank: 'a' })
    const pulse = await addTask(where, { runStartedBy: 'pulse', rank: 'b' })
    const junk = await addTask(where, { runStartedBy: 'Person', rank: 'c' })
    expect(await claimNext(where.agent.id, where.project.id)).toBeNull()
    expect(await Promise.all([none, pulse, junk].map(async t => (await row(t.id)).runState))).toEqual(['RUN_QUEUED', 'RUN_QUEUED', 'RUN_QUEUED'])
  })

  it('a person writes their name on the run when they start it, never one left from an earlier run (adr-0095)', async () => {
    const where = await agentInProject()
    const task = await addTask(where, { runStartedBy: 'schedule', runOnBehalfOfUserId: where.person.id })
    await claimNext(where.agent.id, where.project.id)
    expect((await row(task.id)).runOnBehalfOfUserId).toBeNull()
  })

  it('skips an archived task or an epic in line', async () => {
    const where = await agentInProject()
    await addTask(where, { runStartedBy: 'person', archived: true, rank: 'a' })
    await addTask(where, { runStartedBy: 'person', isEpic: true, rank: 'b' })
    const task = await addTask(where, { runStartedBy: 'person', rank: 'c' })
    expect((await claimNext(where.agent.id, where.project.id))?.id).toBe(task.id)
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
    expect(await claimNext(where.agent.id, where.project.id)).toBeNull()
    expect(socket.emitTaskUpdated).not.toHaveBeenCalled()
    await addTask(where, { boardId: where.board.id, runStartedBy: 'person' })
    await claimNext(where.agent.id, where.project.id)
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(where.board.id)
  })
})
