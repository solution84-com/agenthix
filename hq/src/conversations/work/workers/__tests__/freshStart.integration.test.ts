/**
 * A standing worker started fresh past the high mark, against the real test database (long conversations spec,
 * Workers and tasks): only between operations, never while one of its briefs runs or waits for approval; the new
 * session takes the slot's briefs, and the old one keeps its finished work.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../../agents/dispatchService', () => import('../../../../test/fakes/dispatchService'))
vi.mock('../../../../sessions/siteRuntimeStore', () => import('../../../../test/fakes/siteRuntimeStore'))
vi.mock('../../../coordinator/mailbox', async () => {
  const { spyMailbox } = await import('./workerFixtures')
  const { createSettleOperation } = await import('../../settle')
  const mailbox = spyMailbox()
  return { mailbox, settleOperation: createSettleOperation(() => mailbox) }
})

import * as dispatch from '../../../../test/fakes/dispatchService'
import * as siteStore from '../../../../test/fakes/siteRuntimeStore'
import { createStartWorkTool } from '../startWork'
import { pump } from '../queue'
import { handleWorkerRunStatus } from '../runEvents'
import { NEVER_ABORTED, briefOf, world, type World } from './workerFixtures'

let w: World
const tool = createStartWorkTool({ moveOn: () => {} })

beforeEach(async () => {
  vi.clearAllMocks()
  w = await world()
})

async function brief(text: string) {
  const outcome = await tool.run(w.capability, { boundary: w.project.key, title: text, brief: text }, NEVER_ABORTED)
  if (outcome.status !== 'accepted') throw new Error(`not admitted: ${JSON.stringify(outcome)}`)
  return prisma.operation.findUniqueOrThrow({ where: { id: outcome.operationId } })
}
const op = (id: string) => prisma.operation.findUniqueOrThrow({ where: { id } })
const frame = (runId: string, status: 'COMPLETED' | 'RUNNING') =>
  ({ runId, sessionId: 's', taskId: null, agentId: w.agent.id, agentHandle: 'dev', status, error: null, sessionPatch: null, manifestPending: null })

async function contextOf(sessionId: string, tokens: number) {
  const session = await siteStore.getSession('site-1', sessionId)
  if (!session) throw new Error('the worker is not on its site')
  session.contextUse = { tokens, summarisesAt: 180_000, window: 200_000, at: new Date().toISOString() }
}

describe('a standing worker past the high mark @SC-960', () => {
  it('is started fresh before its next brief: a new session for the slot takes it, the old keeps its finished work', async () => {
    const first = await brief('First')
    const oldWorker = first.workerSessionId!
    await pump(oldWorker)
    await contextOf(oldWorker, 150_000)
    const second = await brief('Second')
    expect(second.workerSessionId).toBe(oldWorker)

    await handleWorkerRunStatus(frame('run-1', 'COMPLETED'), 'site-1', id => pump(id!))

    const moved = await op(second.id)
    expect(moved.workerSessionId).not.toBe(oldWorker)
    expect(moved).toMatchObject({ state: 'RUNNING', runId: 'run-2' })
    expect(dispatch.dispatchedChatRuns.map(r => [r.sessionId, briefOf(r.inputText)])).toEqual([[oldWorker, 'First'], [moved.workerSessionId, 'Second']])
    const fresh = await prisma.agentSession.findUniqueOrThrow({ where: { id: moved.workerSessionId! } })
    expect(fresh).toMatchObject({ conversationId: w.conversation.id, primaryOwnerId: w.project.id, userId: w.person.id, workerGeneration: 1 })
    expect(await op(first.id)).toMatchObject({ state: 'COMPLETED', workerSessionId: oldWorker })
    expect(await siteStore.getSession('site-1', fresh.id)).not.toBeNull()

    // The slot's next brief goes straight to the fresh worker.
    expect((await brief('Third')).workerSessionId).toBe(fresh.id)
  })

  it('is never started fresh mid-run: a brief queued behind a running one waits on the same worker', async () => {
    const first = await brief('First')
    await pump(first.workerSessionId!)
    await contextOf(first.workerSessionId!, 190_000)
    const second = await brief('Second')
    await pump(first.workerSessionId!)
    expect(await op(second.id)).toMatchObject({ state: 'QUEUED', workerSessionId: first.workerSessionId })
    expect(await prisma.agentSession.count({ where: { conversationId: w.conversation.id } })).toBe(1)
  })

  it('carries on in the same session below the mark', async () => {
    const first = await brief('First')
    await pump(first.workerSessionId!)
    await contextOf(first.workerSessionId!, 100_000)
    const second = await brief('Second')
    await handleWorkerRunStatus(frame('run-1', 'COMPLETED'), 'site-1', id => pump(id!))
    expect(await op(second.id)).toMatchObject({ state: 'RUNNING', workerSessionId: first.workerSessionId })
    expect(await prisma.agentSession.count({ where: { conversationId: w.conversation.id } })).toBe(1)
  })

  it('moves a brief left on the old worker to the slot\'s newest', async () => {
    const first = await brief('First')
    const oldWorker = first.workerSessionId!
    await pump(oldWorker)
    await contextOf(oldWorker, 150_000)
    await brief('Second')
    await handleWorkerRunStatus(frame('run-1', 'COMPLETED'), 'site-1', id => pump(id!))
    const fresh = await prisma.agentSession.findFirstOrThrow({ where: { conversationId: w.conversation.id, workerGeneration: 1 } })
    // A brief admitted against the old worker while the fresh start happened.
    const late = await prisma.operation.create({
      data: {
        conversationId: w.conversation.id, kind: 'WORKER', mode: 'BACKGROUND', toolName: 'start_work', idempotencyKey: 'late',
        state: 'QUEUED', title: 'x', brief: first.brief, boundaryType: 'project', boundaryId: w.project.id,
        authorisedById: w.person.id, workerSessionId: oldWorker,
      },
    })
    await pump(oldWorker)
    expect(await op(late.id)).toMatchObject({ state: 'QUEUED', workerSessionId: fresh.id })
  })
})

describe("a brief whose model needs another runtime than the worker's @SC-955", () => {
  it('runs on a fresh worker of that runtime, its session carrying the model, so an OpenRouter-only organisation can work', async () => {
    const openRouter = 'openrouter/~deepseek/deepseek-flash-latest'
    await prisma.agent.update({ where: { id: w.agent.id }, data: { runtime: 'claude-sdk', defaultModel: 'claude-sonnet-4-6' } })
    await prisma.modelPolicy.create({ data: { ownerType: 'org', ownerId: 'org', lightWork: openRouter } })

    const first = await brief('First')
    const oldWorker = first.workerSessionId!
    expect((await prisma.agentSession.findUniqueOrThrow({ where: { id: oldWorker } })).runtime).toBe('claude-sdk')
    await pump(oldWorker)

    const moved = await op(first.id)
    expect(moved.workerSessionId).not.toBe(oldWorker)
    expect(moved).toMatchObject({ state: 'RUNNING' })
    const fresh = await prisma.agentSession.findUniqueOrThrow({ where: { id: moved.workerSessionId! } })
    expect(fresh).toMatchObject({ runtime: 'opencode', model: openRouter, workerGeneration: 1 })
    expect(vi.mocked(dispatch.dispatchChatRun).mock.calls.map(c => [c[0], c[3]])).toEqual([[fresh.id, openRouter]])

    // The next brief goes straight to it and stays.
    const second = await brief('Second')
    expect(second.workerSessionId).toBe(fresh.id)
  })
})
