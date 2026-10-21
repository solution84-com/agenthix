/**
 * What a person does to a conversation besides sending a message (every screen
 * reviewed, *What a conversation shows*), against the real test DB: Try again
 * on the latest reply while it is a failure, Send now and Cancel on a message
 * waiting behind a running reply, Summarise now while the agent is idle; and
 * the conversation read carrying the record's facts. The site is the shared
 * fake.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createAgent, createSession, createWorkerSession } from '../../test/factories'
import { ctx } from './sessionActionsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))

import { tryAgain, sendWaitingMessageNow, cancelWaitingMessage, summariseConversation } from '../conversationActions'
import { getSession } from '../queries'
import * as dispatchFake from '../../test/fakes/dispatchService'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const SITE = 'site-1'
const at = (m: number) => new Date(Date.UTC(2026, 9, 10, 10, m)).toISOString()

async function chat() {
  const owner = await createUser()
  const session = await createWorkerSession({ userId: owner.id, agentId: (await createAgent()).id })
  return { owner, session }
}

function failedReply(sessionId: string) {
  siteStore.addRun(SITE, { id: 'run-a', sessionId, status: 'FAILED' })
  siteStore.addTranscript(SITE, sessionId, [
    { role: 'USER', content: 'Summarise everything we decided today.', runId: 'run-a', createdAt: at(30) },
    { role: 'TOOL', content: 'read_file', toolName: 'read_file', runId: 'run-a', createdAt: at(30) },
    { role: 'SYSTEM', kind: 'RUN_FAILED', content: '', detail: { reason: 'The site lost its connection to the model.' }, runId: 'run-a', createdAt: at(31) },
  ])
}

describe('Try again @SC-695', () => {
  it('sends the same message again in a fresh run, hidden, told the last attempt failed', async () => {
    const { owner, session } = await chat()
    failedReply(session.id)

    await expect(tryAgain({ sessionId: session.id }, ctx(owner))).resolves.toMatchObject({ id: expect.any(String) })

    const [run] = dispatchFake.dispatchedChatRuns
    expect(run.inputText).toBe(
      '[Your last reply to this message did not finish. The site lost its connection to the model. The person asked you to try again.]\n\n' +
      'Summarise everything we decided today.',
    )
    expect(dispatchFake.dispatchChatRun).toHaveBeenCalledWith(session.id, run.inputText, expect.anything(), null, { hideUserMessage: true, senderId: owner.id })
  })

  it('is refused once a newer message was sent, so there is never more than one', async () => {
    const { owner, session } = await chat()
    failedReply(session.id)
    siteStore.addTranscript(SITE, session.id, [{ role: 'USER', content: 'Hello?', runId: 'run-b', createdAt: at(32) }])

    await expect(tryAgain({ sessionId: session.id }, ctx(owner))).rejects.toMatchObject({ statusCode: 409 })
    expect(dispatchFake.dispatchedChatRuns).toEqual([])
  })

  it('is refused while the agent is working', async () => {
    const { owner, session } = await chat()
    failedReply(session.id)
    siteStore.addRun(SITE, { id: 'run-c', sessionId: session.id, status: 'RUNNING' })

    await expect(tryAgain({ sessionId: session.id }, ctx(owner))).rejects.toMatchObject({ statusCode: 409 })
  })

  it("is refused to anyone but the conversation's person, as if it did not exist", async () => {
    const { session } = await chat()
    failedReply(session.id)
    await expect(tryAgain({ sessionId: session.id }, ctx(await createUser()))).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('a message waiting behind a running reply @SC-693', () => {
  function waiting(sessionId: string, senderId: string) {
    siteStore.addRun(SITE, { id: 'run-reply', sessionId, status: 'RUNNING' })
    siteStore.addRun(SITE, { id: 'run-waiting', sessionId, status: 'PENDING', metadata: { dispatch: { kind: 'chat', onBehalfOfUserId: senderId } } })
  }

  it('Send now stops the running reply for it, as interrupted by the sender', async () => {
    const { owner, session } = await chat()
    waiting(session.id, owner.id)

    await expect(sendWaitingMessageNow({ sessionId: session.id, runId: 'run-waiting' }, ctx(owner))).resolves.toEqual({ interrupted: 1 })
    expect(siteStore.cancelledRuns).toEqual([{ siteId: SITE, runId: 'run-reply', reason: 'interrupted', by: owner.id.slice(0, 8) }])
    expect((await siteStore.getRun(SITE, 'run-waiting'))?.status).toBe('PENDING')
  })

  it('Cancel withdraws it before it starts', async () => {
    const { owner, session } = await chat()
    waiting(session.id, owner.id)

    await expect(cancelWaitingMessage({ sessionId: session.id, runId: 'run-waiting' }, ctx(owner))).resolves.toEqual({ ok: true })
    expect(siteStore.cancelledRuns).toEqual([{ siteId: SITE, runId: 'run-waiting', reason: 'withdrawn', by: owner.id.slice(0, 8) }])
    expect((await siteStore.getRun(SITE, 'run-reply'))?.status).toBe('RUNNING')
  })

  it('neither is possible once the agent has started on it', async () => {
    const { owner, session } = await chat()
    siteStore.addRun(SITE, { id: 'run-started', sessionId: session.id, status: 'RUNNING' })

    await expect(cancelWaitingMessage({ sessionId: session.id, runId: 'run-started' }, ctx(owner))).rejects.toMatchObject({ statusCode: 409 })
    await expect(sendWaitingMessageNow({ sessionId: session.id, runId: 'run-started' }, ctx(owner))).rejects.toMatchObject({ statusCode: 409 })
  })

  it("is refused for another conversation's run", async () => {
    const { owner, session } = await chat()
    siteStore.addRun(SITE, { id: 'run-elsewhere', sessionId: 'another', status: 'PENDING' })
    await expect(cancelWaitingMessage({ sessionId: session.id, runId: 'run-elsewhere' }, ctx(owner))).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('Summarise now @SC-698', () => {
  it('asks the runtime to summarise with a hidden request, as the person', async () => {
    const { owner, session } = await chat()
    await expect(summariseConversation({ sessionId: session.id }, ctx(owner))).resolves.toMatchObject({ id: expect.any(String) })
    expect(dispatchFake.dispatchChatRun).toHaveBeenCalledWith(session.id, '/compact', expect.anything(), null, { hideUserMessage: true, senderId: owner.id })
  })

  it('is refused while the agent is working', async () => {
    const { owner, session } = await chat()
    siteStore.addRun(SITE, { id: 'run-busy', sessionId: session.id, status: 'PENDING' })
    await expect(summariseConversation({ sessionId: session.id }, ctx(owner))).rejects.toMatchObject({ statusCode: 409 })
    expect(dispatchFake.dispatchedChatRuns).toEqual([])
  })
})

describe('reading a conversation @SC-697 @SC-699', () => {
  it("carries the record's facts: replies, failures, Try again's failure and the agent's memory", async () => {
    const { owner, session } = await chat()
    const use = { tokens: 124_000, summarisesAt: 184_000, window: 200_000, at: at(31) }
    siteStore.addSession(SITE, { id: session.id, contextUse: use })
    failedReply(session.id)

    const read = await getSession({ id: session.id }, ctx(owner))

    expect(read.conversation).toEqual({
      replies: 1, failed: 1, contextUse: use,
      latestFailure: { runId: 'run-a', reason: 'The site lost its connection to the model.', message: 'Summarise everything we decided today.' },
    })
    expect(read.entries.map((e: { kind?: string | null; role: string }) => e.kind ?? e.role)).toEqual(['USER', 'TOOL', 'RUN_FAILED'])
  })
})
