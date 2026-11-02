import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({
  HttpError: class HttpError extends Error { constructor(public statusCode: number, message?: string) { super(message) } },
  prisma: {},
}))

import { readScopesInput } from '../packageScopes'

describe('the trusted package scopes an admin gives @SC-1711', () => {
  it('keeps each scope once, trimmed', () => {
    expect(readScopesInput([' @fernhill', '@garden', '@fernhill', ''])).toEqual(['@fernhill', '@garden'])
  })

  it('refuses what is not a list of npm scopes, saying what to fix', () => {
    expect(() => readScopesInput('@fernhill')).toThrow(/as a list/)
    expect(() => readScopesInput(['fernhill'])).toThrow(/starts with @/)
    expect(() => readScopesInput(['@Fern/hill'])).toThrow(/lower-case name, with no slash/)
    expect(() => readScopesInput(Array.from({ length: 21 }, (_, i) => `@s${i}`))).toThrow(/at most 20/)
  })
})
