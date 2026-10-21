import { describe, it, expect } from 'vitest'
import { isPlausibleOauthDocument } from '../oauthDocument'

const doc = (claudeAiOauth: unknown) => JSON.stringify({ claudeAiOauth })

describe('isPlausibleOauthDocument', () => {
  it('takes a credentials document whose own expiry agrees with the one declared beside it', () => {
    expect(isPlausibleOauthDocument(doc({ accessToken: 'a', expiresAt: 9_000 }), 9_000)).toBe(true)
  })

  it('refuses one whose own expiry disagrees, or that carries none', () => {
    expect(isPlausibleOauthDocument(doc({ expiresAt: 9_000 }), 10_000)).toBe(false)
    expect(isPlausibleOauthDocument(doc({ accessToken: 'a' }), 9_000)).toBe(false)
    expect(isPlausibleOauthDocument(doc({ expiresAt: '9000' }), 9_000)).toBe(false)
  })

  it('refuses what is not a credentials document at all', () => {
    expect(isPlausibleOauthDocument('not json {', 9_000)).toBe(false)
    expect(isPlausibleOauthDocument('null', 9_000)).toBe(false)
    expect(isPlausibleOauthDocument(JSON.stringify({ other: 1 }), 9_000)).toBe(false)
  })
})
