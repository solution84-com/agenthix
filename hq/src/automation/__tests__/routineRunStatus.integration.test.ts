/**
 * A routine run follows its run's frames (adr-0177) against the real test database: running, finished, failed,
 * stopped, waiting for an approval or at its limit; only from the site it was sent to; a late or repeated frame
 * changes nothing; a frame that beats the dispatch's answer still lands; the run an approval starts takes over.
 */
import { describe, it, expect, vi } from 'vitest'
import type { RunStatusEvent } from '@agenthix/core'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../sites/channel/siteEventHandler', () => ({ onRunStatus: vi.fn() }))
const notices = vi.hoisted(() => ({ raised: [] as string[] }))
vi.mock('../../notifications/persistent', () => ({
  raisePersistentNotification: vi.fn(async (_users: string[], n: { subjectKey: string }) => { notices.raised.push(n.subjectKey) }),
  clearPersistentNotification: vi.fn(async () => undefined),
}))

import { processRoutineRunStatus } from '../routineRunStatus'
import { createProjectWithUsers, routineIn } from './automationWorld'

const frame = (over: Partial<RunStatusEvent>): RunStatusEvent => ({
  runId: 'run-1', sessionId: 'session-1', taskId: null, agentId: 'agent-1', agentHandle: 'agent-1', status: 'RUNNING',
  error: null, sessionPatch: null, manifestPending: null, ...over,
})

async function world(run: Record<string, unknown> = {}) {
  const { project, users } = await createProjectWithUsers()
  const routine = await routineIn(project.id, users.person.id)
  const made = await prisma.routineRun.create({
    data: {
      routineId: routine.id, number: 1, onBehalfOfUserId: users.person.id, state: 'STARTING', sessionId: 'session-1',
      siteId: 'site-1', ...run,
    } as never,
  })
  return { routine, run: made }
}
const reread = (id: string) => prisma.routineRun.findUniqueOrThrow({ where: { id } })

describe("a routine run's frames", () => {
  it('a frame that beats the dispatch answer still lands, recording the run', async () => {
    const { run } = await world()
    await processRoutineRunStatus(frame({ status: 'RUNNING' }), 'site-1')
    expect(await reread(run.id)).toMatchObject({ state: 'RUNNING', runId: 'run-1' })
  })

  it.each([
    ['COMPLETED', null, null, 'FINISHED', null],
    ['FAILED', 'the model refused', null, 'FAILED', null],
    ['CANCELLED', 'Cancelled by user', null, 'STOPPED', null],
    ['CANCELLED', 'Run limit reached: the run was stopped after its time limit of 30 minutes.', null, 'FINISHED', 'limit'],
    ['COMPLETED', null, { runId: 'run-1', summary: 'wants Bash', pendingManifest: null }, 'FINISHED', 'approval'],
  ] as const)('%s (%s) settles it %s, asking %s', async (status, error, manifestPending, state, ask) => {
    const { run } = await world({ state: 'RUNNING', runId: 'run-1' })
    await processRoutineRunStatus(frame({ status, error, manifestPending: manifestPending as RunStatusEvent['manifestPending'] }), 'site-1')
    expect(await reread(run.id)).toMatchObject({ state, ask, endedAt: expect.any(Date) })
  })

  it('takes a frame only from the site the run was sent to', async () => {
    const { run } = await world({ state: 'RUNNING', runId: 'run-1' })
    await processRoutineRunStatus(frame({ status: 'COMPLETED' }), 'site-9')
    expect((await reread(run.id)).state).toBe('RUNNING')
  })

  it('a repeated or late frame, or one of another run, changes nothing once settled', async () => {
    const { run } = await world({ state: 'RUNNING', runId: 'run-1' })
    await processRoutineRunStatus(frame({ status: 'FAILED', error: 'first' }), 'site-1')
    await processRoutineRunStatus(frame({ status: 'COMPLETED' }), 'site-1')
    await processRoutineRunStatus(frame({ status: 'COMPLETED', runId: 'run-0' }), 'site-1')
    expect(await reread(run.id)).toMatchObject({ state: 'FAILED', reason: 'first' })
  })

  it('two end frames at once settle it once', async () => {
    const { run } = await world({ state: 'RUNNING', runId: 'run-1' })
    await Promise.all([
      processRoutineRunStatus(frame({ status: 'FAILED', error: 'a' }), 'site-1'),
      processRoutineRunStatus(frame({ status: 'COMPLETED' }), 'site-1'),
    ])
    expect(['FAILED', 'FINISHED']).toContain((await reread(run.id)).state)
  })

  it('the run an approval starts in its session takes the record over, and its end settles it', async () => {
    const { run } = await world({ state: 'FINISHED', runId: 'run-1', ask: 'approval', endedAt: new Date() })
    await processRoutineRunStatus(frame({ status: 'RUNNING', runId: 'run-2' }), 'site-1')
    expect(await reread(run.id)).toMatchObject({ state: 'RUNNING', runId: 'run-2', ask: null, endedAt: null })
    await processRoutineRunStatus(frame({ status: 'COMPLETED', runId: 'run-2' }), 'site-1')
    expect(await reread(run.id)).toMatchObject({ state: 'FINISHED', runId: 'run-2' })
  })

  it('a run whose dispatch answer never came, taken as failed, is going after all once its site says it started', async () => {
    const { run } = await world({ state: 'FAILED', reason: 'timed out', endedAt: new Date() })
    await processRoutineRunStatus(frame({ status: 'RUNNING' }), 'site-1')
    expect(await reread(run.id)).toMatchObject({ state: 'RUNNING', runId: 'run-1', reason: null, endedAt: null })
  })

  it("ignores a task's run and a session that is no routine's", async () => {
    const { run } = await world()
    await processRoutineRunStatus(frame({ status: 'COMPLETED', taskId: 't1' }), 'site-1')
    await processRoutineRunStatus(frame({ status: 'COMPLETED', sessionId: 'someone-elses-chat' }), 'site-1')
    expect((await reread(run.id)).state).toBe('STARTING')
  })

  it('three failures in a row tell the routine\'s person', async () => {
    const { routine } = await world({ state: 'FAILED', number: 1, sessionId: 's-a', endedAt: new Date() })
    await prisma.routineRun.create({ data: { routineId: routine.id, number: 2, onBehalfOfUserId: routine.onBehalfOfUserId, state: 'FAILED', sessionId: 's-b', siteId: 'site-1' } })
    await prisma.routineRun.create({ data: { routineId: routine.id, number: 3, onBehalfOfUserId: routine.onBehalfOfUserId, state: 'RUNNING', runId: 'run-3', sessionId: 's-c', siteId: 'site-1' } })
    notices.raised.length = 0
    await processRoutineRunStatus(frame({ status: 'FAILED', error: 'again', runId: 'run-3', sessionId: 's-c' }), 'site-1')
    expect(notices.raised).toEqual([routine.id])
  })
})
