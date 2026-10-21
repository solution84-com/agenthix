import { describe, expect, it } from 'vitest'
import {
  checkRemoteAccessOn, checkRemoteAuthenticator, ipv6Groups, ipv6Text, isRemoteAccessName, parseRemoteAllowEntry,
  remoteAccessPortProblem, remoteAccessUntilProblem,
} from '../cloudRemoteAccess.js'

const now = new Date('2026-10-18T10:00:00Z')
const inHours = (h: number) => new Date(now.getTime() + h * 3600_000).toISOString()
const CERT = '-----BEGIN CERTIFICATE-----\nMIIBAAAA\n-----END CERTIFICATE-----\n'
const on = (over: Record<string, unknown> = {}) => ({
  name: 'fc-1.console.example', port: 8443, certificate: CERT, until: inHours(2), allow: ['203.0.113.7/32'], ...over,
})

describe('the addresses that may connect @SC-1080', () => {
  it('takes one IPv4 address as /32 and an IPv6 /64, the IPv6 one made canonical', () => {
    expect(parseRemoteAllowEntry('203.0.113.7/32')).toEqual({ family: 4, network: '203.0.113.7', prefix: 32 })
    expect(parseRemoteAllowEntry('2001:DB8:0001:0002:aaaa::1/64')).toEqual({ family: 6, network: '2001:db8:1:2::', prefix: 64 })
    expect(parseRemoteAllowEntry('2001:db8::/64')).toEqual({ family: 6, network: '2001:db8::', prefix: 64 })
  })

  it('refuses any other prefix, a wider network, and what is not an address', () => {
    for (const bad of ['203.0.113.0/24', '203.0.113.7', '2001:db8::/48', '2001:db8::/128', '0.0.0.0/0', '::/0', '256.1.1.1/32',
      '01.2.3.4/32', '1:2:3:4:5:6:7:8:9/64', '1::2::3/64', 'fe80::1%eth0/64', '::ffff:1.2.3.4/64', 'example.com/32', 7, null]) {
      expect(parseRemoteAllowEntry(bad)).toBeNull()
    }
  })

  it('writes IPv6 groups back in RFC 5952 form', () => {
    expect(ipv6Text(ipv6Groups('2001:0db8:0000:0000:0001:0000:0000:0001')!)).toBe('2001:db8::1:0:0:1')
    expect(ipv6Text(ipv6Groups('::')!)).toBe('::')
    expect(ipv6Text(ipv6Groups('1:0:2:3:4:5:6:7')!)).toBe('1:0:2:3:4:5:6:7')
  })
})

describe('remoteAccess.on, checked @SC-1080', () => {
  it('rebuilds a good request, with the allow list canonical and without repeats', () => {
    const r = checkRemoteAccessOn(on({ allow: ['203.0.113.7/32', '2001:db8:1:2::9/64', '2001:db8:1:2::/64'], extra: true }), now)
    expect(r).toEqual({ ok: true, value: { op: 'remoteAccess.on', name: 'fc-1.console.example', port: 8443, certificate: CERT, until: inHours(2), allow: ['203.0.113.7/32', '2001:db8:1:2::/64'] } })
  })

  it('takes 1 to 20 addresses', () => {
    const many = Array.from({ length: 21 }, (_, i) => `198.51.100.${i}/32`)
    expect(checkRemoteAccessOn(on({ allow: many.slice(0, 20) }), now).ok).toBe(true)
    expect(checkRemoteAccessOn(on({ allow: many }), now).ok).toBe(false)
    expect(checkRemoteAccessOn(on({ allow: [] }), now).ok).toBe(false)
    expect(checkRemoteAccessOn(on({ allow: ['203.0.113.0/24'] }), now).ok).toBe(false)
  })

  it('refuses ports 80, 443, the privileged ones and the Fleet Console\'s own', () => {
    for (const port of [80, 443, 22, 1023, 4300, 0, 70000, 8443.5, '8443']) expect(remoteAccessPortProblem(port)).not.toBeNull()
    expect(remoteAccessPortProblem(8443)).toBeNull()
  })

  it('needs an end time in the future, 8 hours away at most', () => {
    expect(remoteAccessUntilProblem(inHours(-0.01), now)).not.toBeNull()
    expect(remoteAccessUntilProblem(inHours(8.5), now)).not.toBeNull()
    expect(remoteAccessUntilProblem('soon', now)).not.toBeNull()
    expect(remoteAccessUntilProblem(inHours(8), now)).toBeNull()
  })

  it('needs a DNS name and a PEM certificate chain', () => {
    for (const name of ['localhost', '*.console.example', 'fc..example', '203.0.113.7', 'FC.example', 'a'.repeat(64) + '.example']) {
      expect(isRemoteAccessName(name)).toBe(false)
    }
    expect(checkRemoteAccessOn(on({ certificate: '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n' }), now).ok).toBe(false)
    expect(checkRemoteAccessOn(on({ certificate: CERT + CERT }), now).ok).toBe(true)
  })
})

describe('remoteAccess.authenticator.add, checked @SC-1080', () => {
  const hashes = Array.from({ length: 10 }, (_, i) => i.toString(16).repeat(64))
  const add = (over: Record<string, unknown> = {}) => ({ id: 'auth-1', secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEH', recoveryCodeHashes: hashes, claimBefore: inHours(48), ...over })

  it('rebuilds a good one', () => {
    expect(checkRemoteAuthenticator(add({ secret: 'jbsw y3dp ehpk 3pxp jbsw y3dp eh' }), now)).toEqual({
      ok: true, value: { op: 'remoteAccess.authenticator.add', id: 'auth-1', secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEH', recoveryCodeHashes: hashes, claimBefore: inHours(48) },
    })
  })

  it('refuses a short secret, other than 10 different hashes, and a claim time passed or too far', () => {
    expect(checkRemoteAuthenticator(add({ secret: 'JBSWY3DPEHPK3PXP' }), now).ok).toBe(false)
    expect(checkRemoteAuthenticator(add({ secret: 'not base32!' }), now).ok).toBe(false)
    expect(checkRemoteAuthenticator(add({ recoveryCodeHashes: hashes.slice(1) }), now).ok).toBe(false)
    expect(checkRemoteAuthenticator(add({ recoveryCodeHashes: [...hashes.slice(1), hashes[1]] }), now).ok).toBe(false)
    expect(checkRemoteAuthenticator(add({ claimBefore: inHours(-1) }), now).ok).toBe(false)
    expect(checkRemoteAuthenticator(add({ claimBefore: inHours(24 * 31) }), now).ok).toBe(false)
    expect(checkRemoteAuthenticator(add({ id: 'has space' }), now).ok).toBe(false)
  })
})
