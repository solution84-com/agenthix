/**
 * No frame a machine sends can stop hq: a socket on the host link listens for 'error' from the moment it opens, on
 * every path, including a join that has already ended and is being closed.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HOST_JOIN_LOOKUP_HEADER } from '@agenthix/core'
import { LINK_MAX_PAYLOAD_BYTES } from '../frames'
import type { RelayPeer } from '../relayHub'
import { hostLink, opened, startHarness, type Client, type Harness } from './relayHarness'

let h: Harness
beforeEach(async () => { h = await startHarness() })
afterEach(async () => { await h.close() })

const lookup = 'c'.repeat(64)
const peer: RelayPeer = { hostId: 'h1', fingerprint: 'f'.repeat(43), consoleFingerprint: 'g'.repeat(43) }
const badFrames: [string, (c: Client) => void][] = [
  ['a text frame that is not UTF-8', c => c.ws.send(Buffer.from([0xff, 0xfe, 0xfd]), { binary: false })],
  ['a frame over the link’s limit', c => c.ws.send('x'.repeat(LINK_MAX_PAYLOAD_BYTES + 1))],
]

describe('the host link and a malformed frame @SC-1127', () => {
  for (const [what, sendBad] of badFrames) {
    it(`closes a refused join that sends ${what}, and hq goes on`, async () => {
      h.joins.set(lookup, { ok: false, reason: 'used' })
      const c = hostLink(h, { [HOST_JOIN_LOOKUP_HEADER]: lookup })
      c.ws.once('open', () => sendBad(c))
      await opened(c)
      await c.closed
      // hq still answers: an unlistened 'error' would have thrown out of the server.
      h.hosts.set('cred', peer)
      const next = hostLink(h, { Authorization: 'Bearer cred' })
      await opened(next)
      next.ws.close()
    })

    it(`closes a host's link that sends ${what}`, async () => {
      h.hosts.set('cred', peer)
      const c = hostLink(h, { Authorization: 'Bearer cred' })
      await opened(c)
      sendBad(c)
      expect(await c.closed).not.toBe(1000)
    })
  }
})
