/** What a throttled boundary's board shows above its columns (spec §6), against Postgres: the round in progress, or when the next may start. */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { projectRoundLine } from '../automationStatus'
import { taskIn } from './automationWorld'

async function throttledWithOpenRound(project: { id: string }, started: Array<{ task: { id: string }; agent: { id: string; handle: string } }>) {
  await prisma.org.create({ data: { name: 'Org', automationThrottle: true } })
  const record = await prisma.automationStart.create({
    data: {
      projectId: project.id, kind: 'PULSE',
      started: started.map(s => ({ taskId: s.task.id, agentId: s.agent.id, agentHandle: s.agent.handle, outcome: 'queued' })),
    },
  })
  await prisma.projectAutomation.create({ data: { projectId: project.id, enabled: true, throttle: true, openRoundId: record.id } })
  return project
}

describe('the round line', () => {
  it('is nothing where the throttle is off', async () => {
    const project = await createProject()
    await prisma.projectAutomation.create({ data: { projectId: project.id, enabled: true } })
    expect(await projectRoundLine(project.id)).toBeNull()
  })

  it('is nothing for a project that chose nothing under an org that does not require the throttle', async () => {
    expect(await projectRoundLine((await createProject()).id)).toBeNull()
  })

  it('between rounds, says when the next may start and how many are held', async () => {
    const project = await createProject()
    const due = new Date('2026-10-03T14:05:00Z')
    await prisma.projectAutomation.create({ data: { projectId: project.id, enabled: true, throttle: true, pulseDueAt: due } })
    await taskIn(project.id, { runState: 'RUN_THROTTLED', assignedAgentId: (await createAgent()).id })
    await taskIn(project.id, { runState: 'RUN_THROTTLED' })
    expect(await projectRoundLine(project.id)).toEqual({ automationOn: true, open: false, agents: [], nextAt: due.toISOString(), throttled: 1 })
  })

  it('with automation off, has no next round', async () => {
    const project = await createProject()
    await prisma.projectAutomation.create({ data: { projectId: project.id, enabled: false, throttle: true, pulseDueAt: new Date('2026-10-03T14:05:00Z') } })
    expect(await projectRoundLine(project.id)).toMatchObject({ automationOn: false, open: false, nextAt: null })
  })
})

describe("a round's line names each agent", () => {
  it("by the agent's name, with how far its batch has got", async () => {
    const [xavier, yara] = [await createAgent({ name: 'Xavier', handle: 'agentx' }), await createAgent({ name: 'Yara', handle: 'agenty' })]
    const project = await createProject()
    const t1 = await taskIn(project.id, { runState: 'RUN_NONE' })
    const t2 = await taskIn(project.id, { runState: 'RUN_QUEUED' })
    const t3 = await taskIn(project.id, { runState: 'RUN_ACTIVE' })
    const open = await throttledWithOpenRound(project, [{ task: t1, agent: xavier }, { task: t2, agent: xavier }, { task: t3, agent: yara }])
    const line = await projectRoundLine(open.id)
    expect(line).toMatchObject({ automationOn: true, open: true, nextAt: null })
    expect(line!.agents).toEqual([
      { agentHandle: 'agentx', agentName: 'Xavier', done: 1, total: 2 },
      { agentHandle: 'agenty', agentName: 'Yara', done: 0, total: 1 },
    ])
  })

  it('falls back to the handle for an agent that no longer exists', async () => {
    const project = await createProject()
    const t = await taskIn(project.id, { runState: 'RUN_QUEUED' })
    const open = await throttledWithOpenRound(project, [{ task: t, agent: { id: 'gone', handle: 'agentx' } }])
    expect((await projectRoundLine(open.id))!.agents[0].agentName).toBe('agentx')
  })
})
