/**
 * adr-0088 against Postgres: overlapping ticks, or two hq processes, start a
 * scheduled task once. Each claim is a compare-and-set on the stored
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

import { startSchedulesDue } from '../scheduledStart'
import * as taskRunnerFake from '../../test/fakes/TaskRunner'

let n = 0
const uniq = (p: string) => `${p}_${Date.now().toString(36)}_${n++}`
const DUE = new Date('2026-10-03T10:00:00Z')

beforeEach(() => {
  taskRunnerFake.taskRunner.runTask.mockReset()
  // Behave like the real claim: RUN_QUEUED → RUN_ACTIVE once.
  taskRunnerFake.taskRunner.runTask.mockImplementation(async (taskId: string) => {
    const { count } = await prisma.task.updateMany({ where: { id: taskId, runState: 'RUN_QUEUED' }, data: { runState: 'RUN_ACTIVE' } })
    return count === 1 ? 'started' : 'skipped'
  })
})

describe('the scheduled-start claim', () => {
  it('two ticks finding the same due task start it once', async () => {
    const project = await createProject({ name: 'S', key: `SS${(n++).toString().padStart(2, '0')}`.slice(0, 6) })
    const agent = await prisma.agent.create({ data: { name: 'A', handle: uniq('agent') } as any })
    const task = await createTestTask({
      data: {
        title: 'Routine', onBehalfOfUserId: 'person-1', projectId: project.id, number: 1, assignedAgentId: agent.id,
        scheduleAt: DUE, scheduleNextDueAt: DUE,
      } as any,
    })
    const now = new Date('2026-10-03T10:00:30Z')
    await Promise.all([startSchedulesDue(now), startSchedulesDue(now)])
    expect(taskRunnerFake.taskRunner.runTask.mock.calls.filter(c => c[0] === task.id)).toHaveLength(1)
    expect(taskRunnerFake.taskRunner.runTask).toHaveBeenCalledWith(task.id, expect.objectContaining({ id: agent.id }), 'schedule')
  })
})
