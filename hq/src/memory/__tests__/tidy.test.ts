import { describe, it, expect } from 'vitest'
import { duplicateChanges, type TidyRow } from '../tidy'

const day = (n: number) => new Date(Date.UTC(2026, 9, n))
const near = [1, 0, 0]

function row(id: string, over: Partial<TidyRow> = {}): TidyRow {
  return {
    id, scopeKey: 's', kind: 'FACT', body: `${id} is a thing the agent learned.`, tags: [],
    embedding: near, embeddingModel: 'local', updatedAt: day(1), ...over,
  }
}

describe('the tidy\'s near-duplicates @SC-990', () => {
  it('merges a fact into the older item and archives the newer', () => {
    const changes = duplicateChanges([row('new', { updatedAt: day(2), tags: ['b'] }), row('old', { tags: ['a'] })])
    expect(changes).toEqual([{ kind: 'merge', into: 'old', body: 'old is a thing the agent learned.\nnew is a thing the agent learned.', tags: ['a', 'b'], archive: 'new' }])
  })

  it('archives the older Rule in favour of the newer, which names it', () => {
    const changes = duplicateChanges([row('old', { kind: 'RULE' }), row('new', { kind: 'RULE', updatedAt: day(2) })])
    expect(changes).toEqual([{ kind: 'archive', id: 'old', supersededBy: 'new' }])
  })

  it('archives a newer item the older already says', () => {
    const changes = duplicateChanges([row('old', { body: 'The team ships on Thursdays from main.' }), row('new', { body: 'The team ships on Thursdays', updatedAt: day(2) })])
    expect(changes).toEqual([{ kind: 'archive', id: 'new' }])
  })

  it('leaves items apart in meaning, of different models, or without a vector', () => {
    expect(duplicateChanges([row('a'), row('b', { embedding: [0, 1, 0] })])).toEqual([])
    expect(duplicateChanges([row('a'), row('b', { embeddingModel: 'openai/x' })])).toEqual([])
    expect(duplicateChanges([row('a', { embeddingModel: null }), row('b', { embeddingModel: null })])).toEqual([])
  })

  it('touches each item once a pass', () => {
    expect(duplicateChanges([row('a'), row('b', { updatedAt: day(2) }), row('c', { updatedAt: day(3) })])).toHaveLength(1)
  })
})
