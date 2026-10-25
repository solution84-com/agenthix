import net from 'node:net'
import { describe, expect, it } from 'vitest'
import { makeNonPublicCheck, normaliseAddress } from '../program/addressPolicy'
import { answerDnsQuery } from '../program/dnsAnswer'
import { httpHost, requestedName, tlsServerName } from '../program/requestedName'
import { dnsQuery, readReply } from './dns'
import { clientHello } from './tls'

const NAMES = ['registry.npmjs.org', 'staging.example.com']
const PROXY = '10.211.0.2'

describe('the proxy\'s DNS answers @SC-1348', () => {
  it('answers an approved name with the proxy\'s own address', () => {
    const r = readReply(answerDnsQuery(dnsQuery('registry.npmjs.org'), NAMES, PROXY)!)
    expect(r).toEqual({ id: 0x1234, rcode: 0, authoritative: true, recursionAvailable: false, answers: [PROXY] })
  })

  it('matches names whatever their case, as DNS does', () => {
    expect(readReply(answerDnsQuery(dnsQuery('Staging.EXAMPLE.com'), NAMES, PROXY)!).answers).toEqual([PROXY])
  })

  it('answers AAAA and other types of an approved name empty, never NXDOMAIN', () => {
    for (const type of [28, 16, 15, 255]) {
      const r = readReply(answerDnsQuery(dnsQuery('registry.npmjs.org', type), NAMES, PROXY)!)
      expect(r.rcode).toBe(0)
      expect(r.answers).toEqual([])
    }
  })

  it('answers every other name NXDOMAIN, a subdomain and a lookalike included', () => {
    for (const name of ['c2VjcmV0.exfil.example.net', 'x.registry.npmjs.org', 'registry.npmjs.org.evil.net', 'npmjs.org']) {
      const r = readReply(answerDnsQuery(dnsQuery(name), NAMES, PROXY)!)
      expect(r.rcode).toBe(3)
      expect(r.answers).toEqual([])
    }
  })

  it('does not take a label holding a dot for two labels', () => {
    const q = dnsQuery('x')
    const forged = Buffer.concat([q.subarray(0, 12), Buffer.from([18]), Buffer.from('registry.npmjs.org'), q.subarray(14)])
    expect(readReply(answerDnsQuery(forged, NAMES, PROXY)!).rcode).toBe(3)
  })

  it('refuses malformed queries and answers nothing to a response', () => {
    const q = dnsQuery('registry.npmjs.org')
    expect(answerDnsQuery(q.subarray(0, 8), NAMES, PROXY)).toBeNull()
    expect(readReply(answerDnsQuery(q.subarray(0, 20), NAMES, PROXY)!).rcode).toBe(1)
    const pointer = Buffer.concat([q.subarray(0, 12), Buffer.from([0xc0, 0x0c, 0, 1, 0, 1])])
    expect(readReply(answerDnsQuery(pointer, NAMES, PROXY)!).rcode).toBe(1)
    const response = Buffer.from(q)
    response.writeUInt16BE(0x8100, 2)
    expect(answerDnsQuery(response, NAMES, PROXY)).toBeNull()
    const update = Buffer.from(q)
    update.writeUInt16BE(5 << 11, 2)
    expect(readReply(answerDnsQuery(update, NAMES, PROXY)!).rcode).toBe(4)
  })
})

describe('which approved host a connection names @SC-1348', () => {
  it('reads a TLS ClientHello\'s server name, also when it spans records and arrives in pieces', () => {
    const hello = clientHello('Registry.NPMjs.org')
    expect(tlsServerName(hello)).toBe('registry.npmjs.org')
    expect(tlsServerName(hello.subarray(0, 30))).toBeUndefined()
    expect(tlsServerName(clientHello('github.com', { split: true }))).toBe('github.com')
    expect(tlsServerName(clientHello(null))).toBeNull()
  })

  it('reads an HTTP/1 request\'s Host, without its port', () => {
    const req = (host: string) => Buffer.from(`GET / HTTP/1.1\r\nUser-Agent: t\r\nHost: ${host}\r\n\r\n`)
    expect(httpHost(req('Staging.example.com:8080'))).toBe('staging.example.com')
    expect(httpHost(req('[2001:db8::1]:80'))).toBe('[2001:db8::1]')
    expect(httpHost(Buffer.from('GET / HTTP/1.1\r\nHost: a'))).toBeUndefined()
    expect(httpHost(Buffer.from('GE'))).toBeUndefined()
    expect(httpHost(Buffer.from('CONNECT a:443 HTTP/1.1\r\nHost: a\r\n\r\n'))).toBeNull()
    expect(httpHost(Buffer.from('GET / HTTP/1.1\r\n\r\n'))).toBeNull()
  })

  it('says neither for anything else, such as ssh', () => {
    expect(requestedName(Buffer.from('SSH-2.0-OpenSSH_9.9\r\n'))).toBeNull()
    expect(requestedName(Buffer.from([0, 1, 2]))).toBeNull()
  })
})

describe('the addresses the proxy refuses unless approved @SC-1348', () => {
  const nonPublic = makeNonPublicCheck(net)

  it('refuses private, loopback, link-local, metadata and the IPv6 forms of them', () => {
    for (const a of [
      '10.0.0.5', '172.16.1.1', '192.168.1.1', '127.0.0.1', '169.254.169.254', '100.100.100.200', '168.63.129.16',
      '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:10.0.0.1', '::ffff:7f00:1',
      '64:ff9b::a00:1', '2002:a00:1::1', 'not-an-address',
    ]) expect(nonPublic(a), a).toBe(true)
  })

  it('lets public addresses through', () => {
    for (const a of ['104.16.0.34', '140.82.112.3', '8.8.8.8', '2606:4700::6810:22', '[2606:4700::6810:22]']) {
      expect(nonPublic(a), a).toBe(false)
    }
  })

  it('writes an address one way, so an approved address is found whatever its form', () => {
    expect(normaliseAddress('[2001:DB8:0:0::1]')).toBe('2001:db8::1')
    expect(normaliseAddress('10.0.0.5')).toBe('10.0.0.5')
  })
})
