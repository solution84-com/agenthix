/**
 * The lead's own tool at Ask, answered, against the real test database (conversation layer spec, Approval, two
 * cases, one shape; Stopping): the call waits with its card; the answer is the person's message, the lead's turn
 * taken on it from the card and not from the tool; approve runs the call once, as the person who answered; decline
 * and Stop end it cancelled with no report turn; an answerer who fails the asker's checks is refused. The tool
 * entry, the coordinator's scheduling and the mailbox are stood in for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../../test/db'
import { createAgent, createProject, createUserWithRole } from '../../../../test/factories'
import { turnCapability } from '../../../../server/controlplane/__tests__/turnFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../../agents/dispatchService', () => import('../../../../test/fakes/dispatchService'))
vi.mock('../../../../sessions/siteRuntimeStore', () => import('../../../../test/fakes/siteRuntimeStore'))
vi.mock('../../../../server/controlplane/operations', () => ({ callOperation: vi.fn(async () => ({ success: true })) }))
vi.mock('../../../coordinator/scheduler', () => ({ scheduleConversation: vi.fn(), stopRunningTurn: vi.fn() }))
vi.mock('../../../coordinator/mailbox', async () => {
  const { spyMailbox } = await import('../../workers/__tests__/workerFixtures')
  const { createSettleOperation } = await import('../../settle')
  const mailbox = spyMailbox()
  return { mailbox, settleOperation: createSettleOperation(() => mailbox) }
})

import { callOperation } from '../../../../server/controlplane/operations'
import { scheduleConversation } from '../../../coordinator/scheduler'
import { mailbox } from '../../../coordinator/mailbox'
import { openJson, sealText } from '../../../sealing'
import type { TurnCapability } from '../../../contract'
import { askFirst } from '../ask'
import { answerApprovalTool, cancelOperationTool, TYPED_APPROVAL_REFUSED } from '../leadTools'
import { answerConversationApproval, cancelConversationOperation } from '../../answerAndStop'
import { appendMessage } from '../../../store/messages'
import { forgetReadBacks } from '../../../voice/readBack'

let person: { id: string }
let agent: { id: string; name: string }
let conversationId: string
let capability: TurnCapability
const ctx = () => ({ user: { id: person.id } })
const NEVER = { signal: new AbortController().signal }

beforeEach(async () => {
  vi.clearAllMocks()
  forgetReadBacks()
  person = await createUserWithRole('MEMBER')
  agent = await createAgent({ name: 'Kernel' })
  const conversation = await prisma.conversation.create({ data: { home: 'PERSON', openedById: person.id, agentId: agent.id } })
  conversationId = conversation.id
  capability = turnCapability({
    conversationId, agentId: agent.id, actingUserId: person.id, trigger: 'MESSAGE',
    permissions: { bypassed: false, allowedTools: [{ name: 'update_task', state: 'ask' }], allowedBashPatterns: [], neverTools: [] },
  })
})

async function asked(): Promise<string> {
  const outcome = await askFirst({ capability, toolName: 'update_task', args: { taskId: 't1', title: 'New' }, reason: 'to rename it as you said' })
  if (outcome.status !== 'waitingApproval') throw new Error(JSON.stringify(outcome))
  return outcome.operationId
}

const operation = (id: string) => prisma.operation.findUniqueOrThrow({ where: { id } })
const messages = (kind: 'APPROVAL_REQUEST' | 'APPROVAL_ANSWER' | 'NOTICE') => prisma.conversationMessage.findMany({ where: { conversationId, kind }, orderBy: { seq: 'asc' } })

async function ended(id: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (!['WAITING_FOR_APPROVAL', 'RUNNING'].includes((await operation(id)).state)) return
    await new Promise(r => setTimeout(r, 10))
  }
  throw new Error('the approved call never ended')
}

describe('the lead asks @SC-959', () => {
  it('creates the call waiting for approval, its arguments sealed, with a card that awaits no turn', async () => {
    const id = await asked()
    const op = await operation(id)
    expect(op).toMatchObject({ kind: 'TOOL', state: 'WAITING_FOR_APPROVAL', toolName: 'update_task', authorisedById: person.id, boundaryType: 'user', boundaryId: person.id })
    expect(openJson(op.args!)).toEqual({ taskId: 't1', title: 'New' })
    const [card] = await messages('APPROVAL_REQUEST')
    expect(card).toMatchObject({ role: 'PLATFORM', operationId: id, awaitsTurn: false })
    expect(openJson(card!.body)).toEqual({
      title: 'Update task', reason: 'to rename it as you said', askedBy: 'Kernel', what: 'Update task (title: "New")', boundaryName: 'your space',
    })
    expect(callOperation).not.toHaveBeenCalled()
  })

  it('the same ask while it waits is that one: one card', async () => {
    const id = await asked()
    expect(await asked()).toBe(id)
    expect(await messages('APPROVAL_REQUEST')).toHaveLength(1)
  })
})

describe('answered on the card @SC-959', () => {
  it("approve: the answer is the person's message, filed under the turn that asked with no turn of its own, since the call's result is the reply; the call runs once, as them", async () => {
    const id = await asked()
    const result = await answerConversationApproval({ conversationId, operationId: id, answer: 'approve', clientMessageId: 'c-1' }, ctx())
    expect(result.duplicate).toBe(false)
    const [answer] = await messages('APPROVAL_ANSWER')
    expect(answer).toMatchObject({ role: 'PERSON', authorId: person.id, operationId: id, turnId: capability.turnId, clientMessageId: 'c-1', queueState: null })
    expect(openJson(answer!.body)).toEqual({ answer: 'approve' })
    expect(scheduleConversation).not.toHaveBeenCalled()

    await ended(id)
    expect(callOperation).toHaveBeenCalledOnce()
    const [tool, caller, args] = vi.mocked(callOperation).mock.calls[0]!
    expect(tool).toBe('update_task')
    expect(caller).toMatchObject({ kind: 'turn', turn: { actingUserId: person.id, conversationId } })
    expect(args).toEqual({ taskId: 't1', title: 'New' })
    expect(await operation(id)).toMatchObject({ state: 'COMPLETED', promoted: true, noReport: false })
    expect(mailbox.operationEnded).toHaveBeenCalledWith(id)
  })

  it('the same tap sent twice is one answer, carried out once', async () => {
    const id = await asked()
    await answerConversationApproval({ conversationId, operationId: id, answer: 'approve', clientMessageId: 'c-1' }, ctx())
    const again = await answerConversationApproval({ conversationId, operationId: id, answer: 'approve', clientMessageId: 'c-1' }, ctx())
    expect(again.duplicate).toBe(true)
    await ended(id)
    expect(callOperation).toHaveBeenCalledOnce()
    expect(await messages('APPROVAL_ANSWER')).toHaveLength(1)
  })

  it('decline: ends cancelled with no report turn, with the note, and nothing runs', async () => {
    const id = await asked()
    await answerConversationApproval({ conversationId, operationId: id, answer: 'decline', note: 'Not now', clientMessageId: 'c-1' }, ctx())
    const op = await operation(id)
    expect(op).toMatchObject({ state: 'CANCELLED', noReport: true })
    expect(openJson(op.resultSummary!)).toEqual({ summary: 'Declined: Not now' })
    const [answer] = await messages('APPROVAL_ANSWER')
    expect(openJson(answer!.body)).toEqual({ answer: 'decline', note: 'Not now' })
    // Nothing else comes back: the lead takes its turn on the answer.
    expect(answer).toMatchObject({ turnId: null })
    expect(scheduleConversation).toHaveBeenCalledWith(conversationId)
    expect(callOperation).not.toHaveBeenCalled()
  })

  it('a second answer, by a new tap, is refused', async () => {
    const id = await asked()
    await answerConversationApproval({ conversationId, operationId: id, answer: 'decline', clientMessageId: 'c-1' }, ctx())
    await expect(answerConversationApproval({ conversationId, operationId: id, answer: 'approve', clientMessageId: 'c-2' }, ctx()))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(callOperation).not.toHaveBeenCalled()
  })

  it('marks the request\'s notification handled', async () => {
    const id = await asked()
    const n = await prisma.notification.create({
      data: { userId: person.id, type: 'conversation_approval', title: 'Kernel asks', body: 'x', conversationId, operationId: id },
    })
    await answerConversationApproval({ conversationId, operationId: id, answer: 'decline', clientMessageId: 'c-1' }, ctx())
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).status).toBe('handled')
  })
})

describe('whoever answers passes the asker\'s checks @SC-959', () => {
  it('is refused, with why, for work in a project they cannot work in, and nothing is written', async () => {
    const other = await createProject({ name: 'Finance' })
    const op = await prisma.operation.create({
      data: {
        conversationId, kind: 'TASK', mode: 'BACKGROUND', toolName: 'run_task', idempotencyKey: 'k', state: 'WAITING_FOR_APPROVAL',
        title: sealText('FIN-1 Close the books'), authorisedById: person.id, boundaryType: 'project', boundaryId: other.id,
      },
    })
    await expect(answerConversationApproval({ conversationId, operationId: op.id, answer: 'approve', clientMessageId: 'c-1' }, ctx()))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('Finance') })
    expect(await messages('APPROVAL_ANSWER')).toHaveLength(0)
    expect((await operation(op.id)).state).toBe('WAITING_FOR_APPROVAL')
  })

  it('someone who may not speak in the conversation is told it does not exist', async () => {
    const id = await asked()
    const stranger = await createUserWithRole('MEMBER')
    await expect(answerConversationApproval({ conversationId, operationId: id, answer: 'approve', clientMessageId: 'c-1' }, { user: { id: stranger.id } }))
      .rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('answered through the lead @SC-959', () => {
  it("is taken by the turn on the person's words: no second turn", async () => {
    const id = await asked()
    const next = { ...capability, turnId: 'turn-2' }
    expect(await answerApprovalTool.offered(next)).toBe(true)
    expect(await answerApprovalTool.describe(next)).toContain(`${id}: Update task`)
    const outcome = await answerApprovalTool.run(next, { operationId: id, answer: 'decline', note: 'no' }, NEVER)
    expect(outcome).toEqual({ status: 'done', operationId: id, result: { answered: 'decline' } })
    const [answer] = await messages('APPROVAL_ANSWER')
    expect(answer).toMatchObject({ authorId: person.id, turnId: 'turn-2', operationId: id })
    expect(scheduleConversation).not.toHaveBeenCalled()
    expect((await operation(id)).state).toBe('CANCELLED')
  })

  it('takes no approval from a typed message: the person approves with the button, and nothing changes', async () => {
    const id = await asked()
    const outcome = await answerApprovalTool.run({ ...capability, turnId: 'turn-2' }, { operationId: id, answer: 'approve' }, NEVER)
    expect(outcome).toEqual({ status: 'refused', reason: TYPED_APPROVAL_REFUSED })
    expect((await operation(id)).state).toBe('WAITING_FOR_APPROVAL')
    expect(await messages('APPROVAL_ANSWER')).toHaveLength(0)
  })

  it('never answers a request the lead asked in the same reply', async () => {
    const id = await asked()
    const outcome = await answerApprovalTool.run(capability, { operationId: id, answer: 'decline' }, NEVER)
    expect(outcome).toMatchObject({ status: 'refused', reason: expect.stringContaining('only the person') })
    expect((await operation(id)).state).toBe('WAITING_FOR_APPROVAL')
    expect(await messages('APPROVAL_ANSWER')).toHaveLength(0)
  })

  it('is not offered while nothing waits, in a turn that answers no one, or in a continuation', async () => {
    expect(await answerApprovalTool.offered(capability)).toBe(false)
    await asked()
    expect(await answerApprovalTool.offered({ ...capability, actingUserId: null, trigger: 'REPORT' })).toBe(false)
    expect(await answerApprovalTool.offered({ ...capability, turnId: 'turn-2', trigger: 'CONTINUATION', continuationDepth: 1 })).toBe(false)
  })
})

describe('approved aloud (voice) @SC-999', () => {
  const said = (turnId: string, text: string) =>
    appendMessage({ conversationId, role: 'PERSON', kind: 'TEXT', body: { text }, authorId: person.id, turnId, spoken: true })

  it('counts a spoken yes only after a read-back in an earlier turn, and records it as spoken with what was said', async () => {
    const id = await asked()
    await said('turn-2', 'yes go ahead')
    const first = await answerApprovalTool.run({ ...capability, turnId: 'turn-2' }, { operationId: id, answer: 'approve' }, NEVER)
    expect(first).toEqual({ status: 'done', operationId: id, result: { answered: null, readBackFirst: 'Approving: Update task. Yes?' } })
    expect((await operation(id)).state).toBe('WAITING_FOR_APPROVAL')
    expect(await messages('APPROVAL_ANSWER')).toHaveLength(0)

    await said('turn-3', 'yes')
    const second = await answerApprovalTool.run({ ...capability, turnId: 'turn-3' }, { operationId: id, answer: 'approve' }, NEVER)
    expect(second).toEqual({ status: 'done', operationId: id, result: { answered: 'approve' } })
    const [answer] = await messages('APPROVAL_ANSWER')
    expect(answer).toMatchObject({ spoken: true, turnId: 'turn-3' })
    expect(openJson(answer!.body)).toEqual({ answer: 'approve', transcript: 'yes' })
  })

  it('a spoken no needs no read-back', async () => {
    const id = await asked()
    await said('turn-2', 'no, leave it')
    const outcome = await answerApprovalTool.run({ ...capability, turnId: 'turn-2' }, { operationId: id, answer: 'decline' }, NEVER)
    expect(outcome).toMatchObject({ result: { answered: 'decline' } })
  })
})

describe('Stop @SC-965', () => {
  it('ends a waiting call cancelled with no report turn; stopping it again is not an error', async () => {
    const id = await asked()
    await cancelConversationOperation({ conversationId, operationId: id }, ctx())
    expect(await operation(id)).toMatchObject({ state: 'CANCELLED', noReport: true })
    await cancelConversationOperation({ conversationId, operationId: id }, ctx())
    expect(mailbox.operationEnded).toHaveBeenCalledTimes(1)
  })

  it("stops a worker's waiting request on its site, and its card no longer awaits a turn", async () => {
    const op = await prisma.operation.create({
      data: {
        conversationId, kind: 'WORKER', mode: 'BACKGROUND', toolName: 'start_work', idempotencyKey: 'k', state: 'WAITING_FOR_APPROVAL',
        title: sealText('Profile the pipeline'), authorisedById: person.id, boundaryType: 'user', boundaryId: person.id, siteId: 'site-1', runId: 'run-9',
      },
    })
    await prisma.conversationMessage.create({
      data: { conversationId, seq: 1, role: 'PLATFORM', kind: 'APPROVAL_REQUEST', body: 'x', operationId: op.id, awaitsTurn: true },
    })
    await cancelConversationOperation({ conversationId, operationId: op.id }, ctx())
    expect(await operation(op.id)).toMatchObject({ state: 'CANCELLED', noReport: true })
    expect((await messages('APPROVAL_REQUEST'))[0]!.awaitsTurn).toBe(false)
  })

  it('through the lead, on the person\'s word', async () => {
    const id = await asked()
    expect(await cancelOperationTool.describe(capability)).toContain(`${id}: Update task (waiting)`)
    expect(await cancelOperationTool.run(capability, { operationId: id }, NEVER)).toEqual({ status: 'done', operationId: id, result: { stopped: true } })
    expect((await operation(id)).state).toBe('CANCELLED')
  })

  it('refuses work of another conversation', async () => {
    const other = await prisma.conversation.create({ data: { home: 'PERSON', openedById: person.id, agentId: agent.id } })
    const id = await asked()
    await expect(cancelConversationOperation({ conversationId: other.id, operationId: id }, ctx())).rejects.toMatchObject({ statusCode: 404 })
    expect((await operation(id)).state).toBe('WAITING_FOR_APPROVAL')
  })
})
