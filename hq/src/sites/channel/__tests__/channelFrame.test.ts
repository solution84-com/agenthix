import { describe, it, expect } from 'vitest'
import { readChannelFrame } from '../channelFrame'

describe('readChannelFrame @SC-291', () => {
  it('reads a frame that keeps to the protocol', () => {
    const frame = { version: '1.12', type: 'channel.response', siteId: 's1', replyTo: '3', payload: { ok: 1 } }
    expect(readChannelFrame(JSON.stringify(frame))).toEqual(frame)
  })

  it('reads none of the malformed frames a site might send', () => {
    for (const text of ['', 'not json', 'null', '7', '"x"', '[]', 'true', '{}', '{"version":1}',
      '{"version":{},"type":"pong","siteId":"s1"}', '{"version":"1.12","type":7,"siteId":"s1"}',
      '{"version":"1.12","type":"pong"}', '{"version":"1.12","type":"pong","siteId":["s1"]}',
      '{"version":"1.12","type":"channel.error","siteId":"s1","replyTo":1}',
      '{"version":"1.12","type":"channel.request","siteId":"s1","requestId":{}}']) {
      expect(readChannelFrame(text), text).toBeNull()
    }
  })
})
