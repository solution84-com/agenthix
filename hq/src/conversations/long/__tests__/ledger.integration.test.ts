/** The ledger's store against the real test database (long conversations spec, The ledger). */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createConversation } from '../../../test/factories'

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { createLedger } from '../ledger'
import { createMailbox } from '../../coordinator/mailbox'
import { notifyCard } from '../../coordinator/notify'
import { sealJson, sealText } from '../../sealing'

describe('the ledger @SC-981', () => {
  it('keeps an event once however often it is told, its text sealed at rest', async () => {
    const ledger = createLedger()
    const conversation = await createConversation()
    await ledger.record(conversation.id, { kind: 'open-operation', text: 'Review the README', operationId: 'op-1', sourceSeq: 4 })
    await ledger.record(conversation.id, { kind: 'open-operation', text: 'Review the README', operationId: 'op-1', sourceSeq: 4 })
    await ledger.record(conversation.id, { kind: 'approval', text: 'Approved: deploy', operationId: 'op-2', sourceSeq: 9 })
    expect((await ledger.entries(conversation.id)).map(e => [e.id, e.kind, e.text])).toEqual([
      ['L1', 'open-operation', 'Review the README'],
      ['L2', 'approval', 'Approved: deploy'],
    ])
    const row = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })
    expect(JSON.stringify(row.ledger)).not.toContain('Review the README')
  })

  it('trims an ended operation to its one line, and marks the lead\'s own entry done', async () => {
    const ledger = createLedger()
    const conversation = await createConversation()
    await ledger.record(conversation.id, { kind: 'open-operation', text: 'Review the README', operationId: 'op-1' })
    const id = (await ledger.add(conversation.id, { kind: 'obligation', text: 'Create the task once the fix lands' }))!
    await ledger.closeOperation(conversation.id, 'op-1', 'Review the README · Found 3 issues')
    expect(await ledger.markDone(conversation.id, id)).toBe(true)
    expect(await ledger.markDone(conversation.id, 'L99')).toBe(false)
    const entries = await ledger.entries(conversation.id)
    expect(entries.map(e => [e.text, e.closed])).toEqual([
      ['Review the README · Found 3 issues', true],
      ['Create the task once the fix lands', true],
    ])
  })

  it('keeps every entry when events arrive together', async () => {
    const ledger = createLedger()
    const conversation = await createConversation()
    await Promise.all(Array.from({ length: 8 }, (_, i) => ledger.record(conversation.id, { kind: 'open-operation', text: `Work ${i}`, operationId: `op-${i}` })))
    expect(await ledger.entries(conversation.id)).toHaveLength(8)
  })
})

describe('the ledger kept from the mailbox @SC-981', () => {
  it('closes an operation\'s entry to its result line when the operation ends', async () => {
    const ledger = createLedger()
    const conversation = await createConversation()
    const op = await prisma.operation.create({
      data: {
        conversationId: conversation.id, kind: 'WORKER', mode: 'BACKGROUND', toolName: 'start_work', idempotencyKey: 'k-1',
        state: 'COMPLETED', title: sealText('Review the README'), authorisedById: conversation.openedById,
        resultSummary: sealJson({ summary: 'Found 3 issues', stated: true }),
      } as never,
    })
    await ledger.record(conversation.id, { kind: 'open-operation', text: 'Review the README', operationId: op.id })
    const events = { message: vi.fn(), messageUpdated: vi.fn(), delta: vi.fn(), turn: vi.fn(), operation: vi.fn(), operationLines: vi.fn() }
    const mailbox = createMailbox({ schedule: vi.fn(), notify: notifyCard, events, ledger })
    await mailbox.operationEnded(op.id)
    const [entry] = await ledger.entries(conversation.id)
    expect(entry).toMatchObject({ closed: true, text: 'Review the README · Found 3 issues' })
  })
})
