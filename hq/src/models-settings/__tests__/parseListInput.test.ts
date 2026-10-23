import { describe, expect, it, vi } from 'vitest'

vi.mock('wasp/server', () => ({
  HttpError: class extends Error { constructor(public statusCode: number, message?: string) { super(message) } },
  prisma: {},
}))
vi.mock('../../projects/membership', () => ({ isOrgAdmin: vi.fn(), projectRole: vi.fn() }))
vi.mock('../../routing/snapshot', () => ({ routeProviders: vi.fn() }))

import { ENTRIES_MAX, parseListInput, parseRef } from '../modelLists'

describe('a list as sent', () => {
  it('takes a mode and entries, dropping a repeated pattern', () => {
    expect(parseListInput({ mode: 'only_these', entries: [
      { effect: 'allow', pattern: ' anthropic/claude-* ' }, { effect: 'never', pattern: 'anthropic/claude-*' },
    ] })).toEqual({ mode: 'only_these', entries: [{ effect: 'never', pattern: 'anthropic/claude-*' }] })
  })

  it('refuses a mode, an effect or a pattern that is not one', () => {
    expect(() => parseListInput({ mode: 'sometimes', entries: [] })).toThrow()
    expect(() => parseListInput({ mode: 'every', entries: [{ effect: 'maybe', pattern: 'a' }] })).toThrow()
    expect(() => parseListInput({ mode: 'every', entries: [{ effect: 'never', pattern: 'two words' }] })).toThrow()
    expect(() => parseListInput({ mode: 'every', entries: 'x' })).toThrow()
    expect(() => parseListInput({ mode: 'every', entries: Array.from({ length: ENTRIES_MAX + 1 }, (_, i) => ({ effect: 'never', pattern: `m${i}` })) })).toThrow()
  })

  it('needs an owner kind and an id', () => {
    expect(parseRef({ owner: 'agent', ownerId: 'a1' })).toEqual({ owner: 'agent', ownerId: 'a1' })
    expect(() => parseRef({ owner: 'team', ownerId: 'a1' })).toThrow()
    expect(() => parseRef({ owner: 'agent' })).toThrow()
  })
})
