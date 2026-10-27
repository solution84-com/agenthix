import { describe, expect, it } from 'vitest'
import { utf8 } from '../../host/crypto/webCrypto.js'
import {
  MAX_STREAM_HEAD_BYTES, createStreamHeadReader, encodeStreamHead, refusalHead, type FileServeHead,
} from '../streamHead.js'
import { parseByteRange } from '../byteRange.js'

const ok: FileServeHead = {
  status: 206, size: 5000, range: { start: 100, end: 199 }, contentType: 'application/pdf', purpose: 'preview',
  fileName: 'Q3 report — final.pdf',
}

const lengthPrefixed = (json: Uint8Array, declared = json.length) => {
  const out = new Uint8Array(4 + json.length)
  new DataView(out.buffer).setUint32(0, declared)
  out.set(json, 4)
  return out
}

describe('the stream head @SC-1462', () => {
  it('reads back what was written, with the bytes after it as the rest', () => {
    const bytes = new Uint8Array([...encodeStreamHead(ok), 1, 2, 3])
    expect(createStreamHeadReader().push(bytes)).toEqual({ state: 'head', head: ok, rest: new Uint8Array([1, 2, 3]) })
  })

  it('reads a head split into chunks at every byte, the length prefix included', () => {
    const bytes = new Uint8Array([...encodeStreamHead(ok), 9, 8])
    for (let cut = 1; cut < bytes.length; cut++) {
      const reader = createStreamHeadReader()
      const first = reader.push(bytes.subarray(0, cut))
      if (first.state === 'head') {
        expect(cut).toBeGreaterThanOrEqual(bytes.length - 2)
        continue
      }
      expect(first.state, `cut at ${cut}`).toBe('need-more')
      const second = reader.push(bytes.subarray(cut))
      expect(second, `cut at ${cut}`).toMatchObject({ state: 'head', head: ok })
    }
  })

  it('reads one byte at a time', () => {
    const bytes = encodeStreamHead(refusalHead('changed'))
    const reader = createStreamHeadReader()
    let last = reader.push(bytes.subarray(0, 1))
    for (let i = 1; i < bytes.length; i++) last = reader.push(bytes.subarray(i, i + 1))
    expect(last).toEqual({ state: 'head', head: { status: 409, refusal: 'changed' }, rest: new Uint8Array(0) })
  })

  it('gives each refusal its status', () => {
    expect(refusalHead('ticket-expired').status).toBe(403)
    expect(refusalHead('not-found').status).toBe(404)
    expect(refusalHead('range-not-satisfiable', 10)).toEqual({ status: 416, refusal: 'range-not-satisfiable', size: 10 })
    expect(refusalHead('busy').status).toBe(503)
  })

  it('refuses a declared length over the limit before reading it', () => {
    const reader = createStreamHeadReader()
    expect(reader.push(lengthPrefixed(new Uint8Array(0), MAX_STREAM_HEAD_BYTES + 1)).state).toBe('invalid')
    expect(createStreamHeadReader().push(new Uint8Array([0, 0, 0, 0])).state).toBe('invalid')
  })

  it('refuses a head that is not JSON, not UTF-8, or not a valid head', () => {
    const bad = [
      utf8('{nope'), new Uint8Array([0xff, 0xfe]), utf8('[]'),
      utf8(JSON.stringify({ status: 200, size: 1, contentType: 'x', purpose: 'diff', fileName: 'a' })),
      utf8(JSON.stringify({ status: 200, size: 1, range: { start: 0, end: 0 }, contentType: 'x', purpose: 'preview', fileName: 'a' })),
      utf8(JSON.stringify({ status: 206, size: 10, range: { start: 5, end: 10 }, contentType: 'x', purpose: 'preview', fileName: 'a' })),
      utf8(JSON.stringify({ status: 200, refusal: 'changed' })),
      utf8(JSON.stringify({ status: 403, refusal: 'whatever' })),
    ]
    for (const json of bad) expect(createStreamHeadReader().push(lengthPrefixed(json)).state).toBe('invalid')
  })

  it('is done once it has read a head', () => {
    const reader = createStreamHeadReader()
    reader.push(encodeStreamHead(ok))
    expect(reader.push(new Uint8Array([1])).state).toBe('invalid')
  })

  it('will not write a head that would not read back', () => {
    expect(() => encodeStreamHead({ ...ok, range: undefined })).toThrow()
    expect(() => encodeStreamHead({ ...ok, fileName: 'x'.repeat(MAX_STREAM_HEAD_BYTES) })).toThrow()
  })
})

describe('a Range header against the file\'s size @SC-1463', () => {
  it('serves one range of bytes', () => {
    expect(parseByteRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(parseByteRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseByteRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseByteRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseByteRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 })
  })

  it('answers unsatisfiable for a range past the end', () => {
    expect(parseByteRange('bytes=1000-', 1000)).toBe('unsatisfiable')
    expect(parseByteRange('bytes=-0', 1000)).toBe('unsatisfiable')
    expect(parseByteRange('bytes=0-', 0)).toBe('unsatisfiable')
  })

  it('ignores what it does not serve, so the whole file is sent', () => {
    for (const h of [undefined, '', 'bytes=0-1,5-6', 'items=0-1', 'bytes=5-1', 'bytes=-', 'bytes=a-b', `bytes=0-${'9'.repeat(80)}`]) {
      expect(parseByteRange(h, 1000), String(h)).toBeNull()
    }
  })
})
