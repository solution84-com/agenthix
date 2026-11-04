import { describe, it, expect } from 'vitest'
import {
  CONTENT_LINK_MAX_MESSAGE_BYTES, HQ_SITE_CONTENT_PATH, MAX_CHUNK_BYTES, MAX_STREAM_WINDOW_BYTES, STREAM_CREDIT_STEP_BYTES, STREAM_INITIAL_WINDOW_BYTES,
  encodeControlFrame, parseControlFrame,
  encodeDataFrame, decodeDataFrame, chunkPayload,
} from '../content.js'
import { HQ_SITE_CHANNEL_PATH } from '../connection.js'

describe('content transport path', () => {
  it('is its own path, never the control channel\'s', () => {
    expect(HQ_SITE_CONTENT_PATH).toBe('/hq-content')
    expect(HQ_SITE_CONTENT_PATH).not.toBe(HQ_SITE_CHANNEL_PATH)
  })
})

describe('control frames', () => {
  it('round-trips every frame type', () => {
    const frames = [
      { t: 'open', id: 1, method: 'files.read', params: { path: 'a.md' } },
      { t: 'accept', id: 1 },
      { t: 'end', id: 1 },
      { t: 'error', id: 1, code: 'handler_failed', message: 'boom' },
      { t: 'cancel', id: 1 },
      { t: 'open', id: 2, method: 'files.serve', params: {}, window: 1024 },
      { t: 'open', id: 3, method: 'files.serve', params: {}, window: 0 },
      { t: 'credit', id: 2, bytes: 4096 },
      { t: 'credit', id: 2, bytes: MAX_STREAM_WINDOW_BYTES },
    ] as const
    for (const frame of frames) {
      expect(parseControlFrame(encodeControlFrame(frame))).toEqual(frame)
    }
  })

  it.each([
    ['not json', 'nope'],
    ['an array', '[]'],
    ['an unknown type', JSON.stringify({ t: 'relay', id: 1 })],
    ['a missing id', JSON.stringify({ t: 'end' })],
    ['a negative id', JSON.stringify({ t: 'end', id: -1 })],
    ['a non-integer id', JSON.stringify({ t: 'end', id: 1.5 })],
    ['an id beyond uint32', JSON.stringify({ t: 'end', id: 2 ** 32 })],
    ['an open with no method', JSON.stringify({ t: 'open', id: 1, params: {} })],
    ['an error with an unknown code', JSON.stringify({ t: 'error', id: 1, code: 'whatever', message: 'x' })],
    ['an open with a negative window', JSON.stringify({ t: 'open', id: 1, method: 'm', params: {}, window: -1 })],
    ['an open with a fractional window', JSON.stringify({ t: 'open', id: 1, method: 'm', params: {}, window: 1.5 })],
    ['an open with a window past the largest', JSON.stringify({ t: 'open', id: 1, method: 'm', params: {}, window: 2 ** 31 })],
    ['an open with a window that is not a number', JSON.stringify({ t: 'open', id: 1, method: 'm', params: {}, window: '9' })],
    ['a credit of nothing', JSON.stringify({ t: 'credit', id: 1, bytes: 0 })],
    ['a negative credit', JSON.stringify({ t: 'credit', id: 1, bytes: -5 })],
    ['a fractional credit', JSON.stringify({ t: 'credit', id: 1, bytes: 2.5 })],
    ['a credit past the largest window', JSON.stringify({ t: 'credit', id: 1, bytes: 2 ** 31 })],
    ['a credit with no bytes', JSON.stringify({ t: 'credit', id: 1 })],
  ])('rejects %s', (_label, text) => {
    expect(parseControlFrame(text)).toBeNull()
  })
})

describe('stream windows @SC-1464', () => {
  it('keeps the credit step well under the initial window, so batched credit can never leave a writer waiting', () => {
    expect(STREAM_CREDIT_STEP_BYTES).toBeLessThan(STREAM_INITIAL_WINDOW_BYTES)
    expect(STREAM_INITIAL_WINDOW_BYTES).toBeGreaterThanOrEqual(MAX_CHUNK_BYTES)
    expect(MAX_STREAM_WINDOW_BYTES).toBe(2 ** 31 - 1)
  })
})

describe('data frames', () => {
  it('round-trips an id and its payload', () => {
    const payload = new Uint8Array([1, 2, 3, 250])
    const decoded = decodeDataFrame(encodeDataFrame(7, payload))
    expect(decoded?.id).toBe(7)
    expect(Array.from(decoded!.payload)).toEqual([1, 2, 3, 250])
  })

  it('carries the largest stream id', () => {
    expect(decodeDataFrame(encodeDataFrame(2 ** 32 - 1, new Uint8Array([9])))?.id).toBe(2 ** 32 - 1)
  })

  it('round-trips an empty payload', () => {
    expect(decodeDataFrame(encodeDataFrame(3, new Uint8Array()))?.payload.length).toBe(0)
  })

  it('rejects a frame too short to hold an id', () => {
    expect(decodeDataFrame(new Uint8Array([0, 0, 1]))).toBeNull()
  })

  it('refuses to encode a payload over the chunk limit', () => {
    expect(() => encodeDataFrame(1, new Uint8Array(MAX_CHUNK_BYTES + 1))).toThrow(/chunk/i)
  })

  it('has a message limit that holds the largest data frame, and nothing like the library default', () => {
    expect(encodeDataFrame(0xffffffff, new Uint8Array(MAX_CHUNK_BYTES)).length).toBeLessThanOrEqual(CONTENT_LINK_MAX_MESSAGE_BYTES)
    expect(CONTENT_LINK_MAX_MESSAGE_BYTES).toBeLessThan(1024 * 1024)
  })

  it('reads the id from the frame\'s own offset when it is a view into a larger buffer', () => {
    const encoded = encodeDataFrame(42, new Uint8Array([5, 6]))
    const backing = new Uint8Array(encoded.length + 10)
    backing.set(encoded, 10)
    const view = backing.subarray(10)
    expect(decodeDataFrame(view)?.id).toBe(42)
  })
})

describe('chunkPayload', () => {
  it('splits a payload into pieces no larger than the limit, preserving every byte in order', () => {
    const payload = new Uint8Array(MAX_CHUNK_BYTES * 2 + 5).map((_, i) => i % 256)
    const chunks = chunkPayload(payload)
    expect(chunks.map(c => c.length)).toEqual([MAX_CHUNK_BYTES, MAX_CHUNK_BYTES, 5])
    const joined = new Uint8Array(payload.length)
    let offset = 0
    for (const c of chunks) { joined.set(c, offset); offset += c.length }
    expect(joined).toEqual(payload)
  })

  it('returns no chunks for an empty payload', () => {
    expect(chunkPayload(new Uint8Array())).toEqual([])
  })
})
