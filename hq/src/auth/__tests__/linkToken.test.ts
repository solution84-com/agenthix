import { describe, it, expect } from 'vitest'
import { forgetLinkToken, takeLinkToken } from '../linkToken'

// A one-time link's token leaves the address bar once read, and this tab keeps it.

function memoryStore() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
  }
}

describe('takeLinkToken @SC-718', () => {
  it('keeps the token from the address, and gives it back once the address no longer has it', () => {
    const store = memoryStore()
    expect(takeLinkToken('invite', 'abc', store)).toBe('abc')
    expect(takeLinkToken('invite', undefined, store)).toBe('abc')
    expect(takeLinkToken('reset', undefined, store)).toBeNull()
  })

  it('forgets it once used', () => {
    const store = memoryStore()
    takeLinkToken('reset', 'xyz', store)
    forgetLinkToken('reset', store)
    expect(takeLinkToken('reset', undefined, store)).toBeNull()
  })

  it('still works for this page view when storage is refused', () => {
    const refusing = { getItem: () => { throw new Error('no') }, setItem: () => { throw new Error('no') }, removeItem: () => { throw new Error('no') } }
    expect(takeLinkToken('invite', 'abc', refusing)).toBe('abc')
    expect(takeLinkToken('invite', undefined, refusing)).toBeNull()
    expect(() => forgetLinkToken('invite', refusing)).not.toThrow()
  })
})
