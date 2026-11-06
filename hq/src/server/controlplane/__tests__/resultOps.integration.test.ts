/**
 * set_result (workers and results spec, Results), against the real test database: only a run states a result,
 * and only its own, while it runs; the result is written to the run, a later statement replacing an earlier one,
 * and a task's result is its latest run's. A run that ends without stating one is marked so. A task's run is
 * numbered as it starts, never reusing a number. The runs live on the site, held by the siteRuntimeStore fake.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))

import * as siteStore from '../../../test/fakes/siteRuntimeStore'
import { callOperation } from '../operations'
import { ControlPlaneError } from '../types'
import { markEndedRun } from '../runResults'
import { latestTaskRuns, numberTaskRun } from '../taskRunResults'
import { chatCtx, chatSession, connCtx, expectForbidden, runCtx, seedWorld, type World } from './controlPlaneFixtures'
import { turnCaller } from './turnFixtures'

const SITE = 'site-local'
let w: World

beforeEach(async () => {
  w = await seedWorld()
  await prisma.agentSession.create({ data: { id: 'task-s', userId: w.member.id, agentId: w.agentId, sessionType: 'task', taskId: w.task.id } })
  siteStore.addRun(SITE, { id: 'run-1', sessionId: 'task-s', taskId: w.task.id, status: 'RUNNING' })
})

const taskRun = () => runCtx(w.project.id, { sessionId: 'task-s' })
const setResult = (args: object, ctx = taskRun()) => callOperation('set_result', ctx, args)

describe("a task run's result @SC-970", () => {
  it("is written to the run, as stated, and is the task's result", async () => {
    expect(await setResult({ result: 'Released 1.2', runId: 'run-1' })).toMatchObject({ success: true, runId: 'run-1', taskId: w.task.id })
    expect(await prisma.runResult.findUniqueOrThrow({ where: { runId: 'run-1' } })).toMatchObject({
      siteId: SITE, sessionId: 'task-s', taskId: w.task.id, result: 'Released 1.2', stated: true,
    })
    expect((await latestTaskRuns([w.task.id])).get(w.task.id)?.result).toBe('Released 1.2')
  })

  it('is replaced by a later statement in the same run', async () => {
    await setResult({ result: 'Half done', runId: 'run-1' })
    await setResult({ result: 'Released 1.2', runId: 'run-1' })
    expect(await prisma.runResult.count()).toBe(1)
    expect((await latestTaskRuns([w.task.id])).get(w.task.id)?.result).toBe('Released 1.2')
  })

  it("is refused for a run that is not the caller's own", async () => {
    siteStore.addRun(SITE, { id: 'run-other', sessionId: 'someone-elses', taskId: w.task.id, status: 'RUNNING' })
    await expectForbidden(setResult({ result: 'Released', runId: 'run-other' }))
    expect(await prisma.runResult.count()).toBe(0)
  })

  it('is refused once the run has ended', async () => {
    siteStore.addRun(SITE, { id: 'run-done', sessionId: 'task-s', taskId: w.task.id, status: 'COMPLETED' })
    const err = await setResult({ result: 'Released', runId: 'run-done' }).then(() => null, e => e)
    expect(err).toBeInstanceOf(ControlPlaneError)
    expect(await prisma.runResult.count()).toBe(0)
  })

  it('is refused when the site does not say which run calls', async () => {
    const err = await setResult({ result: 'Released' }).then(() => null, e => e)
    expect(err).toMatchObject({ code: 'invalid' })
  })
})

describe("a chat run's result @SC-970", () => {
  it('is written to the run alone', async () => {
    await chatSession(w.member.id)
    siteStore.addRun(SITE, { id: 'run-chat', sessionId: 's1', taskId: null, status: 'RUNNING' })
    await setResult({ result: 'Answered the question', runId: 'run-chat' }, chatCtx(w.member.id))
    expect(await prisma.runResult.findUniqueOrThrow({ where: { runId: 'run-chat' } })).toMatchObject({ taskId: null, stated: true })
  })
})

describe('only a run states a result @SC-970', () => {
  it("is refused to a person's connection", async () => {
    await expectForbidden(setResult({ result: 'x', runId: 'run-1' }, connCtx(w.member.id)))
  })

  it("is refused to a conversation's turn", async () => {
    await expectForbidden(setResult({ result: 'x', runId: 'run-1' }, turnCaller({ actingUserId: w.member.id })))
  })
})

describe('a run that ends without stating its result @SC-970', () => {
  it("is marked as having stated none, and the task's result is then none, not the run before's", async () => {
    await numberTaskRun({ runId: 'run-0', siteId: SITE, sessionId: 'task-s', taskId: w.task.id })
    await prisma.runResult.update({ where: { runId: 'run-0' }, data: { result: 'From the run before', stated: true } })
    await numberTaskRun({ runId: 'run-1', siteId: SITE, sessionId: 'task-s', taskId: w.task.id })
    await markEndedRun({ runId: 'run-1', sessionId: 'task-s', taskId: w.task.id }, SITE)
    expect(await prisma.runResult.findUniqueOrThrow({ where: { runId: 'run-1' } })).toMatchObject({ result: null, stated: false, number: 2 })
    expect((await latestTaskRuns([w.task.id])).get(w.task.id)).toMatchObject({ runId: 'run-1', number: 2, result: null, stated: false })
    expect(await prisma.runResult.findUniqueOrThrow({ where: { runId: 'run-0' } })).toMatchObject({ result: 'From the run before' })
  })

  it('keeps the result it did state when its end is marked', async () => {
    await setResult({ result: 'Released 1.2', runId: 'run-1' })
    await markEndedRun({ runId: 'run-1', sessionId: 'task-s', taskId: w.task.id }, SITE)
    expect(await prisma.runResult.findUniqueOrThrow({ where: { runId: 'run-1' } })).toMatchObject({ result: 'Released 1.2', stated: true })
  })
})

describe("a task run's number @SC-970", () => {
  const start = (runId: string) => numberTaskRun({ runId, siteId: SITE, sessionId: 'task-s', taskId: w.task.id })

  it('is counted per task as each run starts, and stored on the run and the task', async () => {
    expect(await start('run-a')).toBe(1)
    expect(await start('run-b')).toBe(2)
    expect((await prisma.task.findUniqueOrThrow({ where: { id: w.task.id } })).runCount).toBe(2)
    expect(await prisma.runResult.findUniqueOrThrow({ where: { runId: 'run-b' } })).toMatchObject({ number: 2, stated: false, result: null })
  })

  it('is kept when the same run is numbered again, and never reused once its row is gone', async () => {
    expect(await start('run-a')).toBe(1)
    expect(await start('run-a')).toBe(1)
    await prisma.runResult.delete({ where: { runId: 'run-a' } })
    expect(await start('run-b')).toBe(2)
  })

  it("is given to a run whose end was recorded before its start", async () => {
    await markEndedRun({ runId: 'run-a', sessionId: 'task-s', taskId: w.task.id }, SITE)
    expect(await start('run-a')).toBe(1)
    expect(await prisma.runResult.findUniqueOrThrow({ where: { runId: 'run-a' } })).toMatchObject({ number: 1, stated: false })
  })

  it('is no task result for a task with no run', async () => {
    expect((await latestTaskRuns([w.task.id])).has(w.task.id)).toBe(false)
  })
})
