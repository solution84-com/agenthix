/** The memory screen's filters: each menu matches its badge exactly, and the words search reads title, body and tags. */
import { describe, expect, it } from 'vitest'
import { NO_FILTER, argsOf, matchesWords } from '../filters'

const item = { title: 'Use a table when comparing options', body: 'One row per option, columns for cost and risk.', tags: ['format'] }

describe('the words search @SC-2108', () => {
  it('matches the words of the title, body and tags, any case', () => {
    expect(matchesWords(item, 'TABLE')).toBe(true)
    expect(matchesWords(item, 'risk')).toBe(true)
    expect(matchesWords(item, 'form')).toBe(true)
    expect(matchesWords(item, 'holiday')).toBe(false)
  })

  it('needs every word, wherever each is', () => {
    expect(matchesWords(item, 'table risk format')).toBe(true)
    expect(matchesWords(item, 'table holiday')).toBe(false)
  })

  it('matches everything when there are no words', () => {
    expect(matchesWords(item, '')).toBe(true)
    expect(matchesWords(item, '   ')).toBe(true)
  })
})

describe('the filter menus @SC-2108', () => {
  it('asks for nothing when nothing is chosen', () => {
    expect(argsOf(NO_FILTER)).toEqual({})
  })

  it('reads "Every agent" and "Everywhere" as the scope left out, and a named one exactly', () => {
    expect(argsOf({ ...NO_FILTER, agent: 'every', place: 'everywhere' })).toEqual({ agentId: null, place: null })
    expect(argsOf({ ...NO_FILTER, agent: 'a1', place: 'project:p1' })).toEqual({ agentId: 'a1', place: { type: 'project', id: 'p1' } })
    expect(argsOf({ ...NO_FILTER, place: 'user:u1' })).toEqual({ place: { type: 'user', id: 'u1' } })
  })

  it('passes the kind, the tag and the words, trimmed', () => {
    expect(argsOf({ ...NO_FILTER, kind: 'RULE', tag: 'format', words: '  table ' })).toEqual({ kind: 'RULE', tag: 'format', words: 'table' })
  })

  it('drops a place it cannot read', () => {
    expect(argsOf({ ...NO_FILTER, place: 'team:t1' })).toEqual({})
  })
})
