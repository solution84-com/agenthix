import { describe, expect, it } from 'vitest'
import { isPublicAddress } from '../publicAddress'

describe('isPublicAddress @security-M3 @SC-1611', () => {
  it.each([
    '0.0.0.0', '0.1.2.3', '10.0.0.1', '100.64.0.1', '127.0.0.1', '127.255.255.254', '169.254.169.254', '172.16.0.1',
    '172.31.255.255', '192.0.0.8', '192.0.2.1', '192.168.1.1', '198.18.0.1', '198.51.100.7', '203.0.113.9',
    '224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255',
  ])('refuses the IPv4 address %s', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  it.each([
    '::', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.1.2.3', '::ffff:169.254.169.254', '::127.0.0.1',
    'fd00::1', 'fc00::1', 'fe80::1', 'fe80::1%en0', 'febf::1', 'fec0::1', 'ff02::1', 'ff0e::1', '64:ff9b::7f00:1',
    '64:ff9b::8.8.8.8', '100::1', '2001:db8::1', '2001::1', '2002:7f00:1::', '2002:0808:0808::', '3fff::1',
  ])('refuses the IPv6 address %s', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  it.each(['8.8.8.8', '1.1.1.1', '140.82.112.3', '172.32.0.1', '100.128.0.1', '::ffff:8.8.8.8', '2606:4700::1111',
    '2a00:1450:4001:81a::200e', '[2606:4700::1111]'])('accepts the public address %s', (address) => {
    expect(isPublicAddress(address)).toBe(true)
  })

  it.each(['', 'localhost', 'example.com', '2130706433', '127.1', '0x7f.0.0.1', '1.2.3.4.5', '::g', '[::1'])(
    'refuses %j, which is not an address', (value) => {
      expect(isPublicAddress(value)).toBe(false)
    },
  )
})
