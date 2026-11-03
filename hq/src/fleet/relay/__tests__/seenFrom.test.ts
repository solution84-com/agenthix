/** hq telling each host service the address it sees its link from (core's `HqSeenFromFrame`). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { hostLink, opened, startHarness, type Harness } from './relayHarness'
import { seenFromAddress } from '../seenFrom'

const req = (remoteAddress: string | undefined, forwarded?: string | string[]) =>
  ({ socket: { remoteAddress }, headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded } }) as unknown as IncomingMessage

describe('the address a host link is seen from @SC-1758', () => {
  it('is the connection\'s own with no proxy in front', () => {
    expect(seenFromAddress(req('203.0.113.9', '198.51.100.1'), 0)).toBe('203.0.113.9')
  })

  it('is read one hop back per trusted proxy, from the right', () => {
    expect(seenFromAddress(req('172.18.0.3', '10.0.0.1, 203.0.113.9'), 1)).toBe('203.0.113.9')
    expect(seenFromAddress(req('172.18.0.3', ['10.0.0.1', '203.0.113.9, 172.18.0.2']), 2)).toBe('203.0.113.9')
  })

  it('is the furthest known when there are fewer hops than proxies', () => {
    expect(seenFromAddress(req('172.18.0.3'), 1)).toBe('172.18.0.3')
    expect(seenFromAddress(req('172.18.0.3', '203.0.113.9'), 3)).toBe('203.0.113.9')
  })

  it('drops the IPv4-mapped prefix and refuses what is not an address', () => {
    expect(seenFromAddress(req('::ffff:203.0.113.9'), 0)).toBe('203.0.113.9')
    expect(seenFromAddress(req('172.18.0.3', 'not-an-address'), 1)).toBeNull()
    expect(seenFromAddress(req(undefined), 0)).toBeNull()
  })
})

describe('hq.seenFrom on the host link @SC-1758', () => {
  let h: Harness
  beforeEach(async () => {
    h = await startHarness()
    h.hosts.set('cred-a', { hostId: 'h1', fingerprint: 'a'.repeat(64), consoleFingerprint: 'm'.repeat(64) })
  })
  afterEach(() => h.close())

  it('is sent as the link opens, with the address behind hq\'s one trusted proxy', async () => {
    const a = hostLink(h, { Authorization: 'Bearer cred-a', 'X-Forwarded-For': '203.0.113.9' })
    await opened(a)
    expect((await a.next('hq.seenFrom')).payload).toEqual({ address: '203.0.113.9' })
  })

  it('is sent again on every new connection, with the address it comes from', async () => {
    const a = hostLink(h, { Authorization: 'Bearer cred-a', 'X-Forwarded-For': '203.0.113.9' })
    await opened(a)
    await a.next('hq.seenFrom')
    a.ws.close()
    await a.closed
    const b = hostLink(h, { Authorization: 'Bearer cred-a', 'X-Forwarded-For': '198.51.100.20' })
    await opened(b)
    expect((await b.next('hq.seenFrom')).payload).toEqual({ address: '198.51.100.20' })
  })

  it('is not sent to a connection hq refused', async () => {
    const a = hostLink(h, { Authorization: 'Bearer wrong', 'X-Forwarded-For': '203.0.113.9' })
    await expect(opened(a)).rejects.toThrow('refused 401')
  })
})
