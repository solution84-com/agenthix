/**
 * The mailbox (conversation layer spec, A completion while a reply streams; Lifecycle contracts, Conversation),
 * against the real test database: an ended operation is one RESULT card awaiting a turn however often it is
 * told; an archived conversation is woken; a closed one runs no turn and its reader is told the result's own
 * line, once; work the person stopped is a card and nothing more; an approval request is one card per run.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createConversation, createUserWithRole } from '../../../test/factories'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { sealJson, sealText } from '../../sealing'
import { createMailbox } from '../mailbox'
import { notifyCard } from '../notify'
import { readMessages } from '../../store/messages'
import { outstandingOperations } from '../../work/settle'
import type { ConversationEvents } from '../events'

function setup() {
  const schedule = vi.fn()
  const events: ConversationEvents = {
    message: vi.fn(), messageUpdated: vi.fn(), delta: vi.fn(), turn: vi.fn(), operation: vi.fn(), operationLines: vi.fn(),
  }
  return { schedule, events, mailbox: createMailbox({ schedule, notify: notifyCard, events }) }
}

async function conversationWith(status: 'ACTIVE' | 'ARCHIVED' | 'CLOSED' = 'ACTIVE') {
  const person = await createUserWithRole('MEMBER')
  const conversation = await createConversation({ openedById: person.id, status, ...(status === 'ARCHIVED' ? { archivedAt: new Date() } : {}) })
  return { person, conversation }
}

async function operation(conversationId: string, authorisedById: string, data: Record<string, unknown> = {}) {
  return prisma.operation.create({
    data: {
      conversationId, kind: 'WORKER', mode: 'BACKGROUND', toolName: 'start_work', idempotencyKey: `k-${Math.random()}`,
      state: 'COMPLETED', title: sealText('Review the README'), authorisedById,
      resultSummary: sealJson({ summary: 'Found 3 issues\nin detail', stated: true }), ...data,
    } as never,
  })
}

const cards = async (conversationId: string) =>
  prisma.conversationMessage.findMany({ where: { conversationId, kind: { in: ['RESULT', 'APPROVAL_REQUEST'] } }, orderBy: { seq: 'asc' } })

describe('operationEnded @SC-962', () => {
  it('writes one RESULT card awaiting a turn, and schedules the conversation, however often it is told', async () => {
    const { schedule, events, mailbox } = setup()
    const { person, conversation } = await conversationWith()
    const op = await operation(conversation.id, person.id)

    await mailbox.operationEnded(op.id)
    await mailbox.operationEnded(op.id)

    const written = await cards(conversation.id)
    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({ role: 'PLATFORM', kind: 'RESULT', operationId: op.id, awaitsTurn: true, turnId: null })
    const [view] = await readMessages(conversation.id, { limit: 1 })
    expect(view!.body).toMatchObject({ title: 'Review the README', summary: 'Found 3 issues\nin detail', outcome: 'completed', stated: true })
    expect(schedule).toHaveBeenCalledWith(conversation.id)
    expect(events.message).toHaveBeenCalledTimes(1)
    expect(events.operation).toHaveBeenCalledWith(expect.objectContaining({ operationId: op.id, state: 'COMPLETED', outstanding: 0 }))
  })

  it('does nothing for an operation still under way but tell the screens', async () => {
    const { mailbox } = setup()
    const { person, conversation } = await conversationWith()
    const op = await operation(conversation.id, person.id, { state: 'RUNNING' })
    await mailbox.operationEnded(op.id)
    expect(await cards(conversation.id)).toHaveLength(0)
  })

  it('wakes an archived conversation so the report runs @SC-974', async () => {
    const { schedule, mailbox } = setup()
    const { person, conversation } = await conversationWith('ARCHIVED')
    await mailbox.operationEnded((await operation(conversation.id, person.id)).id)
    expect(await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).toMatchObject({ status: 'ACTIVE', archivedAt: null })
    expect(schedule).toHaveBeenCalled()
  })

  it('in a closed conversation runs no turn, and tells its reader the result\'s own line, once', async () => {
    const { schedule, mailbox } = setup()
    const { person, conversation } = await conversationWith('CLOSED')
    const op = await operation(conversation.id, person.id)

    await mailbox.operationEnded(op.id)
    await mailbox.operationEnded(op.id)

    expect((await cards(conversation.id))[0]).toMatchObject({ awaitsTurn: false })
    expect(schedule).not.toHaveBeenCalled()
    const notes = await prisma.notification.findMany({ where: { userId: person.id } })
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({
      type: 'conversation_result', body: 'Review the README · Found 3 issues', conversationId: conversation.id, operationId: op.id,
      actionUrl: `/chat/t/${conversation.id}`,
    })
  })

  it('writes the card of work the person stopped, and nothing more', async () => {
    const { schedule, mailbox } = setup()
    const { person, conversation } = await conversationWith()
    await mailbox.operationEnded((await operation(conversation.id, person.id, { state: 'CANCELLED', noReport: true })).id)
    expect((await cards(conversation.id))[0]).toMatchObject({ kind: 'RESULT', awaitsTurn: false })
    expect(schedule).not.toHaveBeenCalled()
    expect(await prisma.notification.count({ where: { userId: person.id } })).toBe(0)
  })
})

describe('approvalRequested @SC-964', () => {
  it('writes one APPROVAL_REQUEST card for each run that asks, which wakes no turn and tells its reader once', async () => {
    const { schedule, mailbox } = setup()
    const { person, conversation } = await conversationWith()
    const op = await operation(conversation.id, person.id, { state: 'WAITING_FOR_APPROVAL', resultSummary: null })
    const request = { runId: 'run-1', reason: 'to measure the resize step', what: 'Run the benchmark' }

    await mailbox.approvalRequested(op.id, request)
    await mailbox.approvalRequested(op.id, request)
    await mailbox.approvalRequested(op.id, { ...request, runId: 'run-2' })

    const written = await cards(conversation.id)
    expect(written).toHaveLength(2)
    expect(written.every(c => c.kind === 'APPROVAL_REQUEST' && !c.awaitsTurn && c.turnId === null)).toBe(true)
    const [latest] = await readMessages(conversation.id, { limit: 1 })
    expect(latest!.body).toMatchObject({ title: 'Review the README', reason: 'to measure the resize step', what: 'Run the benchmark' })
    expect(schedule).not.toHaveBeenCalled()
    const told = await prisma.notification.findMany({ where: { userId: person.id }, orderBy: { createdAt: 'asc' } })
    expect(told).toHaveLength(2)
    expect(told[0]!.body).toMatch(/ asks to run the benchmark$/)
  })

  it('wakes an archived conversation, and tells no one in a closed one', async () => {
    const { schedule, mailbox } = setup()
    const archived = await conversationWith('ARCHIVED')
    const asking = await operation(archived.conversation.id, archived.person.id, { state: 'WAITING_FOR_APPROVAL', resultSummary: null })
    await mailbox.approvalRequested(asking.id, { runId: 'run-1', reason: 'to look', what: 'Run ls' })
    expect(await prisma.conversation.findUniqueOrThrow({ where: { id: archived.conversation.id } })).toMatchObject({ status: 'ACTIVE', archivedAt: null })

    const closed = await conversationWith('CLOSED')
    const there = await operation(closed.conversation.id, closed.person.id, { state: 'WAITING_FOR_APPROVAL', resultSummary: null })
    await mailbox.approvalRequested(there.id, { runId: 'run-1', reason: 'to look', what: 'Run ls' })
    expect(await prisma.notification.count({ where: { userId: closed.person.id } })).toBe(0)
    expect(schedule).not.toHaveBeenCalled()
  })

  it("writes the card's words plain: no markdown on the card", async () => {
    const { mailbox } = setup()
    const { person, conversation } = await conversationWith()
    const op = await operation(conversation.id, person.id, { state: 'WAITING_FOR_APPROVAL', resultSummary: null })
    await mailbox.approvalRequested(op.id, { runId: 'run-1', reason: '**Part 1**\n- I need `ls` to look', what: 'Run the command `npm test`' })
    const [latest] = await readMessages(conversation.id, { limit: 1 })
    expect(latest!.body).toMatchObject({ reason: 'Part 1 I need ls to look', what: 'Run the command npm test' })
  })
})

describe('the count of live work @SC-972', () => {
  it('leaves out a task set for a time: it completed in the turn that set it (walkthrough finding 33)', async () => {
    const { person, conversation } = await conversationWith()
    await operation(conversation.id, person.id, { state: 'COMPLETED', resultSummary: null })
    await operation(conversation.id, person.id, { state: 'RUNNING', resultSummary: null })
    await operation(conversation.id, person.id, { state: 'WAITING_FOR_APPROVAL', resultSummary: null })
    expect(await outstandingOperations(conversation.id)).toBe(2)
  })
})
