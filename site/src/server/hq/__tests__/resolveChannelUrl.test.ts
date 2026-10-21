import { describe, it, expect } from 'vitest'
import { HQ_SITE_CHANNEL_PATH } from '@agenthix/core'
import { resolveChannelUrl, resolveContentUrl } from '../resolveChannelUrl'

describe('reaching the control channel @SC-290', () => {
  it('adds the channel path to a bare origin stored before hq sent one', () => {
    expect(resolveChannelUrl('ws://localhost:4101')).toBe(`ws://localhost:4101${HQ_SITE_CHANNEL_PATH}`)
    expect(resolveChannelUrl('wss://hq.example.com/')).toBe(`wss://hq.example.com${HQ_SITE_CHANNEL_PATH}`)
  })

  it('leaves a url that already names a path alone', () => {
    // hq may put the channel behind a proxy prefix later; that choice is hq's,
    // and a client that rewrote it would quietly override it.
    expect(resolveChannelUrl('wss://hq.example.com/hq-link')).toBe('wss://hq.example.com/hq-link')
    expect(resolveChannelUrl('wss://hq.example.com/edge/hq-link')).toBe('wss://hq.example.com/edge/hq-link')
  })

  it('returns null for a value that is not a url, rather than dialling nonsense', () => {
    expect(resolveChannelUrl('not a url')).toBeNull()
    expect(resolveChannelUrl('')).toBeNull()
  })
})

describe('resolveContentUrl', () => {
  it('points at the content path beside a stored control-channel url', () => {
    expect(resolveContentUrl('wss://hq.example.com/hq-link')).toBe('wss://hq.example.com/hq-content')
  })
  it('points at the content path for a bare origin', () => {
    expect(resolveContentUrl('wss://hq.example.com')).toBe('wss://hq.example.com/hq-content')
  })
  it('keeps a proxy prefix, replacing only the last segment', () => {
    expect(resolveContentUrl('wss://example.com/agenthix/hq-link')).toBe('wss://example.com/agenthix/hq-content')
  })
  it('returns null for an unusable url', () => {
    expect(resolveContentUrl('not a url')).toBeNull()
  })
})
