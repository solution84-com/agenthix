/**
 * Compaction in segments against the real test database (long conversations spec): due only past the high mark,
 * measured by the last turn that ended after the latest compaction; one segment written from the verbatim window
 * with the ledger head, and a SUMMARISED message; a segment never rewritten; the ledger surviving; the turn's own
 * input never folded; *Summarise now*; a segment opened as the screen opens it.
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

import type { LeadRequest, ModelAdapter, ResolvedAccess } from '../../contract'
import { appendMessage, readMessages } from '../../store/messages'
import { createCompactor } from '../compactor'
import { createLedger } from '../ledger'
import { COULD_NOT_SUMMARISE, getConversationSegment, summariseNow } from '../segmentOperations'
import { openText } from '../../sealing'

const access: ResolvedAccess = { provider: 'anthropic', model: 'tiny-test-model', apiKey: 'k', owner: 'user', kind: 'API_KEY' }
const WINDOW = 1_000

function summariser(answers: string[] = []) {
  const requests: Omit<LeadRequest, 'tools'>[] = []
  const model: ModelAdapter = {
    stream: () => { throw new Error('not used') },
    async complete(request) {
      requests.push(request)
      const text = answers.shift() ?? JSON.stringify({ brief: `Brief ${requests.length}`, summary: `Summary ${requests.length}` })
      return { text, usage: { inputTokens: 5, outputTokens: 5, cacheReadTokens: 50, cacheWriteTokens: 0 } }
    },
  }
  return { model, requests }
}

function setup(answers?: string[]) {
  const { model, requests } = summariser(answers)
  const ledger = createLedger()
  const events = { message: vi.fn() }
  const compactor = createCompactor({ model, ledger, events, contextWindowOf: () => WINDOW })
  return { compactor, ledger, events, requests }
}

/** `pairs` exchanges, each a person's message and a reply of about `tokens` tokens. */
async function conversationWith(pairs: number, tokens = 50) {
  const person = await createUserWithRole('MEMBER')
  const conversation = await createConversation({ openedById: person.id, talkingModel: access.model, talkingProvider: 'anthropic', accessOwnerType: 'user' })
  for (let i = 0; i < pairs; i++) {
    await appendMessage({ conversationId: conversation.id, role: 'PERSON', kind: 'TEXT', body: { text: `Question ${i} ${'q'.repeat(tokens * 4)}` }, authorId: person.id, turnId: `t${i}` })
    await appendMessage({ conversationId: conversation.id, role: 'AGENT', kind: 'TEXT', body: { text: `Answer ${i} ${'a'.repeat(tokens * 4)}` }, turnId: `t${i}` })
  }
  return { person, conversation }
}

async function endedTurn(conversationId: string, contextTokens: number, endedAt = new Date()) {
  return prisma.inferenceTurn.create({ data: { conversationId, trigger: 'MESSAGE', state: 'COMPLETED', contextTokens, endedAt } })
}

describe('due @SC-979', () => {
  it('is due only once the last turn sent more than the high mark, and not before any turn', async () => {
    const { compactor } = setup()
    const { conversation } = await conversationWith(1)
    expect(await compactor.due(conversation.id, access.model)).toBe(false)
    await endedTurn(conversation.id, 600)
    expect(await compactor.due(conversation.id, access.model)).toBe(false)
    await endedTurn(conversation.id, 750)
    expect(await compactor.due(conversation.id, access.model)).toBe(true)
  })

  it('is not due again on the figure of a turn that ended before the latest compaction', async () => {
    const { compactor } = setup()
    const { conversation } = await conversationWith(20)
    await endedTurn(conversation.id, 900, new Date(Date.now() - 60_000))
    expect(await compactor.compact(conversation.id, access, 'marks')).not.toBeNull()
    expect(await compactor.due(conversation.id, access.model)).toBe(false)
  })
})

describe('compact @SC-979', () => {
  it('folds the window older than the low mark into one segment and writes the SUMMARISED message', async () => {
    const { compactor, events, requests } = setup()
    const { conversation } = await conversationWith(20)
    const done = (await compactor.compact(conversation.id, access, 'marks'))!

    const segment = await prisma.conversationSegment.findUniqueOrThrow({ where: { id: done.segmentId } })
    expect(segment.firstSeq).toBe(1)
    // About 300 tokens (the low mark of 1,000) stay verbatim: the last three exchanges or so.
    expect(segment.lastSeq).toBeGreaterThan(30)
    expect(segment.lastSeq).toBeLessThan(40)
    expect(segment.lastSeq % 2).toBe(0)
    expect(openText(segment.brief)).toBe('Brief 1')
    expect(requests).toHaveLength(1)
    expect(requests[0]!.messages.at(-1)!.role).toBe('user')
    expect(requests[0]!.cacheKey).toBe(conversation.id)

    const [marker] = await readMessages(conversation.id, { limit: 1 })
    expect(marker).toMatchObject({ role: 'PLATFORM', kind: 'SUMMARISED', body: { brief: 'Brief 1', summary: 'Summary 1', segmentId: done.segmentId, firstSeq: 1, lastSeq: segment.lastSeq } })
    expect(events.message).toHaveBeenCalledWith(conversation.id, expect.objectContaining({ kind: 'SUMMARISED' }))
  })

  it('never rewrites a segment: the next compaction starts after it and writes a new one', async () => {
    const { compactor } = setup()
    const { conversation } = await conversationWith(20)
    const first = (await compactor.compact(conversation.id, access, 'marks'))!
    const before = await prisma.conversationSegment.findUniqueOrThrow({ where: { id: first.segmentId } })
    for (let i = 0; i < 20; i++) {
      await appendMessage({ conversationId: conversation.id, role: i % 2 ? 'AGENT' : 'PERSON', kind: 'TEXT', body: { text: 'x'.repeat(200) }, turnId: `u${i}` })
    }
    const second = (await compactor.compact(conversation.id, access, 'marks'))!
    const after = await prisma.conversationSegment.findUniqueOrThrow({ where: { id: first.segmentId } })
    expect(after).toEqual(before)
    const next = await prisma.conversationSegment.findUniqueOrThrow({ where: { id: second.segmentId } })
    expect(next.firstSeq).toBeGreaterThan(before.lastSeq)
  })

  it('never folds the turn\'s own input, nor a message still waiting', async () => {
    const { person, conversation } = await conversationWith(20)
    const { message: input } = await appendMessage({ conversationId: conversation.id, role: 'PERSON', kind: 'TEXT', body: { text: 'now' }, authorId: person.id, turnId: 'now' })
    // A tiny window: everything would fold by size alone.
    const tiny = createCompactor({ model: summariser().model, ledger: createLedger(), events: { message: vi.fn() }, contextWindowOf: () => 10 })
    const done = (await tiny.compact(conversation.id, access, 'marks', { inputIds: [input.id] }))!
    const segment = await prisma.conversationSegment.findUniqueOrThrow({ where: { id: done.segmentId } })
    expect(segment.lastSeq).toBeLessThan(input.seq)
  })

  it('keeps the ledger through a compaction: its head in the segment and the block, what it kept on the marker', async () => {
    const { compactor, ledger } = setup()
    const { conversation } = await conversationWith(20)
    await ledger.record(conversation.id, { kind: 'decision', text: 'Ship on Friday', sourceSeq: 3 })
    await ledger.record(conversation.id, { kind: 'open-operation', text: 'Review the README', operationId: 'op-1', sourceSeq: 5 })
    const done = (await compactor.compact(conversation.id, access, 'marks'))!

    const segment = await prisma.conversationSegment.findUniqueOrThrow({ where: { id: done.segmentId } })
    expect((segment.ledgerHead as { text: string }[]).map(e => openText(e.text))).toEqual(['Ship on Friday', 'Review the README'])
    expect(done.message.kind === 'SUMMARISED' && done.message.body.ledgerKept).toEqual(['Ship on Friday', 'Review the README'])
    expect((await ledger.entries(conversation.id)).map(e => e.text)).toEqual(['Ship on Friday', 'Review the README'])
  })

  it('writes nothing when the summariser\'s answer does not parse', async () => {
    const { compactor } = setup(['no json here'])
    const { conversation } = await conversationWith(20)
    await expect(compactor.compact(conversation.id, access, 'marks')).rejects.toThrow()
    expect(await prisma.conversationSegment.count({ where: { conversationId: conversation.id } })).toBe(0)
  })
})

describe('Summarise now @SC-983', () => {
  const deps = (compactor: ReturnType<typeof setup>['compactor']) => ({
    compactor,
    resolveAccess: vi.fn(async () => ({ access, problem: null, offer: null })),
    schedule: vi.fn(),
    events: { summarise: vi.fn() },
  })

  it('compacts at once, holding the lock while it does, then lets waiting messages be answered', async () => {
    const { compactor } = setup()
    const { person, conversation } = await conversationWith(4)
    const d = deps(compactor)
    const { finished } = await summariseNow(conversation.id, person.id, d)
    await finished
    expect(await prisma.conversationSegment.count({ where: { conversationId: conversation.id } })).toBe(1)
    const row = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })
    expect(row.activeTurnId).toBeNull()
    expect(d.schedule).toHaveBeenCalledWith(conversation.id)
    expect(d.events.summarise.mock.calls.map(([e]) => e.state)).toEqual(['started', 'ended'])
  })

  it('returns before the summariser answers, still holding the lock (walkthrough finding 36)', async () => {
    let answer!: () => void
    const held = new Promise<void>(resolve => { answer = resolve })
    const { model } = summariser()
    const slow: ModelAdapter = { ...model, async complete(request) { await held; return model.complete(request) } }
    const compactor = createCompactor({ model: slow, ledger: createLedger(), events: { message: vi.fn() }, contextWindowOf: () => WINDOW })
    const { person, conversation } = await conversationWith(4)
    const d = deps(compactor)

    const { finished } = await summariseNow(conversation.id, person.id, d)
    expect(await prisma.conversationSegment.count({ where: { conversationId: conversation.id } })).toBe(0)
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).activeTurnId).not.toBeNull()
    expect(d.schedule).not.toHaveBeenCalled()

    answer()
    await finished
    expect(await prisma.conversationSegment.count({ where: { conversationId: conversation.id } })).toBe(1)
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).activeTurnId).toBeNull()
  })

  it('tells the screens why when the summariser fails after it started, and lets the lock go', async () => {
    const { model } = summariser()
    const failing: ModelAdapter = { ...model, async complete() { throw new Error('provider down') } }
    const compactor = createCompactor({ model: failing, ledger: createLedger(), events: { message: vi.fn() }, contextWindowOf: () => WINDOW })
    const { person, conversation } = await conversationWith(4)
    const d = deps(compactor)

    const { finished } = await summariseNow(conversation.id, person.id, d)
    await finished
    expect(d.events.summarise).toHaveBeenLastCalledWith({ conversationId: conversation.id, state: 'failed', reason: COULD_NOT_SUMMARISE })
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).activeTurnId).toBeNull()
    expect(d.schedule).toHaveBeenCalledWith(conversation.id)
  })

  it('refuses while a reply is being written, and when there is nothing to fold', async () => {
    const { compactor } = setup()
    const { person, conversation } = await conversationWith(4)
    await prisma.conversation.update({ where: { id: conversation.id }, data: { activeTurnId: 'running', activeTurnLeaseUntil: new Date(Date.now() + 30_000) } })
    await expect(summariseNow(conversation.id, person.id, deps(compactor))).rejects.toMatchObject({ statusCode: 409 })

    const empty = await conversationWith(0)
    await expect(summariseNow(empty.conversation.id, empty.person.id, deps(compactor))).rejects.toMatchObject({ statusCode: 409 })
  })

  it('is refused to someone who may not speak there', async () => {
    const { compactor } = setup()
    const { conversation } = await conversationWith(4)
    const stranger = await createUserWithRole('MEMBER')
    await expect(summariseNow(conversation.id, stranger.id, deps(compactor))).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('getConversationSegment @SC-982', () => {
  it('opens a segment for its reader, and for no one else', async () => {
    const { compactor } = setup()
    const { person, conversation } = await conversationWith(20)
    const done = (await compactor.compact(conversation.id, access, 'marks'))!
    const view = await getConversationSegment({ conversationId: conversation.id, segmentId: done.segmentId }, { user: { id: person.id } })
    expect(view).toMatchObject({ id: done.segmentId, firstSeq: 1, brief: 'Brief 1', summary: 'Summary 1' })
    expect(view).not.toHaveProperty('ledgerHead')

    const stranger = await createUserWithRole('MEMBER')
    await expect(getConversationSegment({ conversationId: conversation.id, segmentId: done.segmentId }, { user: { id: stranger.id } })).rejects.toMatchObject({ statusCode: 404 })
    await expect(getConversationSegment({ conversationId: conversation.id, segmentId: 'nope' }, { user: { id: person.id } })).rejects.toMatchObject({ statusCode: 404 })
  })
})
