import { describe, expect, it } from 'vitest'
import { trustedProxyCount } from '../trustedProxies'

describe('trustedProxyCount', () => {
  it('defaults to one — hq-web', () => expect(trustedProxyCount(undefined)).toBe(1))
  it('treats blank as unset', () => expect(trustedProxyCount('  ')).toBe(1))
  it('reads a whole number', () => expect(trustedProxyCount('2')).toBe(2))
  it('allows zero, for hq-server reached directly', () => expect(trustedProxyCount('0')).toBe(0))
  it.each(['-1', '1.5', 'two'])('refuses %s', raw => expect(() => trustedProxyCount(raw)).toThrow(/HQ_TRUSTED_PROXIES/))
})
