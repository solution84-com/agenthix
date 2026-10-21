/**
 * The probe (memory and knowledge spec, What decides a recall) with the deterministic fake embedder and rows held
 * in memory: the composed query is embedded once per model in use, items fall into the tiers by their similarity
 * against the bars, pinned items are always there, and nothing is written.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))
vi.mock('../../../memory/embedding/embedders', () => import('../../../test/fakes/embedders'))

import { createFakeEmbedder, fakeVector } from '../../../test/fakes/embedders'
import type { ItemRow } from '../../../memory/memoryRows'
import { createProbe, type ProbeDeps } from '../probe'

const QUERY = 'which staging server do we deploy the shop to'
const q = fakeVector(QUERY)
const spare = q.findIndex(v => v === 0)

/** A unit vector at exactly this cosine to the query's. */
function at(similarity: number): number[] {
  const v = q.map(x => x * similarity)
  v[spare] = Math.sqrt(1 - similarity * similarity)
  return v
}

let n = 0
function row(similarity: number | null, over: Partial<ItemRow> = {}): ItemRow {
  n += 1
  return {
    id: `i${n}`, key: `item-${n}`, scope: 'PERSON', scopeKey: 'person:u1', title: `Item ${n}`, body: 'body', kind: 'FACT',
    tags: [], pinned: false, archived: false, embedding: similarity === null ? [] : at(similarity),
    embeddingModel: similarity === null ? null : 'local', recallCount: 0, usedCount: 0, lastRecalledAt: null,
    updatedAt: new Date('2026-10-15T00:00:00Z'), ...over,
  } as ItemRow
}

function deps(rows: ItemRow[], over: Partial<ProbeDeps> = {}) {
  const embedder = createFakeEmbedder()
  return {
    embedder,
    deps: {
      rows: async () => rows,
      state: async () => ({ current: 'local', next: null }),
      embedderFor: () => embedder,
      bars: async () => ({ certain: 0.62, probable: 0.45 }),
      now: () => new Date('2026-10-16T00:00:00Z'),
      ...over,
    } satisfies ProbeDeps,
  }
}

const principal = { personId: 'u1', agentId: 'a1', place: { type: 'project' as const, id: 'p1' } }

describe('the probe @SC-989', () => {
  it('includes what is certain, hints what is probable, and is silent below the probable bar', async () => {
    const certain = row(0.8)
    const probable = row(0.5)
    const silent = row(0.4)
    const { deps: d, embedder } = deps([certain, probable, silent])
    const found = await createProbe(d)(principal, QUERY)
    expect(found.certain.map(i => i.key)).toEqual([certain.key])
    expect(found.certain[0]!.similarity).toBeCloseTo(0.8)
    expect(found.probable).toEqual([{ itemId: probable.id, key: probable.key, title: probable.title, similarity: expect.closeTo(0.5) }])
    expect(embedder.calls).toEqual([[QUERY]])
    expect(found.scores.get(silent.id)).toBeCloseTo(0.4)
  })

  it('always gives the pinned items, matched or not, and does not repeat them in a tier', async () => {
    const pinnedFar = row(0.1, { pinned: true, title: 'Signs off as Sam' })
    const pinnedNear = row(0.9, { pinned: true })
    const notEmbedded = row(null, { pinned: true })
    const { deps: d } = deps([pinnedFar, pinnedNear, notEmbedded])
    const found = await createProbe(d)(principal, QUERY)
    expect(found.pinned.map(i => i.itemId).sort()).toEqual([pinnedFar.id, pinnedNear.id, notEmbedded.id].sort())
    expect(found.certain).toEqual([])
  })

  it('moves with the organisation\'s bars', async () => {
    const item = row(0.6)
    const { deps: d } = deps([item], { bars: async () => ({ certain: 0.55, probable: 0.4 }) })
    expect((await createProbe(d)(principal, QUERY)).certain.map(i => i.key)).toEqual([item.key])
  })

  it('embeds the query once in each model the items use while a switch re-embeds', async () => {
    const other = createFakeEmbedder('openai/text-embedding-3-small')
    const local = createFakeEmbedder()
    const moved = row(0.2, { embeddingModel: 'openai/text-embedding-3-small', embedding: fakeVector(QUERY, 384, 'openai/text-embedding-3-small') })
    const { deps: d } = deps([row(0.3), moved], {
      state: async () => ({ current: 'local', next: 'openai/text-embedding-3-small' }),
      embedderFor: model => (model === 'local' ? local : other),
    })
    const found = await createProbe(d)(principal, QUERY)
    expect(local.calls).toEqual([[QUERY]])
    expect(other.calls).toEqual([[QUERY]])
    expect(found.certain.map(i => i.itemId)).toEqual([moved.id])
  })

  it('finds nothing, without embedding, when the principal reaches no items or the query is empty', async () => {
    const { deps: d, embedder } = deps([])
    expect(await createProbe(d)(principal, QUERY)).toMatchObject({ certain: [], probable: [], pinned: [] })
    const { deps: d2, embedder: e2 } = deps([row(0.9)])
    expect((await createProbe(d2)(principal, '  ')).certain).toEqual([])
    expect(embedder.calls).toEqual([])
    expect(e2.calls).toEqual([])
  })
})
