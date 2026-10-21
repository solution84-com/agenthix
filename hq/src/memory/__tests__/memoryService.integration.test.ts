/**
 * The memory store against the real test database, with the deterministic fake embedder (no model is loaded):
 * who reaches which scope, keys, the standing-alone refusal, dedupe by supersede and merge, ranking, and the
 * outcomes that warm an item.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser } from '../../test/factories'
import { createFakeEmbedder } from '../../test/fakes/embedders'
import { MEMORY_SCOPE_MAX_ITEMS } from '../../shared/memory/protocol'
import type { MemoryPrincipal, RememberInput } from '../contract'

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
let atAlice: MemoryPrincipal

const coffee = { title: 'Coffee order', body: 'The person takes their coffee black with no sugar, every single morning before standup.' }
const release = { title: 'Release day', body: 'The team ships the weekly release on Thursday afternoons after the review meeting.' }

function input(over: Partial<RememberInput> & Pick<RememberInput, 'title' | 'body'>): RememberInput {
  return { scope: 'PERSON', kind: 'FACT', writtenBy: { agentId: scout }, ...over }
}

beforeEach(async () => {
  clock = new Date('2026-10-16T12:00:00Z')
  alice = (await createUser()).id
  bob = (await createUser()).id
  scout = (await createAgent()).id
  bolt = (await createAgent()).id
  shop = (await createProject({ name: 'Shop' })).id
  atAlice = { personId: alice, agentId: scout, place: { type: 'project', id: shop } }
})

describe('who reaches which memory @SC-986', () => {
  it("a person's scopes are that person's alone", async () => {
    await service.remember(atAlice, input({ ...coffee, kind: 'PREFERENCE' }))
    const atBob = { ...atAlice, personId: bob }
    expect(await service.recallByKey(atBob, ['coffee-order'])).toEqual([])
    expect((await service.recallByQuery(atBob, 'how does the person take their coffee')).items).toEqual([])
    expect((await service.recallByKey(atAlice, ['coffee-order'])).map(i => i.title)).toEqual(['Coffee order'])
  })

  it("an agent's memory of a person is that agent's alone", async () => {
    await service.remember(atAlice, input({ ...coffee, scope: 'AGENT_PERSON' }))
    expect(await service.recallByKey({ ...atAlice, agentId: bolt }, ['coffee-order'])).toEqual([])
    expect(await service.recallByKey(atAlice, ['coffee-order'])).toHaveLength(1)
  })

  it('agent × place reaches only that place, and any person working there with that agent', async () => {
    await service.remember(atAlice, input({ ...release, scope: 'AGENT_PLACE' }))
    expect(await service.recallByKey({ personId: bob, agentId: scout, place: { type: 'project', id: shop } }, ['release-day'])).toHaveLength(1)
    expect(await service.recallByKey({ ...atAlice, place: { type: 'user', id: alice } }, ['release-day'])).toEqual([])
  })

  it('a principal with no person reaches agent × place only, reading and writing', async () => {
    const pulse: MemoryPrincipal = { personId: null, agentId: scout, place: { type: 'project', id: shop } }
    await service.remember(atAlice, input(coffee))
    expect(await service.remember(pulse, input(release))).toMatchObject({ status: 'refused', reason: expect.stringMatching(/not for any person/) })
    expect(await service.remember(pulse, input({ ...release, scope: 'AGENT_PLACE' }))).toMatchObject({ status: 'added' })
    expect(await service.recallByKey(pulse, ['coffee-order', 'release-day'])).toHaveLength(1)
  })

  it('forget refuses a scope the principal does not reach, and removes only from its own', async () => {
    await service.remember(atAlice, input(coffee))
    await expect(service.forget({ personId: null, agentId: scout, place: null }, 'coffee-order', 'PERSON')).rejects.toThrow(/not for any person/)
    expect(await service.forget({ ...atAlice, personId: bob }, 'coffee-order', 'PERSON')).toBe(false)
    expect(await service.forget(atAlice, 'coffee-order', 'PERSON')).toBe(true)
    expect(await prisma.memoryItem.count()).toBe(0)
  })
})

describe('remember @SC-987', () => {
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

  it('supersedes a near-duplicate stance: the old one is archived, and the new one names it', async () => {
    const old = await service.remember(atAlice, input({ ...coffee, kind: 'PREFERENCE' }))
    const next = await service.remember(atAlice, input({ title: 'Coffee order today', body: `${coffee.body.slice(0, -1)}, always.`, kind: 'PREFERENCE' }))
    expect(next).toMatchObject({ status: 'superseded', key: 'coffee-order-today' })
    const oldRow = await prisma.memoryItem.findUniqueOrThrow({ where: { id: (old as { itemId: string }).itemId } })
    const newRow = await prisma.memoryItem.findUniqueOrThrow({ where: { id: (next as { itemId: string }).itemId } })
    expect(oldRow.archived).toBe(true)
    expect(newRow.supersedesId).toBe(oldRow.id)
  })

  it('merges a near-duplicate fact that adds to the one held, and embeds the merged item again', async () => {
    const held = await service.remember(atAlice, input(release))
    const outcome = await service.remember(atAlice, input({ title: 'Weekly release', body: 'The team ships the weekly release on Thursday afternoons after the client review meeting.' }))
    expect(outcome).toMatchObject({ status: 'merged', key: 'release-day', itemId: (held as { itemId: string }).itemId })
    const rows = await prisma.memoryItem.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0].body).toBe(`${release.body}\nThe team ships the weekly release on Thursday afternoons after the client review meeting.`)
    expect(rows[0].embeddingModel).toBe('local')
    expect(rows[0].embedding).toHaveLength(384)
  })

  it('changes nothing when the item held already says it', async () => {
    await service.remember(atAlice, input({ title: 'Afternoon tea habit', body: 'The person drinks green tea in the afternoon while reading the reports at work.' }))
    const outcome = await service.remember(atAlice, input({ title: 'Afternoon tea', body: 'The person drinks green tea in the afternoon while reading the reports.' }))
    expect(outcome).toMatchObject({ status: 'merged', key: 'afternoon-tea-habit' })
    expect(await prisma.memoryItem.count()).toBe(1)
  })

  it('keeps an item without a vector when the model cannot embed, found by key until the re-embed', async () => {
    const failing = createMemoryService({ embedderFor: () => ({ model: 'local', dimensions: 384, embed: async () => { throw new Error('offline') } }) })
    expect(await failing.remember(atAlice, input(coffee))).toMatchObject({ status: 'added' })
    expect(await prisma.memoryItem.findFirstOrThrow()).toMatchObject({ embedding: [], embeddingModel: null })
    expect(await service.recallByKey(atAlice, ['coffee-order'])).toHaveLength(1)
  })

  it('refuses past the cap of a scope, as a safety net', async () => {
    const scopeKey = `person:${alice}`
    await prisma.memoryItem.createMany({
      data: Array.from({ length: MEMORY_SCOPE_MAX_ITEMS }, (_, i) => ({
        scope: 'PERSON' as const, scopeKey, userId: alice, key: `k${i}`, title: `t${i}`, body: 'b', kind: 'FACT' as const,
      })),
    })
    expect(await service.remember(atAlice, input(coffee))).toMatchObject({ status: 'refused', reason: expect.stringMatching(/Forget something/) })
  })

  it('writes one item when the same key is remembered many times at once', async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) => service.remember(atAlice, input({ title: 'Coffee order', body: `The person takes coffee number ${i} each morning.` }))))
    expect(await prisma.memoryItem.count()).toBe(1)
  })
})

describe('recall by query @SC-988', () => {
  it('finds by meaning, with each item\'s key and provenance, and counts the recall', async () => {
    await service.remember(atAlice, input({ ...coffee, kind: 'PREFERENCE' }))
    await service.remember(atAlice, input({ ...release, scope: 'AGENT_PLACE' }))
    const { items, cut } = await service.recallByQuery(atAlice, 'when does the team ship the weekly release')
    expect(items.map(i => i.key)).toEqual(['release-day'])
    expect(items[0]).toMatchObject({ scope: 'AGENT_PLACE', writtenAt: expect.any(String), similarity: expect.any(Number), score: expect.any(Number) })
    expect(cut).toEqual([])
    expect(await prisma.memoryItem.findFirstOrThrow({ where: { key: 'release-day' } })).toMatchObject({ recallCount: 1, lastRecalledAt: clock })
  })

  it('puts pinned items first', async () => {
    await service.remember(atAlice, input(release))
    await service.remember(atAlice, input({ title: 'Release branch', body: 'Weekly release builds are cut from the main branch by the team.', pinned: true }))
    const { items } = await service.recallByQuery(atAlice, 'when does the team ship the weekly release')
    expect(items.map(i => i.key)).toEqual(['release-branch', 'release-day'])
  })

  it('ranks the warmer of two equally similar items first', async () => {
    await service.remember(atAlice, input({ title: 'Deploy window', body: 'Deploys happen in the evening deploy window on weekdays.' }))
    await service.remember(atAlice, input({ scope: 'AGENT_PERSON', title: 'Deploy window', body: 'Deploys happen in the evening deploy window on weekdays.' }))
    await prisma.memoryItem.updateMany({ where: { scope: 'AGENT_PERSON' }, data: { usedCount: 20, lastRecalledAt: clock } })
    await prisma.memoryItem.updateMany({ where: { scope: 'PERSON' }, data: { lastRecalledAt: new Date('2025-06-01T00:00:00Z') } })
    const { items } = await service.recallByQuery(atAlice, 'evening deploy window')
    expect(items.map(i => i.scope)).toEqual(['AGENT_PERSON', 'PERSON'])
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

  it('searches every item while a switch of model re-embeds, each in the model it was embedded with', async () => {
    await service.remember(atAlice, input(release))
    const org = await prisma.org.create({ data: { name: 'Org', memoryEmbeddingNext: 'openai/text-embedding-3-small' } })
    const providerFake = createFakeEmbedder('openai/text-embedding-3-small')
    const switching = createMemoryService({ embedderFor: m => (m === 'local' ? embedder : providerFake) })
    await switching.remember(atAlice, input({ ...coffee, scope: 'AGENT_PERSON' }))
    expect(await prisma.memoryItem.findFirstOrThrow({ where: { key: 'coffee-order' } })).toMatchObject({ embeddingModel: 'openai/text-embedding-3-small' })
    expect((await switching.recallByQuery(atAlice, 'when does the team ship the weekly release')).items.map(i => i.key)).toEqual(['release-day'])
    expect((await switching.recallByQuery(atAlice, 'how does the person take their coffee')).items.map(i => i.key)).toEqual(['coffee-order'])
    await prisma.org.delete({ where: { id: org.id } })
  })
})

describe('pinned and outcomes @SC-989', () => {
  it('pinned returns the pinned items the principal reaches, and no other', async () => {
    await service.remember(atAlice, input({ ...coffee, pinned: true }))
    await service.remember(atAlice, input(release))
    expect((await service.pinned(atAlice)).map(i => i.key)).toEqual(['coffee-order'])
    expect(await service.pinned({ ...atAlice, personId: bob })).toEqual([])
  })

  it('records outcomes, and a use warms the item', async () => {
    const added = await service.remember(atAlice, input(coffee))
    const itemId = (added as { itemId: string }).itemId
    await service.recordOutcomes([
      { itemId, kind: 'INCLUDED', similarity: 0.8, conversationId: 'c1', turnId: 't1' },
      { itemId, kind: 'USED', conversationId: 'c1', turnId: 't1' },
    ])
    expect(await prisma.memoryOutcome.count({ where: { itemId } })).toBe(2)
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({ usedCount: 1 })
  })
})
