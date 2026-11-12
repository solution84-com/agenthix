/**
 * Memory in a conversation against the real test database, with the deterministic fake embedder: a report turn's
 * probe reads the memory of the person the operation was for, and no one else's (ADR-0188: there is no place's
 * memory); what the probe included is recorded; the lead's used_memory records use; the bars are tuned from the
 * outcomes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createConversation, createProject, createUser } from '../../../test/factories'
import { sealText } from '../../sealing'
import { turnCapability } from '../../../server/controlplane/__tests__/turnFixtures'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import type { MemoryPrincipal } from '../../../memory/contract'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../memory/embedding/embedders', () => import('../../../test/fakes/embedders'))

import { createMemoryService } from '../../../memory/memoryService'
import { createFakeEmbedder } from '../../../test/fakes/embedders'
import { tuneOrgBars, MIN_SAMPLES } from '../../../memory/barTuner'
import { memoryForTurn } from '../turnMemory'
import { memoryTools } from '..'

const service = createMemoryService({ embedderFor: () => createFakeEmbedder() })

let alice: string
let bob: string
let agent: string
let shop: string
let conversationId: string

const saved = (principal: MemoryPrincipal, title: string, body: string) => service.remember(principal, { title, body, kind: 'FACT' })

function card(id: string, operationId: string): ConversationMessageView {
  return {
    id, seq: 5, clientMessageId: null, role: 'PLATFORM', authorId: null, agentId: null, kind: 'RESULT',
    body: { title: 'Review the README', summary: 'Found three issues in the install section', outcome: 'completed' },
    spoken: false, interrupted: false, operationId, turnId: null, queueState: null, createdAt: '',
  } as ConversationMessageView
}

beforeEach(async () => {
  alice = (await createUser()).id
  bob = (await createUser()).id
  agent = (await createAgent()).id
  shop = (await createProject({ name: 'Shop' })).id
  conversationId = (await createConversation({ openedById: alice, agentId: agent, home: 'PROJECT', projectId: shop })).id
  const place = { type: 'project' as const, id: shop }
  await saved({ personId: alice, agentId: agent, place }, 'Review the README', 'Alice found three issues in the install section')
  await saved({ personId: bob, agentId: agent, place }, 'Review the README for Bob', 'Bob found three issues in the install section')
})

async function operationFor(personId: string) {
  return prisma.operation.create({
    data: {
      conversationId, kind: 'WORKER', mode: 'BACKGROUND', toolName: 'start_work', idempotencyKey: `k-${Math.random()}`,
      state: 'COMPLETED', title: sealText('Review the README'), authorisedById: personId,
    } as never,
  })
}

const conversation = () => ({ id: conversationId, home: 'PROJECT' as const, projectId: shop, taskId: null, openedById: alice, agentId: agent })

describe('a report turn\'s probe @SC-989', () => {
  it('reads the memory of the person the operation was for, and no one else\'s', async () => {
    const op = await operationFor(alice)
    const block = await memoryForTurn({
      conversation: conversation(), agentId: agent,
      turn: { turnId: 'turn-r', trigger: 'REPORT', actingUserId: null, inputIds: ['card'] },
      history: [card('card', op.id)],
    })
    expect(block).toMatch(/Alice found three issues/)
    expect(block).not.toMatch(/Bob found/)
    const included = await prisma.memoryOutcome.findMany({ where: { turnId: 'turn-r' } })
    expect(included.map(o => o.kind)).toEqual(['INCLUDED'])
    expect(included[0]!.similarity).toBeGreaterThan(0.62)
  })

  it('reads no memory when the work was several people\'s', async () => {
    const [a, b] = [await operationFor(alice), await operationFor(bob)]
    const block = await memoryForTurn({
      conversation: conversation(), agentId: agent,
      turn: { turnId: 'turn-r2', trigger: 'REPORT', actingUserId: null, inputIds: ['c1', 'c2'] },
      history: [card('c1', a.id), card('c2', b.id)],
    })
    expect(block).toBeNull()
  })
})

describe('used_memory @SC-989', () => {
  it('records the items the reply relied on as used and counts the use on the item', async () => {
    const turnId = 'turn-u'
    await memoryForTurn({
      conversation: conversation(), agentId: agent,
      turn: { turnId, trigger: 'MESSAGE', actingUserId: alice, inputIds: ['m'] },
      history: [{ ...card('m', 'x'), role: 'PERSON', kind: 'TEXT', body: { text: 'Review the README: found three issues in the install section?' }, operationId: null } as ConversationMessageView],
    })
    const used = memoryTools.find(t => t.name === 'used_memory')!
    const capability = turnCapability({ conversationId, turnId, agentId: agent, home: 'PROJECT', projectId: shop, actingUserId: alice })
    expect((await used.run(capability, { keys: ['review-the-readme'] }, { signal: new AbortController().signal })).status).toBe('done')
    const outcomes = await prisma.memoryOutcome.findMany({ where: { turnId }, orderBy: { createdAt: 'asc' } })
    expect(outcomes.map(o => o.kind).sort()).toEqual(['INCLUDED', 'USED'])
    expect((await prisma.memoryItem.findFirstOrThrow({ where: { key: 'review-the-readme', userId: alice } })).usedCount).toBe(1)
  })
})

describe('tuneOrgBars @SC-989', () => {
  it('raises the certain bar when what was included was seldom used, and keeps the result on the organisation', async () => {
    const org = await prisma.org.create({ data: { name: 'Org' } })
    const item = await prisma.memoryItem.findFirstOrThrow({ where: { key: 'review-the-readme', userId: alice } })
    await prisma.memoryOutcome.createMany({
      data: Array.from({ length: MIN_SAMPLES }, (_, i) => ({ itemId: item.id, kind: 'INCLUDED' as const, similarity: 0.7, turnId: `t${i}` })),
    })
    expect(await tuneOrgBars()).toEqual({ changed: true, bars: { certain: 0.64, probable: 0.45 } })
    expect(await prisma.org.findUniqueOrThrow({ where: { id: org.id }, select: { memoryCertainBar: true, memoryProbableBar: true } }))
      .toEqual({ memoryCertainBar: 0.64, memoryProbableBar: 0.45 })
  })
})
