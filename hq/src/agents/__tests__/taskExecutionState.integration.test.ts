/**
 * A task's execution state is written in the same write as its run state, on the paths that change a run (spec D2,
 * plan 3.6), against the real database: a claim, a run's end, a Stop, a person's Run and a dismissed failure. A late
 * frame from an earlier run, or a second end racing the first, never overwrites what a newer run set.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { addTask, agentInProject, frame, settle } from './taskRunFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../sites/activeRunTracker', () => ({ registerActiveRunTracker: vi.fn() }))
const listeners = vi.hoisted(() => new Map<string, (e: unknown, siteId: string) => Promise<void>>())
vi.mock('../../sites/channel/siteEventHandler', () => ({
  onRunStatus: (name: string, l: (e: unknown, siteId: string) => Promise<void>) => listeners.set(name, l),
}))

import '../TaskRunner'
import { claimTask } from '../taskSlotClaim'
import { withdrawPendingRun } from '../../projects/taskRunMoves'
import * as dispatchFake from '../../test/fakes/dispatchService'

const listen = (e: unknown) => listeners.get('task-machine')!(e, dispatchFake.DEFAULT_SITE_ID)
const executionOf = async (id: string) => (await prisma.task.findUniqueOrThrow({ where: { id }, select: { executionState: true } })).executionState

describe('the execution state follows the run', () => {
  it('a claim makes it Running, and one behind a running task Waiting', async () => {
    const where = await agentInProject()
    const first = await addTask(where)
    const second = await addTask(where)
    expect(await claimTask(first.id, where.agent.id, where.project.id, 'person', where.person.id)).toBe('claimed')
    expect(await claimTask(second.id, where.agent.id, where.project.id, 'person', where.person.id)).toBe('waiting')
    expect(await executionOf(first.id)).toBe('RUNNING')
    expect(await executionOf(second.id)).toBe('WAITING')
  })

  it.each([
    ['COMPLETED', null, 'FINISHED'],
    ['FAILED', 'boom', 'FAILED'],
    ['CANCELLED', 'cancelled', 'NOT_STARTED'],
  ] as const)('a %s end leaves it %s', async (status, error, state) => {
    const where = await agentInProject()
    const task = await addTask(where, { runState: 'RUN_ACTIVE', runId: 'run-1', executionState: 'RUNNING' })
    await listen(frame(task.id, 'run-1', { status, error }))
    await settle()
    expect(await executionOf(task.id)).toBe(state)
  })

  it('a run that ends asking for a tool approval needs the person', async () => {
    const where = await agentInProject()
    const task = await addTask(where, { runState: 'RUN_ACTIVE', runId: 'run-1', executionState: 'RUNNING' })
    const manifestPending = { runId: 'run-1', summary: null, pendingManifest: { tools: [{ name: 'bash' }], bashPatterns: [] } }
    await listen(frame(task.id, 'run-1', { manifestPending, agentId: where.agent.id }))
    await settle()
    expect(await executionOf(task.id)).toBe('NEEDS_YOU')
  })

  it('a late end of an earlier run leaves the newer run Running', async () => {
    const where = await agentInProject()
    const task = await addTask(where, { runState: 'RUN_ACTIVE', runId: 'run-2', executionState: 'RUNNING' })
    await listen(frame(task.id, 'run-1', { status: 'FAILED', error: 'old' }))
    await settle()
    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({ runState: 'RUN_ACTIVE', runId: 'run-2', executionState: 'RUNNING' })
  })

  it('of two ends of one run arriving at once, the first settles it and the second changes nothing', async () => {
    const where = await agentInProject()
    const task = await addTask(where, { runState: 'RUN_ACTIVE', runId: 'run-1', executionState: 'RUNNING' })
    await Promise.all([
      listen(frame(task.id, 'run-1', { status: 'COMPLETED' })),
      listen(frame(task.id, 'run-1', { status: 'FAILED', error: 'late' })),
    ])
    await settle()
    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } })
    // Frames for one task are taken in order: the first to arrive is the one that counts.
    expect(after).toMatchObject({ runState: 'RUN_NONE', executionState: 'FINISHED' })
  })

  it('taking a waiting task out of line makes it Not started (N4)', async () => {
    const where = await agentInProject()
    const task = await addTask(where, { runState: 'RUN_QUEUED', executionState: 'WAITING' })
    expect(await withdrawPendingRun(task.id)).toBe(true)
    expect(await executionOf(task.id)).toBe('NOT_STARTED')
  })
})
