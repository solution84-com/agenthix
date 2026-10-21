/**
 * adr-0088 against Postgres: overlapping ticks, or two hq processes, start a
 * pulse or a scheduled task once. Each claim is a compare-and-set on the stored
 * due time; here two run at once against the real rows. TaskRunner is mocked —
 * these are about the claim, and atomic claiming of the agent's slot has its
 * own suite (taskSlotClaim.integration.test.ts). Written by lane A of the
 * agents-own-schedule unit; run by the lead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createTestTask } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma: testDbPrisma } = await import('../../test/db')
  return { prisma: testDbPrisma }
})
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))

import { openRoundIfDue, closeFinishedRounds } from '../pulse'
import { startSchedulesDue } from '../scheduledStart'
import { ORG_AUTOMATION_DEFAULTS } from '../automationSettings'
import * as taskRunnerFake from '../../test/fakes/TaskRunner'

let n = 0
const uniq = (p: string) => `${p}_${Date.now().toString(36)}_${n++}`
const DUE = new Date('2026-10-03T10:00:00Z')

/** A throttled project with `count` tasks held for its next round, which is due. */
async function projectWithThrottled(count: number) {
  const project = await createProject({ name: 'P', key: `AU${(n++).toString().padStart(2, '0')}`.slice(0, 6) })
  const agent = await prisma.agent.create({ data: { name: 'A', handle: uniq('agent') } as any })
  for (let i = 0; i < count; i++) {
    await createTestTask({
      data: { title: `T${i}`, onBehalfOfUserId: 'person-1', projectId: project.id, number: i + 1, assignedAgentId: agent.id, runState: 'RUN_THROTTLED' } as any,
    })
  }
  const row = await prisma.projectAutomation.create({ data: { projectId: project.id, enabled: true, throttle: true, pulseDueAt: DUE } })
  return { project, agent, row }
}

beforeEach(() => {
  taskRunnerFake.taskRunner.runTask.mockReset()
  // Behave like the real claim: RUN_QUEUED → RUN_ACTIVE once.
  taskRunnerFake.taskRunner.runTask.mockImplementation(async (taskId: string) => {
    const { count } = await prisma.task.updateMany({ where: { id: taskId, runState: 'RUN_QUEUED' }, data: { runState: 'RUN_ACTIVE' } })
    return count === 1 ? 'started' : 'skipped'
  })
})

const NOW = new Date('2026-10-03T10:00:30Z')

describe('the round claim, throttle on', () => {
  it('two ticks opening the same round at once open one round, let the batch through once, and record one firing', async () => {
    const { project, row } = await projectWithThrottled(2)
    const opened = await Promise.all([openRoundIfDue(row, 3, NOW), openRoundIfDue(row, 3, NOW)])
    expect(opened.filter(Boolean)).toHaveLength(1)
    expect(await prisma.task.count({ where: { projectId: project.id, runState: 'RUN_QUEUED' } })).toBe(2)
    expect(await prisma.automationStart.count({ where: { projectId: project.id, kind: 'PULSE' } })).toBe(1)
    const after = await prisma.projectAutomation.findUnique({ where: { projectId: project.id } })
    expect(after!.openRoundId).not.toBeNull()
    expect(after!.pulseDueAt).toBeNull()
  })

  it('a batch of 2 with 3 throttled lets 2 through; the third stays throttled', async () => {
    const { project, row } = await projectWithThrottled(3)
    await openRoundIfDue(row, 2, NOW)
    expect(await prisma.task.count({ where: { projectId: project.id, runState: 'RUN_QUEUED' } })).toBe(2)
    expect(await prisma.task.count({ where: { projectId: project.id, runState: 'RUN_THROTTLED' } })).toBe(1)
  })

  it('the round closes once none of its tasks is queued or running, with the next an interval later', async () => {
    const { project, row } = await projectWithThrottled(1)
    await openRoundIfDue(row, 3, NOW)
    await prisma.task.updateMany({ where: { projectId: project.id }, data: { runState: 'RUN_NONE' } })
    const now = new Date('2026-10-03T10:20:00Z')
    expect(await closeFinishedRounds(ORG_AUTOMATION_DEFAULTS, now)).toBeGreaterThanOrEqual(1)
    const after = await prisma.projectAutomation.findUnique({ where: { projectId: project.id } })
    expect(after).toMatchObject({ openRoundId: null, lastRoundFinishedAt: now, pulseDueAt: new Date('2026-10-03T10:50:00Z') })
  })
})

describe('the scheduled-start claim', () => {
  it('two ticks finding the same due task start it once', async () => {
    const project = await createProject({ name: 'S', key: `SS${(n++).toString().padStart(2, '0')}`.slice(0, 6) })
    const agent = await prisma.agent.create({ data: { name: 'A', handle: uniq('agent') } as any })
    await prisma.projectAutomation.create({ data: { projectId: project.id, enabled: true } })
    const task = await createTestTask({
      data: {
        title: 'Routine', onBehalfOfUserId: 'person-1', projectId: project.id, number: 1, assignedAgentId: agent.id,
        scheduleAt: DUE, scheduleNextDueAt: DUE,
      } as any,
    })
    const now = new Date('2026-10-03T10:00:30Z')
    await Promise.all([startSchedulesDue(ORG_AUTOMATION_DEFAULTS, now), startSchedulesDue(ORG_AUTOMATION_DEFAULTS, now)])
    expect(taskRunnerFake.taskRunner.runTask.mock.calls.filter(c => c[0] === task.id)).toHaveLength(1)
    expect(taskRunnerFake.taskRunner.runTask).toHaveBeenCalledWith(task.id, expect.objectContaining({ id: agent.id }), 'schedule')
    expect(await prisma.automationStart.count({ where: { taskId: task.id, kind: 'SCHEDULE' } })).toBe(1)
  })
})
