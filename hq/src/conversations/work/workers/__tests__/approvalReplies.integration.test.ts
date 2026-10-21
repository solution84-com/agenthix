/**
 * One piece of work, one reply presenting what came back, however an approval in the middle is answered (workers
 * and results spec, Results; conversation layer spec, Approval), against the real test database: a worker that
 * gave its result and then asked for a command has a card asking, with its words about the request as the reason
 * and never its result; the request takes no turn (the agent says nothing when it arrives), and nor does the answer
 * from the card; the result is presented once, when the continued run ends. The site and dispatch are the shared fakes; the mailbox is the real one.
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
vi.mock('../../../coordinator/scheduler', () => ({ scheduleConversation: vi.fn(), stopRunningTurn: vi.fn() }))
vi.mock('../../../coordinator/mailbox', async () => {
  const actual = await vi.importActual<typeof import('../../../coordinator/mailbox')>('../../../coordinator/mailbox')
  const { createSettleOperation } = await import('../../settle')
  const quiet = { message() {}, messageUpdated() {}, delta() {}, turn() {}, operation() {}, operationLines() {} }
  const mailbox = actual.createMailbox({ schedule: () => {}, notify: async () => {}, events: quiet })
  return { ...actual, mailbox, settleOperation: createSettleOperation(() => mailbox) }
})

import type { RunStatusEvent } from '@agenthix/core'
import * as siteStore from '../../../../test/fakes/siteRuntimeStore'
import { claimNextTurn } from '../../../coordinator/claim'
import { releaseLock } from '../../../coordinator/lock'
import { conversationEvents } from '../../../coordinator/events'
import { openJson } from '../../../sealing'
import { answerConversationApproval } from '../../answerAndStop'
import { createStartWorkTool } from '../startWork'
import { pump } from '../queue'
import { handleWorkerRunStatus } from '../runEvents'
import { NEVER_ABORTED, world, type World } from './workerFixtures'

let w: World
const tool = createStartWorkTool({ moveOn: () => {} })
const REQUEST = { tools: [], bashPatterns: [{ pattern: 'ls', reason: 'ls -la /workspace' }] }
/** A run that went on to its whole result after the tool was refused, as the owner saw. */
const RESULT_THEN_ASK = [
  '## Part 1', '', '**The personal space is empty.** There are no files yet.', '',
  'I wanted to run `ls` to check for hidden files, which needs approval.', '',
  '## Part 2', '', '- Nothing looks unfinished.',
].join('\n')

beforeEach(async () => {
  vi.clearAllMocks()
  w = await world()
})

function frame(runId: string, status: RunStatusEvent['status'], over: Partial<RunStatusEvent> = {}): RunStatusEvent {
  return { runId, sessionId: 's', taskId: null, agentId: w.agent.id, agentHandle: 'dev', status, error: null, sessionPatch: null, manifestPending: null, ...over }
}
const deliver = (e: RunStatusEvent) => handleWorkerRunStatus(e, 'site-1', id => pump(id!))
const reload = (id: string) => prisma.operation.findUniqueOrThrow({ where: { id } })

/** Claims the next turn, if any, and ends it at once: what it took, by kind. */
async function nextTurn(): Promise<{ trigger: string; kinds: string[] } | null> {
  const { claimed } = await claimNextTurn(w.conversation.id, new Date(), () => async () => false)
  if (!claimed) return null
  await releaseLock(prisma, w.conversation.id, claimed.turnId)
  const taken = await prisma.conversationMessage.findMany({ where: { id: { in: claimed.inputIds } }, orderBy: { seq: 'asc' }, select: { kind: true } })
  return { trigger: claimed.trigger, kinds: taken.map(m => m.kind) }
}

/** A brief that ran, gave its result, and asked for `ls`: its card asks, and no turn is taken for it. */
async function asked() {
  const outcome = await tool.run(w.capability, { boundary: w.project.key, title: 'Check my space', brief: 'Check my space' }, NEVER_ABORTED)
  if (outcome.status !== 'accepted') throw new Error('not admitted')
  const op = await prisma.operation.findUniqueOrThrow({ where: { id: outcome.operationId } })
  await pump(op.workerSessionId!)
  siteStore.addRun('site-1', { id: 'run-1', sessionId: op.workerSessionId!, outputText: RESULT_THEN_ASK, manifestStatus: 'PENDING_APPROVAL', pendingManifest: REQUEST })
  await deliver(frame('run-1', 'COMPLETED', { manifestPending: { runId: 'run-1', summary: null, pendingManifest: REQUEST } }))
  expect(await prisma.conversationMessage.count({ where: { conversationId: w.conversation.id, kind: 'APPROVAL_REQUEST' } })).toBe(1)
  expect(await nextTurn()).toBeNull()
  return op
}

async function cardBody() {
  const card = await prisma.conversationMessage.findFirstOrThrow({ where: { conversationId: w.conversation.id, kind: 'APPROVAL_REQUEST' } })
  return openJson<{ reason: string; what: string }>(card.body)
}

async function finish(op: { id: string; workerSessionId: string | null }, said: string) {
  siteStore.addRun('site-1', { id: 'run-2', sessionId: op.workerSessionId!, outputText: said })
  await deliver(frame('run-2', 'COMPLETED'))
  expect((await reload(op.id)).state).toBe('COMPLETED')
  // The mailbox hears of the end after it is recorded: its card is written a moment later.
  await vi.waitFor(async () => expect(await prisma.conversationMessage.count({ where: { conversationId: w.conversation.id, kind: 'RESULT' } })).toBe(1))
}

describe('a worker that asks for approval after giving its result @SC-964', () => {
  it("has a card asking, with its words about the request as the card's reason, plain, never the result", async () => {
    await asked()
    const body = await cardBody()
    expect(body).toEqual(expect.objectContaining({ what: 'Run “ls”', reason: 'I wanted to run ls to check for hidden files, which needs approval.' }))
    expect(body.reason).not.toContain('empty')
  })

  it('ask → decline → finish: the decline takes no turn of its own, and the result is presented once', async () => {
    const op = await asked()
    const announced = vi.spyOn(conversationEvents, 'operation')
    await answerConversationApproval({ conversationId: w.conversation.id, operationId: op.id, answer: 'decline', clientMessageId: 'c-1' }, { user: { id: w.person.id } })
    expect(await nextTurn()).toBeNull()
    // The row no longer reads as waiting: the worker is told in a new run.
    expect(await reload(op.id)).toMatchObject({ state: 'RUNNING', runId: 'run-2' })
    expect(announced).toHaveBeenCalledWith(expect.objectContaining({ operationId: op.id, state: 'RUNNING' }))

    await finish(op, 'Your space is empty; I did not need ls.')
    expect(await nextTurn()).toEqual({ trigger: 'REPORT', kinds: ['RESULT'] })
    expect(await nextTurn()).toBeNull()
    expect(await prisma.inferenceTurn.count({ where: { conversationId: w.conversation.id } })).toBe(1)
  })

  it('ask → approve → finish: the approval takes no turn of its own, and the result is presented once', async () => {
    const op = await asked()
    await answerConversationApproval({ conversationId: w.conversation.id, operationId: op.id, answer: 'approve', clientMessageId: 'c-1' }, { user: { id: w.person.id } })
    expect(await nextTurn()).toBeNull()
    await finish(op, 'Your space is empty, hidden files included.')
    expect(await nextTurn()).toEqual({ trigger: 'REPORT', kinds: ['RESULT'] })
    expect(await prisma.inferenceTurn.count({ where: { conversationId: w.conversation.id } })).toBe(1)
  })

  it('keeps the answer in the record the lead reads: filed under the turn that started the work', async () => {
    const op = await asked()
    await answerConversationApproval({ conversationId: w.conversation.id, operationId: op.id, answer: 'decline', note: 'not now', clientMessageId: 'c-1' }, { user: { id: w.person.id } })
    const answer = await prisma.conversationMessage.findFirstOrThrow({ where: { conversationId: w.conversation.id, kind: 'APPROVAL_ANSWER' } })
    expect(answer).toMatchObject({ turnId: op.turnId, queueState: null, authorId: w.person.id })
    expect(op.turnId).not.toBeNull()
  })
})
