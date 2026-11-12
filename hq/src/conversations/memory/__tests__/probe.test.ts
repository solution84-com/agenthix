/**
 * The probe (memory and knowledge spec, What decides a recall) with the deterministic fake embedder and rows held
 * in memory: the composed query is embedded once per model in use, items fall into the tiers by their similarity
 * against the bars, a Rule found between them is included in full, and nothing is written.
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
    id: `i${n}`, key: `item-${n}`, scopeKey: 'person:u1/agent:*/place:*', userId: 'u1', agentId: null, placeType: null,
    placeId: null, title: `Item ${n}`, body: 'body', kind: 'FACT', tags: [], archived: false, embedding: similarity === null ? [] : at(similarity),
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

  it('includes a Rule that only reached the hint in full, ahead of a Fact, and marks it weighted', async () => {
    const fact = row(0.8)
    const rule = row(0.5, { kind: 'RULE' })
    const { deps: d } = deps([fact, rule])
    const found = await createProbe(d)(principal, QUERY)
    expect(found.certain.map(i => [i.key, i.weighted])).toEqual([[rule.key, true], [fact.key, false]])
    expect(found.probable).toEqual([])
  })

  it('moves with the organisation\'s bars', async () => {
    const item = row(0.6)
    const { deps: d } = deps([item], { bars: async () => ({ certain: 0.55, probable: 0.4 }) })
    expect((await createProbe(d)(principal, QUERY)).certain.map(i => i.key)).toEqual([item.key])
  })

  it('finds nothing, without embedding, when the principal reaches no items or the query is empty', async () => {
    const { deps: d, embedder } = deps([])
    expect(await createProbe(d)(principal, QUERY)).toMatchObject({ certain: [], probable: [] })
    const { deps: d2, embedder: e2 } = deps([row(0.9)])
    expect((await createProbe(d2)(principal, '  ')).certain).toEqual([])
    expect(embedder.calls).toEqual([])
    expect(e2.calls).toEqual([])
  })
})
