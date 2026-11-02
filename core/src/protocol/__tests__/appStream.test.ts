import { describe, expect, it } from 'vitest'
import {
  APP_SERVE_REFUSALS, APP_WS_MAX_MESSAGE_BYTES, appRefusalHead, createAppResponseHeadReader, createAppWsReader,
  encodeAppResponseHead, encodeAppWsMessage, isAppRequestHead, type AppRequestHead,
} from '../appStream.js'
import {
  createBundleReadHeadReader, createBundleWriteHeadReader, encodeBundleReadHead, encodeBundleWriteHead,
} from '../branchBundles.js'
import { utf8 } from '../../host/crypto/webCrypto.js'

const get: AppRequestHead = { method: 'GET', target: '/src/main.tsx?v=1', headers: [['accept', '*/*'], ['sec-fetch-site', 'same-origin']] }

describe('a live app\'s request head @SC-1760', () => {
  it('accepts a request and a WebSocket as a browser sends them', () => {
    expect(isAppRequestHead(get)).toBe(true)
    expect(isAppRequestHead({ ...get, websocket: { protocols: ['vite-hmr'] } })).toBe(true)
  })

  it('refuses what could reach past the app or split a header', () => {
    for (const bad of [
      { ...get, target: 'http://169.254.169.254/' }, { ...get, target: '//evil.example/' }, { ...get, target: '/a b' },
      { ...get, method: 'GET /x' }, { ...get, headers: [['host', 'localhost:22']] }, { ...get, headers: [['x', 'a\r\nb: c']] },
      { ...get, headers: [['X-Upper', 'v']] }, { ...get, headers: [['connection', 'upgrade']] },
      { ...get, method: 'POST', websocket: { protocols: [] } }, { ...get, websocket: { protocols: ['a b'] } },
      { ...get, headers: Array.from({ length: 129 }, (_, i) => [`h${i}`, 'v']) },
    ]) expect(isAppRequestHead(bad), JSON.stringify(bad).slice(0, 80)).toBe(false)
  })
})

describe('a live app\'s answer head @SC-1760', () => {
  it('round-trips an answer and a refusal however the stream splits them', () => {
    const head = { status: 200, headers: [['content-type', 'text/html'], ['set-cookie', 'a=b']] as [string, string][] }
    const bytes = encodeAppResponseHead(head)
    const reader = createAppResponseHeadReader()
    expect(reader.push(bytes.subarray(0, 3)).state).toBe('need-more')
    const read = reader.push(new Uint8Array([...bytes.subarray(3), 1, 2]))
    expect(read).toMatchObject({ state: 'head', head, rest: new Uint8Array([1, 2]) })
    expect(createAppResponseHeadReader().push(encodeAppResponseHead(appRefusalHead('preview-not-running'))))
      .toMatchObject({ state: 'head', head: { refusal: 'preview-not-running', status: 409 } })
  })

  it('says 101 only for a WebSocket, and pins each refusal\'s status', () => {
    expect(() => encodeAppResponseHead({ status: 101, headers: [] })).toThrow()
    expect(() => encodeAppResponseHead({ status: 200, headers: [], websocket: { protocol: null } })).toThrow()
    expect(() => encodeAppResponseHead({ status: 101, headers: [], websocket: { protocol: 'vite-hmr' } })).not.toThrow()
    expect(() => encodeAppResponseHead({ status: 200, headers: [['transfer-encoding', 'chunked']] })).toThrow()
    expect(APP_SERVE_REFUSALS).toMatchObject({ 'ticket-invalid': 403, 'app-unreachable': 502, 'app-starting': 503 })
  })
})

describe('WebSocket messages on an app stream @SC-1760', () => {
  it('come out whole and in order however the stream splits them', () => {
    const bytes = new Uint8Array([
      ...encodeAppWsMessage({ kind: 'text', payload: utf8('{"type":"update"}') }),
      ...encodeAppWsMessage({ kind: 'binary', payload: new Uint8Array([0, 255]) }),
      ...encodeAppWsMessage({ kind: 'close', payload: new Uint8Array([0x03, 0xe8]) }),
    ])
    const reader = createAppWsReader()
    const kinds: string[] = []
    for (let i = 0; i < bytes.length; i += 3) {
      const read = reader.push(bytes.subarray(i, i + 3))
      if ('invalid' in read) throw new Error(read.invalid)
      kinds.push(...read.messages.map(m => m.kind))
    }
    expect(kinds).toEqual(['text', 'binary', 'close'])
  })

  it('refuses an unknown kind or a message past the largest, for good', () => {
    const reader = createAppWsReader()
    expect(reader.push(new Uint8Array([9, 0, 0, 0, 0]))).toHaveProperty('invalid')
    expect(reader.push(encodeAppWsMessage({ kind: 'text', payload: new Uint8Array(1) }))).toHaveProperty('invalid')
    const big = new Uint8Array(5)
    big[0] = 2
    new DataView(big.buffer).setUint32(1, APP_WS_MAX_MESSAGE_BYTES + 1)
    expect(createAppWsReader().push(big)).toHaveProperty('invalid')
  })
})

describe("a bundle's heads @SC-1760", () => {
  it('round-trip, and refuse a head that is not one', () => {
    expect(createBundleReadHeadReader().push(encodeBundleReadHead({ ok: true, size: 10 }))).toMatchObject({ state: 'head', head: { size: 10 } })
    const kept = { ok: true as const, sha256: 'a'.repeat(64), size: 3 }
    expect(createBundleWriteHeadReader().push(encodeBundleWriteHead(kept))).toMatchObject({ state: 'head', head: kept })
    expect(createBundleWriteHeadReader().push(encodeBundleWriteHead({ ok: false, refusal: 'hash-mismatch' })))
      .toMatchObject({ state: 'head', head: { refusal: 'hash-mismatch' } })
    expect(() => encodeBundleWriteHead({ ok: false, refusal: 'nope' as 'busy' })).toThrow()
    expect(() => encodeBundleReadHead({ ok: true, size: -1 })).toThrow()
  })
})
