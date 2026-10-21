import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomId } from '../randomId'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('randomId @SC-1146', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is a version 4 UUID', () => {
    expect(randomId()).toMatch(UUID_V4)
  })

  // A browser gives crypto.randomUUID only to a secure page (https or localhost); hq is also opened over plain http
  // at a network address, where it is missing and a message could not be sent.
  it('is made from random bytes where the page is not secure and crypto.randomUUID is missing', () => {
    const { getRandomValues } = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: getRandomValues.bind(globalThis.crypto) })
    const ids = new Set(Array.from({ length: 50 }, () => randomId()))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id).toMatch(UUID_V4)
  })
})
