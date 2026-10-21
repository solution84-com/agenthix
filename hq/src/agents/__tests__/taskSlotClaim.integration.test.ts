/**
 * Against Postgres: the one-task-per-(agent, project) rule holds when
 * claims race. Each case starts several claims at once on separate pooled
 * connections; the advisory lock in taskSlotClaim.ts must let exactly one win.
 * Written by lane A of the agents-own-schedule unit; run by the lead.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createTestTask } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma: testDbPrisma } = await import('../../test/db')
  return { prisma: testDbPrisma }
})

import { claimTask, claimNext } from '../taskSlotClaim'

let n = 0
const uniq = (p: string) => `${p}_${Date.now().toString(36)}_${n++}`

async function setup(count: number) {
  const project = await createProject({ name: 'P', key: `SC${(n++).toString().padStart(2, '0')}`.slice(0, 6) })
  const agent = await prisma.agent.create({ data: { name: 'A', handle: uniq('agent') } as any })
  const tasks: { id: string }[] = []
  for (let i = 0; i < count; i++) {
    tasks.push(await createTestTask({
      data: { title: `T${i}`, onBehalfOfUserId: 'person-1', projectId: project.id, number: i + 1, assignedAgentId: agent.id, runState: 'RUN_QUEUED', runStartedBy: 'person' } as any,
    }))
  }
  return { project, agent, tasks }
}

const running = (agentId: string, projectId: string) =>
  prisma.task.count({ where: { assignedAgentId: agentId, projectId, runState: 'RUN_ACTIVE' } })

describe('atomic claiming of the (agent, project) slot', () => {
  it('of several queued tasks claimed at once, exactly one becomes RUN_ACTIVE; the rest stay queued, asked to start', async () => {
    const { project, agent, tasks } = await setup(5)
    const results = await Promise.all(tasks.map(t => claimTask(t.id, agent.id, project.id, 'person')))
    expect(results.filter(r => r === 'claimed')).toHaveLength(1)
    expect(results.filter(r => r === 'waiting')).toHaveLength(4)
    expect(await running(agent.id, project.id)).toBe(1)
  })

  it('a pulse and trigger-next racing for the same slot cannot both win', async () => {
    const { project, agent, tasks } = await setup(3)
    const [a, b, c] = await Promise.all([
      claimTask(tasks[0].id, agent.id, project.id, 'person'),
      claimNext(agent.id, project.id, true),
      claimNext(agent.id, project.id, true),
    ])
    expect([a === 'claimed', b !== null, c !== null].filter(Boolean)).toHaveLength(1)
    expect(await running(agent.id, project.id)).toBe(1)
  })

  it('the same agent in two projects runs one task in each', async () => {
    const one = await setup(2)
    const other = await createProject({ name: 'Q', key: `SQ${(n++).toString().padStart(2, '0')}`.slice(0, 6) })
    const t = await createTestTask({
      data: { title: 'Q1', onBehalfOfUserId: 'person-1', projectId: other.id, number: 1, assignedAgentId: one.agent.id, runState: 'RUN_QUEUED', runStartedBy: 'person' } as any,
    })
    const results = await Promise.all([
      claimTask(one.tasks[0].id, one.agent.id, one.project.id, 'person'),
      claimTask(t.id, one.agent.id, other.id, 'person'),
    ])
    expect(results).toEqual(['claimed', 'claimed'])
  })

  it('a task stopped meanwhile is never pulled back to RUN_ACTIVE', async () => {
    const { project, agent, tasks } = await setup(1)
    await prisma.task.update({ where: { id: tasks[0].id }, data: { runState: 'RUN_NONE' } })
    expect(await claimTask(tasks[0].id, agent.id, project.id, 'person')).toBe('skipped')
    expect((await prisma.task.findUnique({ where: { id: tasks[0].id } }))!.runState).toBe('RUN_NONE')
  })
})

// Whose behalf a run is on goes with what started it (every-screen-reviewed spec §9).
describe('a claim records the person a run is on behalf of @SC-520', () => {
  const personOf = async (taskId: string) => (await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).runOnBehalfOfUserId

  it("a person's start records them, whether it runs now or waits for the agent", async () => {
    const { project, agent, tasks } = await setup(2)
    expect(await claimTask(tasks[0].id, agent.id, project.id, 'person', 'ana')).toBe('claimed')
    expect(await claimTask(tasks[1].id, agent.id, project.id, 'person', 'ben')).toBe('waiting')
    expect([await personOf(tasks[0].id), await personOf(tasks[1].id)]).toEqual(['ana', 'ben'])
  })

  it('a start nobody made records nobody, whatever was recorded before', async () => {
    const { project, agent, tasks } = await setup(1)
    await prisma.task.update({ where: { id: tasks[0].id }, data: { runOnBehalfOfUserId: 'ana' } })
    expect(await claimTask(tasks[0].id, agent.id, project.id, 'schedule', 'ana')).toBe('claimed')
    expect(await personOf(tasks[0].id)).toBeNull()
  })

  it("the next in line keeps the person who asked for it, and the pulse's run is nobody's", async () => {
    const { project, agent, tasks } = await setup(2)
    await prisma.task.update({ where: { id: tasks[0].id }, data: { runOnBehalfOfUserId: 'ana', priority: 'HIGH' } })
    await prisma.task.update({ where: { id: tasks[1].id }, data: { runStartedBy: null, runOnBehalfOfUserId: 'ben' } })

    expect(await claimNext(agent.id, project.id, true)).toMatchObject({ id: tasks[0].id, startedBy: 'person' })
    expect(await personOf(tasks[0].id)).toBe('ana')

    await prisma.task.update({ where: { id: tasks[0].id }, data: { runState: 'RUN_NONE' } })
    expect(await claimNext(agent.id, project.id, true)).toMatchObject({ id: tasks[1].id, startedBy: 'pulse' })
    expect(await personOf(tasks[1].id)).toBeNull()
  })
})
