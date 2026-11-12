/**
 * The memory store against the real test database, with the deterministic fake embedder (no model is loaded):
 * the scope an agent saves into and the check before the meaning search (ADR-0188), keys, the standing-alone
 * refusal, the near-duplicate rule by kind, recall's filters, ranking, and the outcomes that warm an item.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser } from '../../test/factories'
import { createFakeEmbedder } from '../../test/fakes/embedders'
import { MEMORY_SCOPE_MAX_ITEMS } from '../../shared/memory/protocol'
import type { MemoryPrincipal, RememberInput } from '../contract'
import { scopeColumns } from '../scopes'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { createMemoryService } from '../memoryService'

const embedder = createFakeEmbedder()
let clock = new Date('2026-10-16T12:00:00Z')
const service = createMemoryService({ embedderFor: () => embedder, now: () => clock })

let alice: string
let bob: string
let scout: string
let bolt: string
let shop: string
let other: string
let atAlice: MemoryPrincipal

const coffee = { title: 'Coffee order', body: 'The person takes their coffee black with no sugar, every single morning before standup.' }
const release = { title: 'Release day', body: 'The team ships the weekly release on Thursday afternoons after the review meeting.' }

function input(over: Partial<RememberInput> & Pick<RememberInput, 'title' | 'body'>): RememberInput {
  return { kind: 'FACT', ...over }
}

beforeEach(async () => {
  clock = new Date('2026-10-16T12:00:00Z')
  alice = (await createUser()).id
  bob = (await createUser()).id
  scout = (await createAgent()).id
  bolt = (await createAgent()).id
  shop = (await createProject({ name: 'Shop' })).id
  other = (await createProject({ name: 'Other' })).id
  atAlice = { personId: alice, agentId: scout, place: { type: 'project', id: shop } }
})

/** A memory stored directly in a scope, as a promotion leaves it. */
async function stored(scope: { agent: string | null; place: { type: 'user' | 'project'; id: string } | null }, key: string, over: Record<string, unknown> = {}) {
  return prisma.memoryItem.create({
    data: { ...scopeColumns({ person: alice, ...scope }), key, title: key, body: `${key} is something about the person.`, kind: 'FACT', ...over },
  })
}

describe('the scope an agent saves into @SC-2101 @SC-2102', () => {
  it('is the person, the agent and the place of the work, with who saved it and where kept apart', async () => {
    await service.remember(atAlice, input(coffee))
    expect(await prisma.memoryItem.findFirstOrThrow()).toMatchObject({
      userId: alice, agentId: scout, placeType: 'project', placeId: shop,
      scopeKey: `person:${alice}/agent:${scout}/place:project:${shop}`,
      writtenByAgentId: scout, savedInPlaceType: 'project', savedInPlaceId: shop,
    })
  })

  it('refuses work for no person: there is no memory without a person', async () => {
    const pulse: MemoryPrincipal = { personId: null, agentId: scout, place: { type: 'project', id: shop } }
    expect(await service.remember(pulse, input(release))).toMatchObject({ status: 'refused', reason: expect.stringMatching(/not for any person/) })
    expect(await prisma.memoryItem.count()).toBe(0)
    await stored({ agent: null, place: null }, 'everywhere')
    expect(await service.recallByKey(pulse, ['everywhere'])).toEqual([])
    await expect(service.forget(pulse, 'everywhere')).rejects.toThrow(/not for any person/)
  })
})

describe('the check before the meaning search @SC-2101', () => {
  it("reaches only the person's own memories", async () => {
    await service.remember(atAlice, input(coffee))
    const atBob = { ...atAlice, personId: bob }
    expect(await service.recallByKey(atBob, ['coffee-order'])).toEqual([])
    expect((await service.recallByQuery(atBob, 'how does the person take their coffee')).items).toEqual([])
    expect((await service.recallByKey(atAlice, ['coffee-order'])).map(i => i.title)).toEqual(['Coffee order'])
  })

  it('reaches what holds for every agent or everywhere, and an agent or place it names only there', async () => {
    await stored({ agent: null, place: null }, 'everyone-everywhere')
    await stored({ agent: scout, place: null }, 'scout-anywhere')
    await stored({ agent: null, place: { type: 'project', id: shop } }, 'anyone-in-shop')
    await stored({ agent: bolt, place: null }, 'bolt-anywhere')
    await stored({ agent: null, place: { type: 'project', id: other } }, 'anyone-in-other')
    const keys = ['everyone-everywhere', 'scout-anywhere', 'anyone-in-shop', 'bolt-anywhere', 'anyone-in-other']
    expect((await service.recallByKey(atAlice, keys)).map(i => i.key)).toEqual(['everyone-everywhere', 'scout-anywhere', 'anyone-in-shop'])
    expect((await service.recallByKey({ ...atAlice, agentId: bolt, place: null }, keys)).map(i => i.key)).toEqual(['everyone-everywhere', 'bolt-anywhere'])
  })

  it("an agent's own memory stays with it and its place until the person promotes it", async () => {
    await service.remember(atAlice, input(coffee))
    expect(await service.recallByKey({ ...atAlice, agentId: bolt }, ['coffee-order'])).toEqual([])
    expect(await service.recallByKey({ ...atAlice, place: { type: 'user', id: alice } }, ['coffee-order'])).toEqual([])
  })

  it('forgets the narrowest memory with the key that the work could recall, and nothing of another person', async () => {
    await stored({ agent: null, place: null }, 'tea')
    const own = await stored({ agent: scout, place: { type: 'project', id: shop } }, 'tea')
    expect(await service.forget({ ...atAlice, personId: bob }, 'tea')).toBe(false)
    expect(await service.forget(atAlice, 'tea')).toBe(true)
    expect(await prisma.memoryItem.findUnique({ where: { id: own.id } })).toBeNull()
    expect(await prisma.memoryItem.count()).toBe(1)
  })
})

describe('remember @SC-2103 @SC-2104', () => {
  it('keys an item by its title, and writing to a key replaces it', async () => {
    const first = await service.remember(atAlice, input(coffee))
    expect(first).toMatchObject({ status: 'added', key: 'coffee-order' })
    const again = await service.remember(atAlice, input({ title: 'Coffee order', body: 'The person now drinks oat flat whites in the afternoon only.' }))
    expect(again).toMatchObject({ status: 'replaced', key: 'coffee-order', itemId: (first as { itemId: string }).itemId })
    const rows = await prisma.memoryItem.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ body: 'The person now drinks oat flat whites in the afternoon only.', embeddingModel: 'local', writtenByAgentId: scout })
    expect(rows[0].embedding).toHaveLength(384)
  })

  it('takes a key the writer names', async () => {
    expect(await service.remember(atAlice, input({ ...coffee, key: 'Morning Coffee' }))).toMatchObject({ key: 'morning-coffee' })
  })

  it("refuses an item that cannot stand alone, or that is a document, and keeps nothing", async () => {
    expect(await service.remember(atAlice, input({ title: 'That', body: 'Do that again.' }))).toMatchObject({ status: 'refused', reason: expect.stringMatching(/stand alone/) })
    expect(await service.remember(atAlice, input({ title: 'Notes', body: 'word '.repeat(400) }))).toMatchObject({ status: 'refused', reason: expect.stringMatching(/not a document/) })
    expect(await prisma.memoryItem.count()).toBe(0)
  })

  it('replaces a near-duplicate with a newer Rule: the old one is archived, and the new one names it', async () => {
    const old = await service.remember(atAlice, input({ ...coffee, kind: 'RULE' }))
    const next = await service.remember(atAlice, input({ title: 'Coffee order today', body: `${coffee.body.slice(0, -1)}, always.`, kind: 'RULE' }))
    expect(next).toMatchObject({ status: 'superseded', key: 'coffee-order-today' })
    const oldRow = await prisma.memoryItem.findUniqueOrThrow({ where: { id: (old as { itemId: string }).itemId } })
    const newRow = await prisma.memoryItem.findUniqueOrThrow({ where: { id: (next as { itemId: string }).itemId } })
    expect(oldRow.archived).toBe(true)
    expect(newRow.supersedesId).toBe(oldRow.id)
  })

  it('joins a near-duplicate Fact onto the one held, and embeds the joined memory again', async () => {
    const held = await service.remember(atAlice, input(release))
    const outcome = await service.remember(atAlice, input({ title: 'Weekly release', body: 'The team ships the weekly release on Thursday afternoons after the client review meeting.' }))
    expect(outcome).toMatchObject({ status: 'merged', key: 'release-day', itemId: (held as { itemId: string }).itemId })
    const rows = await prisma.memoryItem.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0].body).toBe(`${release.body}\nThe team ships the weekly release on Thursday afternoons after the client review meeting.`)
    expect(rows[0].embeddingModel).toBe('local')
    expect(rows[0].embedding).toHaveLength(384)
  })

  it('changes nothing when a memory the work could recall already says it, promoted ones included', async () => {
    await service.remember({ ...atAlice, agentId: bolt, place: null }, input({ title: 'Afternoon tea habit', body: 'The person drinks green tea in the afternoon while reading the reports at work.' }))
    await prisma.memoryItem.updateMany({ data: { ...scopeColumns({ person: alice, agent: null, place: null }) } })
    const outcome = await service.remember(atAlice, input({ title: 'Afternoon tea', body: 'The person drinks green tea in the afternoon while reading the reports.' }))
    expect(outcome).toMatchObject({ status: 'merged', key: 'afternoon-tea-habit', alreadyHeld: { title: 'Afternoon tea habit' } })
    expect(await prisma.memoryItem.count()).toBe(1)
  })

  it('keeps an item without a vector when the model cannot embed, found by key until the re-embed', async () => {
    const failing = createMemoryService({ embedderFor: () => ({ model: 'local', dimensions: 384, embed: async () => { throw new Error('offline') } }) })
    expect(await failing.remember(atAlice, input(coffee))).toMatchObject({ status: 'added' })
    expect(await prisma.memoryItem.findFirstOrThrow()).toMatchObject({ embedding: [], embeddingModel: null })
    expect(await service.recallByKey(atAlice, ['coffee-order'])).toHaveLength(1)
  })

  it('refuses past the cap of a scope, as a safety net', async () => {
    const columns = scopeColumns({ person: alice, agent: scout, place: { type: 'project', id: shop } })
    await prisma.memoryItem.createMany({
      data: Array.from({ length: MEMORY_SCOPE_MAX_ITEMS }, (_, i) => ({ ...columns, key: `k${i}`, title: `t${i}`, body: 'b', kind: 'FACT' as const })),
    })
    expect(await service.remember(atAlice, input(coffee))).toMatchObject({ status: 'refused', reason: expect.stringMatching(/Forget something/) })
  })

  it('writes one item when the same key is remembered many times at once', async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) => service.remember(atAlice, input({ title: 'Coffee order', body: `The person takes coffee number ${i} each morning.` }))))
    expect(await prisma.memoryItem.count()).toBe(1)
  })
})

describe('recall @SC-988', () => {
  it('finds by meaning, with each item\'s key and kind, and counts the recall', async () => {
    await service.remember(atAlice, input({ ...coffee, kind: 'RULE' }))
    await service.remember(atAlice, input(release))
    const { items, cut } = await service.recallByQuery(atAlice, 'when does the team ship the weekly release')
    expect(items.map(i => i.key)).toEqual(['release-day'])
    expect(items[0]).toMatchObject({ kind: 'FACT', writtenAt: expect.any(String), similarity: expect.any(Number), score: expect.any(Number) })
    expect(cut).toEqual([])
    expect(await prisma.memoryItem.findFirstOrThrow({ where: { key: 'release-day' } })).toMatchObject({ recallCount: 1, lastRecalledAt: clock })
  })

  it('narrows by kind and tags, and lists by them alone', async () => {
    await service.remember(atAlice, input({ ...coffee, kind: 'RULE', tags: ['food'] }))
    await service.remember(atAlice, input({ ...release, tags: ['work'] }))
    expect((await service.recallFiltered(atAlice, { kind: 'RULE' })).items.map(i => i.key)).toEqual(['coffee-order'])
    expect((await service.recallFiltered(atAlice, { tags: ['Work'] })).items.map(i => i.key)).toEqual(['release-day'])
    expect((await service.recallByQuery(atAlice, 'when does the team ship the weekly release', { kind: 'RULE' })).items).toEqual([])
    expect((await service.recallFiltered({ ...atAlice, personId: bob }, { kind: 'RULE' })).items).toEqual([])
  })

  it('ranks the warmer of two equally similar items first', async () => {
    const body = 'Deploys happen in the evening deploy window on weekdays.'
    const cold = await stored({ agent: null, place: null }, 'deploy-window', { body })
    const warm = await stored({ agent: scout, place: null }, 'deploy-window', { body })
    await prisma.memoryItem.updateMany({ data: { embedding: (await embedder.embed([`deploy-window\n${body}`]))[0], embeddingModel: 'local' } })
    await prisma.memoryItem.update({ where: { id: warm.id }, data: { usedCount: 20, lastRecalledAt: clock } })
    await prisma.memoryItem.update({ where: { id: cold.id }, data: { lastRecalledAt: new Date('2025-06-01T00:00:00Z') } })
    const { items } = await service.recallByQuery(atAlice, 'evening deploy window')
    expect(items.map(i => i.itemId)).toEqual([warm.id, cold.id])
  })

  it('cuts at the token budget and names what it cut', async () => {
    await service.remember(atAlice, input(release))
    await service.remember(atAlice, input({ title: 'Release notes', body: 'The team writes the weekly release notes on Thursday, listing every change shipped that week to customers.' }))
    const { items, cut } = await service.recallByQuery(atAlice, 'the team ships the weekly release on Thursday afternoons', { tokenBudget: 60 })
    expect(items.map(i => i.key)).toEqual(['release-day'])
    expect(cut).toEqual(['release-notes'])
  })

  it('leaves archived items out unless asked, and a read by key still reaches them', async () => {
    await service.remember(atAlice, input(release))
    await prisma.memoryItem.updateMany({ data: { archived: true } })
    expect((await service.recallByQuery(atAlice, 'weekly release')).items).toEqual([])
    expect((await service.recallByQuery(atAlice, 'weekly release', { includeArchived: true })).items).toHaveLength(1)
    expect(await service.recallByKey(atAlice, ['release-day'])).toHaveLength(1)
  })
})

describe('outcomes @SC-989', () => {
  it('records outcomes with the weighted mark, and a use warms the item', async () => {
    const added = await service.remember(atAlice, input(coffee))
    const itemId = (added as { itemId: string }).itemId
    await service.recordOutcomes([
      { itemId, kind: 'INCLUDED', similarity: 0.5, weighted: true, conversationId: 'c1', turnId: 't1' },
      { itemId, kind: 'USED', conversationId: 'c1', turnId: 't1' },
    ])
    expect((await prisma.memoryOutcome.findMany({ where: { itemId }, orderBy: { kind: 'asc' } })).map(o => [o.kind, o.weighted])).toEqual([['INCLUDED', true], ['USED', false]])
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({ usedCount: 1 })
  })
})
