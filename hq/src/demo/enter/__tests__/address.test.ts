import { describe, expect, it } from 'vitest'
import { entryAddress } from '../address'

describe('the address Enter the demo is limited by @SC-1950', () => {
  it('is an IPv4 address itself, written plainly or mapped into IPv6', () => {
    expect(entryAddress('203.0.113.9')).toBe('203.0.113.9')
    expect(entryAddress('::ffff:203.0.113.9')).toBe('203.0.113.9')
  })

  it("is an IPv6 address's /64, however the address is written", () => {
    expect(entryAddress('2001:db8:1:2::1')).toBe('2001:db8:1:2::/64')
    expect(entryAddress('2001:0DB8:0001:0002:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64')
    expect(entryAddress('2001:db8::1')).toBe('2001:db8:0:0::/64')
    expect(entryAddress('fe80::1%eth0')).toBe('fe80:0:0:0::/64')
    expect(entryAddress('2001:db8:1:2::7')).toBe(entryAddress('2001:db8:1:2:ffff::9'))
    expect(entryAddress('2001:db8:1:2::7')).not.toBe(entryAddress('2001:db8:1:3::7'))
  })

  it('leaves what is not an address as it came', () => {
    expect(entryAddress('unknown')).toBe('unknown')
  })
})
