/**
 * Why a queued or throttled task has not started (spec §6) against Postgres: its place in its agent's line, the
 * next round, or its boundary's automation being off — worked out from the rows when the task is read.
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

const at = (s: number) => new Date(Date.parse('2026-10-03T08:00:00Z') + s * 1000)

async function world(automation: Record<string, unknown> | null = { enabled: true }) {
  const project = await createProject()
  const agent = await createAgent({ name: 'AgentX' })
  if (automation) await prisma.projectAutomation.create({ data: { projectId: project.id, ...automation } as any })
  const task = (state: string, patch: Record<string, unknown> = {}) =>
    taskIn(project.id, { assignedAgentId: agent.id, runState: state, ...patch })
  return { project, agent, task }
}

/** A task as the browser's queries read it, with its agent. */
async function read(id: string) {
  return prisma.task.findUniqueOrThrow({ where: { id }, include: { assignedAgent: true } })
}
const noteOf = async (id: string) => (await withRunWaitNotes([await read(id)]))[0].runWait

describe('a queued or throttled task with no agent', () => {
  it.each(['RUN_QUEUED', 'RUN_THROTTLED'])('says no agent is assigned (%s)', async state => {
    const { project } = await world()
    const t = await taskIn(project.id, { runState: state })
    expect(await noteOf(t.id)).toEqual({ kind: 'noAgent' })
  })
})

describe("a queued task's place in its agent's line", () => {
  it('says how far along it is, and for which agent: by priority then age, the agent busy with a running task', async () => {
    const { task } = await world()
    await task('RUN_ACTIVE')
    const a = await task('RUN_QUEUED', { createdAt: at(1) })
    const b = await task('RUN_QUEUED', { createdAt: at(2) })
    const c = await task('RUN_QUEUED', { createdAt: at(3), priority: 'HIGH' })
    expect(await noteOf(b.id)).toEqual({ kind: 'line', position: 3, agentName: 'AgentX', agentBusy: true })
    expect(await noteOf(c.id)).toMatchObject({ position: 1 })
    expect(await noteOf(a.id)).toMatchObject({ position: 2 })
  })

  it('puts a start someone asked for ahead of the rest, and says the agent is free when nothing runs', async () => {
    const { task } = await world()
    const old = await task('RUN_QUEUED', { createdAt: at(1) })
    const asked = await task('RUN_QUEUED', { createdAt: at(9), priority: 'LOW', runStartedBy: 'person' })
    expect(await noteOf(asked.id)).toEqual({ kind: 'line', position: 1, agentName: 'AgentX', agentBusy: false })
    expect(await noteOf(old.id)).toMatchObject({ position: 2 })
  })

  it('counts only its own project\'s line', async () => {
    const { task, agent } = await world()
    const other = await createProject()
    await taskIn(other.id, { assignedAgentId: agent.id, runState: 'RUN_QUEUED', createdAt: at(0) })
    const mine = await task('RUN_QUEUED', { createdAt: at(5) })
    expect(await noteOf(mine.id)).toMatchObject({ position: 1 })
  })

  it('with automation off, says so — unless someone asked for it to start', async () => {
    const { task } = await world({ enabled: false })
    const plain = await task('RUN_QUEUED', { createdAt: at(1) })
    const asked = await task('RUN_QUEUED', { createdAt: at(2), runStartedBy: 'person' })
    expect(await noteOf(plain.id)).toEqual({ kind: 'automationOff' })
    expect(await noteOf(asked.id)).toMatchObject({ kind: 'line' })
  })

  it('a project with no automation row counts as automation off', async () => {
    const { task } = await world(null)
    expect(await noteOf((await task('RUN_QUEUED')).id)).toEqual({ kind: 'automationOff' })
  })

  it('a queued task with no agent and a reason already given is shown as it is: nothing to add', async () => {
    const { project } = await world()
    const held = await taskIn(project.id, { runState: 'RUN_QUEUED', runStateReason: 'held for a person' })
    expect(await noteOf(held.id)).toBeNull()
  })
})

describe('a throttled task', () => {
  it('names the next round, and whether one is open', async () => {
    const due = new Date('2026-10-03T14:05:00Z')
    const { project, task } = await world({ enabled: true, throttle: true, pulseDueAt: due })
    const t = await task('RUN_THROTTLED')
    expect(await noteOf(t.id)).toEqual({ kind: 'round', roundOpen: false, nextAt: due.toISOString() })
    await prisma.projectAutomation.update({ where: { projectId: project.id }, data: { openRoundId: 'r1', pulseDueAt: null } })
    expect(await noteOf(t.id)).toEqual({ kind: 'round', roundOpen: true, nextAt: null })
  })

  it('with automation off, says so', async () => {
    const { task } = await world({ enabled: false, throttle: true })
    expect(await noteOf((await task('RUN_THROTTLED')).id)).toEqual({ kind: 'automationOff' })
  })
})

describe('the rest', () => {
  it('a running task its site holds for a free place says so, naming the site at capacity', async () => {
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
    const second = await world({ enabled: false })
    const a = await first.task('RUN_QUEUED')
    const b = await second.task('RUN_QUEUED')
    const noted = await withRunWaitNotes([await read(a.id), await read(b.id)])
    expect(noted.map(t => t.runWait?.kind)).toEqual(['line', 'automationOff'])
  })
})
