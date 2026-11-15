/**
 * The model relay over real HTTP (spec §6): mounted as `main.ts` mounts it —
 * the route's pattern and no body parser — in front of a stand-in provider on
 * this machine.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { createModelRelayHandler } from '../modelRelayApi'
import type { RelayApiKeyCredential, RelayCredential } from '../runAccess'
import { clearRelayTurn, issueRelayToken, pointRelayToken, resetRelayTokensForTests, revokeRelayToken } from '../relayTokens'
import { resetGateRunsForTests, stopGateRun } from '../../../agents/runtime/toolGateRuns'

type Refusal = { error: { type: string; message: string } }

type Seen = { method: string; url: string; headers: http.IncomingHttpHeaders; body: Buffer; closedEarly: boolean }

let provider: http.Server
let providerUrl: string
let relay: http.Server
let relayUrl: string
let seen: Seen[] = []
let answer: (req: http.IncomingMessage, res: http.ServerResponse) => void
const logs: string[] = []
const source = { ok: true }

const KEYS: Record<string, RelayApiKeyCredential> = {
  anthropic: { kind: 'apiKey', provider: 'anthropic', apiKey: 'sk-ant-REAL' },
  google: { kind: 'apiKey', provider: 'google', apiKey: 'g-REAL' },
  openai_compatible: { kind: 'apiKey', provider: 'openai_compatible', apiKey: 'sk-compat-REAL', baseUrl: '' },
}

function listen(server: http.Server): Promise<string> {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)))
}

/** Every relayed provider's upstream is the stand-in, under a path of its own, so the test sees what each would receive. */
function standinUpstream(credential: RelayCredential): string | null {
  if (credential.kind === 'apiKey' && credential.provider === 'openai_compatible') return credential.baseUrl ?? null
  return `${providerUrl}/${credential.provider}`
}

beforeAll(async () => {
  provider = http.createServer((req, res) => {
    const record: Seen = { method: req.method!, url: req.url!, headers: req.headers, body: Buffer.alloc(0), closedEarly: false }
    seen.push(record)
    const chunks: Buffer[] = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      record.body = Buffer.concat(chunks)
      answer(req, res)
    })
    res.on('close', () => { if (!res.writableFinished) record.closedEarly = true })
  })
  providerUrl = await listen(provider)
  KEYS.openai_compatible = { ...KEYS.openai_compatible, baseUrl: `${providerUrl}/compat/v1` }

  const handler = createModelRelayHandler({
    checkSource: async () => source.ok,
    upstreamBase: standinUpstream,
    log: line => logs.push(line),
  })
  const app = express()
  app.all('/api/v1/model-relay/:provider{/*rest}', (req, res) => { void handler(req, res) })
  relay = http.createServer(app)
  relayUrl = `${await listen(relay)}/api/v1/model-relay`
})

afterAll(async () => {
  relay.closeAllConnections()
  provider.closeAllConnections()
  await Promise.all([new Promise(r => relay.close(r)), new Promise(r => provider.close(r))])
})

let token: string
beforeEach(() => {
  resetRelayTokensForTests()
  resetGateRunsForTests()
  seen = []
  logs.length = 0
  source.ok = true
  answer = (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}') }
  token = issueRelayToken('c1', 'conv-1')
  pointRelayToken(token, 'run-1', [KEYS.anthropic, KEYS.openai_compatible])
})

const post = (path: string, headers: Record<string, string>, body = '{"model":"m1","messages":[]}') =>
  fetch(`${relayUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body })

describe('refusals, which never reach the provider @SC-1222', () => {
  it('refuses a request with no relay token, or one naming no turn', async () => {
    const attempts: Array<Record<string, string>> = [{}, { 'x-agenthix-turn': 'unknown' }, { 'x-api-key': 'agenthix-key-arrives-with-each-request' }]
    for (const headers of attempts) {
      const res = await post('/anthropic/v1/messages', headers)
      expect(res.status).toBe(401)
      expect((await res.json() as Refusal).error.type).toBe('agenthix_relay')
    }
    expect(seen).toEqual([])
  })

  it("refuses between turns and once the run is stopped with a 403, which Claude Code does not answer by spending its key's ticket", async () => {
    clearRelayTurn(token, 'run-1')
    expect((await post('/anthropic/v1/messages', { 'x-agenthix-turn': token })).status).toBe(403)
    pointRelayToken(token, 'run-2', [KEYS.anthropic])
    stopGateRun('run-2')
    expect((await post('/anthropic/v1/messages', { 'x-api-key': token })).status).toBe(403)
    revokeRelayToken(token)
    expect((await post('/anthropic/v1/messages', { 'x-api-key': token })).status).toBe(401)
    expect(seen).toEqual([])
  })

  it("refuses a request from outside its turn's container", async () => {
    source.ok = false
    expect((await post('/anthropic/v1/messages', { 'x-agenthix-turn': token })).status).toBe(403)
    expect(seen).toEqual([])
  })

  it('refuses a provider the turn has no credential for, naming it', async () => {
    const res = await post('/google/models/gemini-2.5-flash:streamGenerateContent', { 'x-agenthix-turn': token })
    expect(res.status).toBe(403)
    expect((await res.json() as Refusal).error.message).toMatch(/no google credential/)
    expect(seen).toEqual([])
  })

  it('refuses a path that climbs out of the upstream, and a provider it does not relay', async () => {
    // Sent as written: fetch would resolve the dot segments before sending.
    const raw = (path: string) => new Promise<number>((resolve, reject) => {
      const { hostname, port, pathname } = new URL(relayUrl)
      const req = http.request({ hostname, port, path: `${pathname}${path}`, method: 'POST', headers: { 'x-agenthix-turn': token } }, res => {
        res.resume()
        resolve(res.statusCode!)
      })
      req.on('error', reject)
      req.end('{}')
    })
    for (const path of ['/anthropic/v1/../../admin', '/anthropic/v1/%2e%2e/%2e%2e/admin', '/anthropic/v1/a%2fb', '/openai_compatible/%2E%2E', '/openai_compatible/.']) {
      expect(await raw(path), path).toBe(400)
    }
    expect((await post('/mystery/v1/x', { 'x-agenthix-turn': token })).status).toBe(404)
    expect(seen).toEqual([])
  })

  it("answers a bare GET or HEAD of a provider's base itself, with no token", async () => {
    for (const path of ['/anthropic', '/anthropic/']) {
      expect((await fetch(`${relayUrl}${path}`)).status).toBe(200)
      expect((await fetch(`${relayUrl}${path}`, { method: 'HEAD' })).status).toBe(200)
    }
    expect(seen).toEqual([])
  })
})

describe('what the provider receives @SC-1223', () => {
  it("the request as sent, with only the turn's key in the provider's own header", async () => {
    const res = await post('/anthropic/v1/messages?beta=true', {
      'x-agenthix-turn': token,
      'x-api-key': 'agenthix-key-arrives-with-each-request',
      authorization: 'Bearer agenthix-key-arrives-with-each-request',
      'anthropic-beta': 'fine-grained-tool-streaming-2025-05-14',
      'anthropic-version': '2023-06-01',
    })
    expect(res.status).toBe(200)
    const [request] = seen
    expect(request.method).toBe('POST')
    expect(request.url).toBe('/anthropic/v1/messages?beta=true')
    expect(request.headers['x-api-key']).toBe('sk-ant-REAL')
    expect(request.headers.authorization).toBeUndefined()
    expect(request.headers['x-agenthix-turn']).toBeUndefined()
    expect(request.headers['anthropic-beta']).toBe('fine-grained-tool-streaming-2025-05-14')
    expect(request.headers['anthropic-version']).toBe('2023-06-01')
    expect(JSON.parse(request.body.toString())).toEqual({ model: 'm1', messages: [] })
  })

  it("Claude Code's request, carrying the token as its key", async () => {
    await post('/anthropic/v1/messages', { 'x-api-key': token, authorization: `Bearer ${token}` })
    expect(seen[0].headers['x-api-key']).toBe('sk-ant-REAL')
    expect(seen[0].headers.authorization).toBeUndefined()
  })

  it("a compatible endpoint's request, at its credential's own address", async () => {
    await post('/openai_compatible/chat/completions', { 'x-agenthix-turn': token, authorization: 'Bearer placeholder' })
    expect(seen[0].url).toBe('/compat/v1/chat/completions')
    expect(seen[0].headers.authorization).toBe('Bearer sk-compat-REAL')
  })

  it('a body of several megabytes, unparsed and byte for byte, whatever its type says', async () => {
    const body = JSON.stringify({ model: 'm1', image: 'x'.repeat(3 * 1024 * 1024) })
    expect((await post('/anthropic/v1/messages', { 'x-agenthix-turn': token }, body)).status).toBe(200)
    expect(seen[0].body.toString()).toBe(body)
    const form = await fetch(`${relayUrl}/anthropic/v1/x`, {
      method: 'POST', headers: { 'x-agenthix-turn': token, 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=1&b=2',
    })
    expect(form.status).toBe(200)
    expect(seen[1].body.toString()).toBe('a=1&b=2')
  })
})

describe('what the harness receives @SC-1224', () => {
  it("the provider's status and headers, retry-after included, so its own retry works", async () => {
    answer = (_req, res) => {
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '1', 'x-ratelimit-remaining-requests': '0' })
      res.end('{"error":"rate limited"}')
    }
    const res = await post('/anthropic/v1/messages', { 'x-agenthix-turn': token })
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('1')
    expect(res.headers.get('x-ratelimit-remaining-requests')).toBe('0')
    expect(await res.text()).toBe('{"error":"rate limited"}')
  })

  it('each streamed chunk as it comes, not the whole answer at its end', async () => {
    let release!: () => void
    const held = new Promise<void>(r => { release = r })
    answer = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: first\n\n')
      void held.then(() => res.end('data: [DONE]\n\n'))
    }
    const res = await post('/anthropic/v1/messages', { 'x-agenthix-turn': token })
    const reader = res.body!.getReader()
    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toBe('data: first\n\n')
    release()
    let rest = ''
    for (let next = await reader.read(); !next.done; next = await reader.read()) rest += new TextDecoder().decode(next.value)
    expect(rest).toBe('data: [DONE]\n\n')
  })

  it('a 502 when the provider cannot be reached', async () => {
    const closed = http.createServer()
    const closedUrl = await listen(closed)
    await new Promise(r => closed.close(r))
    pointRelayToken(token, 'run-1', [{ kind: 'apiKey', provider: 'openai_compatible', apiKey: '', baseUrl: `${closedUrl}/v1` }])
    const res = await post('/openai_compatible/chat/completions', { 'x-agenthix-turn': token })
    expect(res.status).toBe(502)
    expect((await res.json() as Refusal).error.message).toMatch(/could not be reached/)
  })
})

describe('ending a request early @SC-1224', () => {
  const streamForever = () => {
    answer = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: first\n\n')
    }
  }

  it("aborts the provider's request when the harness closes its own", async () => {
    streamForever()
    const res = await post('/anthropic/v1/messages', { 'x-agenthix-turn': token })
    const reader = res.body!.getReader()
    await reader.read()
    await reader.cancel()
    await vi.waitFor(() => expect(seen[0].closedEarly).toBe(true), { timeout: 5_000 })
    await vi.waitFor(() => expect(logs.at(-1)).toMatch(/outcome=client-closed/), { timeout: 5_000 })
  })

  it("cuts off a request still streaming when its turn ends", async () => {
    streamForever()
    const res = await post('/anthropic/v1/messages', { 'x-agenthix-turn': token })
    const reader = res.body!.getReader()
    await reader.read()
    clearRelayTurn(token, 'run-1')
    await expect((async () => { for (;;) if ((await reader.read()).done) return 'ended' })()).rejects.toThrow()
    await vi.waitFor(() => expect(seen[0].closedEarly).toBe(true), { timeout: 5_000 })
  })
})

describe('the log @SC-1225', () => {
  it('has one line per request naming the conversation, run, provider, model, status, bytes and timings — never a key, token or body', async () => {
    await post('/anthropic/v1/messages', { 'x-agenthix-turn': token }, '{"model":"claude-sonnet-4-6","messages":[{"content":"SECRET-PROMPT"}]}')
    await vi.waitFor(() => expect(logs.length).toBe(1))
    const line = logs[0]
    expect(line).toMatch(/^conversation=conv-1 run=run-1 provider=anthropic model=claude-sonnet-4-6 method=POST status=200 bytesIn=\d+ bytesOut=11 msHeaders=[\d.]+ msFirstByte=[\d.]+ msTotal=[\d.]+ proxy=none outcome=done$/)
    for (const secret of [token, 'sk-ant-REAL', 'SECRET-PROMPT']) expect(line).not.toContain(secret)
  })
})
