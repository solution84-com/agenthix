/**
 * Recovery after a restart (conversation layer spec, Failure, recovery and observability), against the real
 * test database: a turn whose lease ran out is failed with "HQ restarted" and its lock released; at start, a
 * running turn holding no lock is failed and a tool call left running is marked uncertain and reconciled; waiting messages are
 * scheduled again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createConversation, createUserWithRole } from '../../../test/factories'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../scheduler', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scheduler')>()),
  scheduleConversation: vi.fn(),
}))

import { appendMessage, readMessages } from '../../store/messages'
import { HQ_RESTARTED } from '../claim'
import { recoverConversations } from '../recovery'
import { scheduleConversation } from '../scheduler'
import { sealText } from '../../sealing'
import { WRITE_UNKNOWN } from '../../work/reconcile/calls'

async function conversationOf() {
  const person = await createUserWithRole('MEMBER')
  const conversation = await createConversation({ openedById: person.id })
  return { person, conversation }
}

async function holding(conversationId: string, leaseUntil: Date) {
  const turn = await prisma.inferenceTurn.create({ data: { conversationId, trigger: 'MESSAGE', state: 'RUNNING' } })
  await prisma.conversation.update({ where: { id: conversationId }, data: { activeTurnId: turn.id, activeTurnLeaseUntil: leaseUntil } })
  return turn
}

beforeEach(() => vi.mocked(scheduleConversation).mockClear())

describe('recovering conversations @SC-949', () => {
  it('fails a turn whose lease ran out, says so in the thread, and releases its lock', async () => {
    const { conversation } = await conversationOf()
    const turn = await holding(conversation.id, new Date(Date.now() - 1_000))

    const recovered = await recoverConversations({ atStart: false })

    expect(recovered.turnsFailed).toBe(1)
    expect(await prisma.inferenceTurn.findUniqueOrThrow({ where: { id: turn.id } })).toMatchObject({ state: 'FAILED', error: HQ_RESTARTED })
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).activeTurnId).toBeNull()
    const [failed] = await readMessages(conversation.id, { limit: 1 })
    expect(failed).toMatchObject({ kind: 'FAILED', body: { reason: HQ_RESTARTED }, turnId: turn.id })
  })

  it('leaves a turn whose lease is still held', async () => {
    const { conversation } = await conversationOf()
    const turn = await holding(conversation.id, new Date(Date.now() + 30_000))
    await recoverConversations({ atStart: false })
    expect((await prisma.inferenceTurn.findUniqueOrThrow({ where: { id: turn.id } })).state).toBe('RUNNING')
  })

  it('at start fails a running turn that holds no lock, and marks a tool call left running uncertain, then reconciles it', async () => {
    const { person, conversation } = await conversationOf()
    const orphan = await prisma.inferenceTurn.create({ data: { conversationId: conversation.id, trigger: 'MESSAGE', state: 'RUNNING' } })
    const call = await prisma.operation.create({
      data: { conversationId: conversation.id, kind: 'TOOL', mode: 'FOREGROUND', toolName: 'create_task', idempotencyKey: 'k', state: 'RUNNING', title: sealText('Create task'), authorisedById: person.id },
    })
    const done = await prisma.operation.create({
      data: { conversationId: conversation.id, kind: 'TOOL', mode: 'FOREGROUND', toolName: 'create_task', idempotencyKey: 'k2', state: 'COMPLETED', title: sealText('Create task'), authorisedById: person.id },
    })

    const recovered = await recoverConversations({ atStart: true })

    expect(recovered).toMatchObject({ turnsFailed: 1, toolCallsUncertain: 1, callsReconciled: 1 })
    expect((await prisma.inferenceTurn.findUniqueOrThrow({ where: { id: orphan.id } })).state).toBe('FAILED')
    // A write cut by the restart is never run again: it is reported as unknown whether it happened.
    expect(await prisma.operation.findUniqueOrThrow({ where: { id: call.id } })).toMatchObject({ state: 'FAILED', error: WRITE_UNKNOWN })
    expect((await prisma.operation.findUniqueOrThrow({ where: { id: done.id } })).state).toBe('COMPLETED')
  })

  it('schedules again every open conversation with messages still waiting, and no closed one', async () => {
    const { person, conversation } = await conversationOf()
    await appendMessage({ conversationId: conversation.id, role: 'PERSON', kind: 'TEXT', body: { text: 'still here' }, authorId: person.id, queueState: 'WAITING' })
    const { person: other, conversation: closed } = await conversationOf()
    await appendMessage({ conversationId: closed.id, role: 'PERSON', kind: 'TEXT', body: { text: 'too late' }, authorId: other.id })
    await prisma.conversation.update({ where: { id: closed.id }, data: { status: 'CLOSED', closedReason: 'LEFT_PROJECT' } })

    await recoverConversations({ atStart: true })

    expect(scheduleConversation).toHaveBeenCalledWith(conversation.id)
    expect(scheduleConversation).not.toHaveBeenCalledWith(closed.id)
  })
})
