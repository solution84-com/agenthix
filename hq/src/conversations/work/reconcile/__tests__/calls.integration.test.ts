/**
 * The lead's own calls cut by an hq restart, reconciled, against the real test database (conversation layer spec,
 * What "the call carries on" relies on): a read is run again — as the person who asked, as their authority stands
 * now — and its result delivered once, as one card awaiting a report turn; a write is never run again and its card
 * says it is unknown whether it happened; a read with nothing to run again from says it is safe to ask again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../../test/db'
import { createAgent, createConversation, createUserWithRole } from '../../../../test/factories'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../coordinator/scheduler', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../coordinator/scheduler')>()),
  scheduleConversation: vi.fn(),
}))

import { sealJson, sealText, openJson } from '../../../sealing'
import { readMessages } from '../../../store/messages'
import { recoverConversations } from '../../../coordinator/recovery'
import { settleOperation } from '../../../coordinator/mailbox'
import { scheduleConversation } from '../../../coordinator/scheduler'
import { reconcileUncertainCalls, READ_CUT_SHORT, WRITE_UNKNOWN, type CallReconcileDeps } from '../calls'

async function conversationOf(agentData: Record<string, unknown> = {}) {
  const person = await createUserWithRole('MEMBER')
  const agent = await createAgent(agentData)
  const conversation = await createConversation({ openedById: person.id, agentId: agent.id })
  return { person, conversation }
}

let n = 0
async function callLeft(conversationId: string, personId: string, toolName: string, args: unknown, state: 'RUNNING' | 'UNCERTAIN' = 'UNCERTAIN') {
  return prisma.operation.create({
    data: {
      conversationId, kind: 'TOOL', mode: 'FOREGROUND', toolName, idempotencyKey: `k${++n}`, state, title: sealText('List'),
      authorisedById: personId, ...(args !== undefined ? { args: sealJson(args) } : {}),
    },
  })
}
const reload = (id: string) => prisma.operation.findUniqueOrThrow({ where: { id } })

function stubbed(rerun: CallReconcileDeps['rerun']): CallReconcileDeps {
  return { rerun, settle: settleOperation, logError: vi.fn() }
}

beforeEach(() => vi.mocked(scheduleConversation).mockClear())

describe('an uncertain read @SC-966', () => {
  it('is run again once with the arguments it was called with, and its result delivered once', async () => {
    const { person, conversation } = await conversationOf()
    const call = await callLeft(conversation.id, person.id, 'list_tasks', { projectId: 'p1' })
    const rerun = vi.fn(async () => [{ key: 'SHOP-1' }])

    await Promise.all([reconcileUncertainCalls(stubbed(rerun)), reconcileUncertainCalls(stubbed(rerun))])

    expect(rerun).toHaveBeenCalledTimes(1)
    expect(rerun).toHaveBeenCalledWith(expect.objectContaining({ id: call.id, authorisedById: person.id }), { projectId: 'p1' })
    const row = await reload(call.id)
    expect(row).toMatchObject({ state: 'COMPLETED', promoted: true })
    expect(openJson(row.resultSummary!)).toEqual({ summary: JSON.stringify([{ key: 'SHOP-1' }]) })
    const cards = (await readMessages(conversation.id, { limit: 10 })).filter(m => m.kind === 'RESULT')
    expect(cards).toHaveLength(1)
    expect(scheduleConversation).toHaveBeenCalledWith(conversation.id)
  })

  it("fails with the refusal's own words when the person may no longer make it", async () => {
    const { person, conversation } = await conversationOf()
    const call = await callLeft(conversation.id, person.id, 'list_tasks', {})
    const { ControlPlaneError } = await import('../../../../server/controlplane/types')
    await reconcileUncertainCalls(stubbed(async () => { throw new ControlPlaneError('forbidden', 'list_tasks is not available for this agent') }))
    expect(await reload(call.id)).toMatchObject({ state: 'FAILED', error: 'list_tasks is not available for this agent' })
  })

  it('says it is safe to ask again when it holds nothing to run again from', async () => {
    const { person, conversation } = await conversationOf()
    const call = await callLeft(conversation.id, person.id, 'list_tasks', undefined)
    const rerun = vi.fn()
    await reconcileUncertainCalls(stubbed(rerun))
    expect(rerun).not.toHaveBeenCalled()
    expect(await reload(call.id)).toMatchObject({ state: 'FAILED', error: READ_CUT_SHORT })
  })

  it('is run again for real as the person who asked, through recovery at start', async () => {
    const { person, conversation } = await conversationOf({ approval: 'bypassed' })
    const call = await callLeft(conversation.id, person.id, 'list_projects', {}, 'RUNNING')

    const recovered = await recoverConversations({ atStart: true })

    expect(recovered).toMatchObject({ toolCallsUncertain: 1, callsReconciled: 1 })
    expect((await reload(call.id)).state).toBe('COMPLETED')
  })
})

describe('an uncertain write @SC-966', () => {
  it('is never run again: its card says it is unknown whether it happened, once', async () => {
    const { person, conversation } = await conversationOf()
    const call = await callLeft(conversation.id, person.id, 'create_task', { title: 'Fix it' })
    const rerun = vi.fn()

    await reconcileUncertainCalls(stubbed(rerun))
    await reconcileUncertainCalls(stubbed(rerun))

    expect(rerun).not.toHaveBeenCalled()
    expect(await reload(call.id)).toMatchObject({ state: 'FAILED', error: WRITE_UNKNOWN })
    const cards = (await readMessages(conversation.id, { limit: 10 })).filter(m => m.kind === 'RESULT')
    expect(cards).toHaveLength(1)
    expect(cards[0].body).toMatchObject({ outcome: 'failed', summary: WRITE_UNKNOWN })
  })
})
