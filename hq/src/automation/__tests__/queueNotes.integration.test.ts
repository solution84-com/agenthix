/**
 * Why a queued task has not started (spec §6) against Postgres: its place in its agent's line, in the project's rank
 * order, or its site's limit on runs at once — worked out from the rows when the task is read. Nothing waits for a
 * round or a switch (adr-0175).
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { withRunWaitNotes } from '../queueNotes'
import { WAITING_FOR_SLOT_REASON } from '../../agents/taskExecutionReasons'
import { taskIn } from './automationWorld'

async function world() {
  const project = await createProject()
  const agent = await createAgent({ name: 'AgentX' })
  const task = (state: string, patch: Record<string, unknown> = {}) =>
    taskIn(project.id, { assignedAgentId: agent.id, runState: state, runStartedBy: state === 'RUN_QUEUED' ? 'person' : null, ...patch })
  return { project, agent, task }
}

/** A task as the browser's queries read it, with its agent. */
async function read(id: string) {
  return prisma.task.findUniqueOrThrow({ where: { id }, include: { assignedAgent: true } })
}
const noteOf = async (id: string) => (await withRunWaitNotes([await read(id)]))[0].runWait

describe('a queued task with no agent', () => {
  it('says no agent is assigned', async () => {
    const { project } = await world()
    const t = await taskIn(project.id, { runState: 'RUN_QUEUED' })
    expect(await noteOf(t.id)).toEqual({ kind: 'noAgent' })
  })
})

describe("a queued task's place in its agent's line", () => {
  it('says how far along it is, and for which agent: in rank order, whatever its priority, the agent busy with a running task', async () => {
    const { task } = await world()
    await task('RUN_ACTIVE')
    const a = await task('RUN_QUEUED', { rank: 'c' })
    const b = await task('RUN_QUEUED', { rank: 'k' })
    const c = await task('RUN_QUEUED', { rank: 'a', priority: 'LOW', runStartedBy: 'agent' })
    expect(await noteOf(b.id)).toEqual({ kind: 'line', position: 3, agentName: 'AgentX', agentBusy: true })
    expect(await noteOf(c.id)).toMatchObject({ position: 1 })
    expect(await noteOf(a.id)).toMatchObject({ position: 2 })
  })

  it('says the agent is free when nothing runs', async () => {
    const { task } = await world()
    const asked = await task('RUN_QUEUED')
    expect(await noteOf(asked.id)).toEqual({ kind: 'line', position: 1, agentName: 'AgentX', agentBusy: false })
  })

  it("counts only its own project's line", async () => {
    const { task, agent } = await world()
    const other = await createProject()
    await taskIn(other.id, { assignedAgentId: agent.id, runState: 'RUN_QUEUED', runStartedBy: 'person', rank: 'a' })
    const mine = await task('RUN_QUEUED', { rank: 'z' })
    expect(await noteOf(mine.id)).toMatchObject({ position: 1 })
  })

  it('never says a task waits for automation or a round: those are gone', async () => {
    const { task } = await world()
    const noted = await withRunWaitNotes([await read((await task('RUN_QUEUED')).id)])
    expect(noted.map(t => t.runWait?.kind)).toEqual(['line'])
  })

  it('a queued task with no agent and a reason already given is shown as it is: nothing to add', async () => {
    const { project } = await world()
    const held = await taskIn(project.id, { runState: 'RUN_QUEUED', runStateReason: 'held for a person' })
    expect(await noteOf(held.id)).toBeNull()
  })
})

describe('the rest', () => {
  it("a running task its site holds for a free place says so, naming the site at capacity (the site's limit on runs at once)", async () => {
    const { task } = await world()
    const held = await task('RUN_ACTIVE', { runStateReason: WAITING_FOR_SLOT_REASON })
    expect(await noteOf(held.id)).toEqual({ kind: 'slot', siteName: "Test Execution Site · HQ's site" })
  })

  it('nothing to say for any other task', async () => {
    const { task } = await world()
    const rows = [await read((await task('RUN_NONE')).id), await read((await task('RUN_ACTIVE')).id)]
    expect((await withRunWaitNotes(rows)).map(t => t.runWait)).toEqual([null, null])
  })

  it('notes each of several tasks across projects in one read', async () => {
    const first = await world()
    const second = await world()
    const a = await first.task('RUN_QUEUED')
    const b = await second.task('RUN_QUEUED')
    const noted = await withRunWaitNotes([await read(a.id), await read(b.id)])
    expect(noted.map(t => t.runWait?.kind)).toEqual(['line', 'line'])
  })
})
