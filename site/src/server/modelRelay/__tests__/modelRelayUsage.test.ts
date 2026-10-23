/**
 * The relay measures each call as it passes (models from one place, part 5), and reaches Agenthix Cloud's gateway
 * with hq's Cloud token: over real HTTP, in front of a stand-in provider on this machine.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'node:http'
import zlib from 'node:zlib'
import type { AddressInfo } from 'node:net'
import express from 'express'
import type { UsageReport } from '@agenthix/core'
import { createModelRelayHandler } from '../modelRelayApi'
import { issueRelayToken, pointRelayToken, resetRelayTokensForTests } from '../relayTokens'
import { resetGateRunsForTests } from '../../../agents/runtime/toolGateRuns'
import type { CloudTokenAnswer } from '../usageReportClient'
import type { RelayCredential } from '../runAccess'

type Seen = { url: string; headers: http.IncomingHttpHeaders }

let provider: http.Server
let providerUrl: string
let relay: http.Server
let relayUrl: string
let seen: Seen[] = []
let reports: UsageReport[] = []
let answer: (res: http.ServerResponse) => void
let cloudAnswer: CloudTokenAnswer = { ok: true, token: { token: 'cloud-token-fake', expiresAt: Date.now() + 3_600_000 } }

const ANTHROPIC: RelayCredential = { kind: 'apiKey', providerId: 'prov-ant', provider: 'anthropic', apiKey: 'sk-test-fake' }
const LEGACY: RelayCredential = { kind: 'apiKey', provider: 'google', apiKey: 'g-test-fake' }
let CLOUD: RelayCredential

function listen(server: http.Server): Promise<string> {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)))
}

/** Waits for the reports the relay sends once each answer has ended. */
async function reported(n: number): Promise<UsageReport[]> {
  for (let i = 0; i < 100 && reports.length < n; i++) await new Promise(r => setTimeout(r, 10))
  return reports
}

beforeAll(async () => {
  provider = http.createServer((req, res) => {
    seen.push({ url: req.url!, headers: req.headers })
    req.resume()
    req.on('end', () => answer(res))
  })
  providerUrl = await listen(provider)
  CLOUD = { kind: 'cloud', providerId: 'prov-cloud', provider: 'anthropic', baseUrl: `${providerUrl}/gateway/anthropic` }
  const handler = createModelRelayHandler({
    checkSource: async () => true,
    // The stand-in speaks plain HTTP; the real check holds Cloud's gateway to HTTPS (relayProviders.test.ts).
    upstreamBase: c => (c.kind === 'cloud' ? c.baseUrl : `${providerUrl}/${c.provider}`),
    log: () => {},
    cloudToken: async () => cloudAnswer,
    report: r => { reports.push(r) },
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
  reports = []
  cloudAnswer = { ok: true, token: { token: 'cloud-token-fake', expiresAt: Date.now() + 3_600_000 } }
  token = issueRelayToken('c1', 'conv-1')
})

const post = (path: string, headers: Record<string, string> = {}) =>
  fetch(`${relayUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-agenthix-turn': token, ...headers }, body: '{"model":"claude-sonnet-5","stream":true}' })

const stream = 'data: {"type":"message_start","message":{"usage":{"input_tokens":12,"output_tokens":1}}}\n\n' +
  'data: {"type":"message_delta","usage":{"output_tokens":40}}\n\n'

describe('each call through the relay is reported', () => {
  it('with its usage, read from the streamed answer, which reaches the harness unchanged', async () => {
    pointRelayToken(token, 'run-1', [ANTHROPIC], 'bp-1')
    answer = res => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(stream) }
    const res = await post('/anthropic/v1/messages')
    expect(await res.text()).toBe(stream)
    const [report] = await reported(1)
    expect(report).toMatchObject({
      runId: 'run-1', providerId: 'prov-ant', model: 'claude-sonnet-5', upstreamStatus: 200,
      usage: { inputTokens: 12, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 },
    })
    expect(report.errorKind).toBeUndefined()
  })

  it('with usage read from a compressed answer, passed on still compressed', async () => {
    pointRelayToken(token, 'run-1', [ANTHROPIC])
    const body = zlib.gzipSync(Buffer.from(JSON.stringify({ type: 'message', usage: { input_tokens: 3, output_tokens: 2 } })))
    answer = res => { res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' }); res.end(body) }
    const res = await fetch(`${relayUrl}/anthropic/v1/messages`, { method: 'POST', headers: { 'x-agenthix-turn': token }, body: '{}' })
    expect(res.headers.get('content-encoding')).toBe('gzip')
    expect((await reported(1))[0].usage).toEqual({ inputTokens: 3, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 })
  })

  it('with the upstream status and the kind of failure, so hq sees a refused key', async () => {
    pointRelayToken(token, 'run-1', [ANTHROPIC])
    answer = res => { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":{"type":"authentication_error"}}') }
    expect((await post('/anthropic/v1/messages')).status).toBe(401)
    expect((await reported(1))[0]).toMatchObject({ upstreamStatus: 401, errorKind: 'auth', usage: null })
  })

  it('makes a call id for every upstream call', async () => {
    pointRelayToken(token, 'run-1', [ANTHROPIC])
    answer = res => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(stream) }
    await (await post('/anthropic/v1/messages')).text()
    await (await post('/anthropic/v1/messages')).text()
    const [a, b] = await reported(2)
    expect(a.callId).not.toBe(b.callId)
  })

  it('not at all for a run from an hq that named no provider', async () => {
    pointRelayToken(token, 'run-1', [LEGACY])
    await (await post('/google/models/gemini:generateContent')).text()
    await new Promise(r => setTimeout(r, 50))
    expect(seen).toHaveLength(1)
    expect(reports).toEqual([])
  })
})

describe('Agenthix Cloud through the relay', () => {
  it("presents hq's Cloud token, never a call id or billing profile the harness sent", async () => {
    pointRelayToken(token, 'run-1', [CLOUD], 'bp-1')
    answer = res => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(stream) }
    await (await post('/anthropic/v1/messages', { 'x-call-id': 'chosen-by-harness', 'x-billing-profile-id': 'someone-elses' })).text()
    expect(seen[0].url).toBe('/gateway/anthropic/v1/messages')
    expect(seen[0].headers['x-api-key']).toBe('cloud-token-fake')
    expect(seen[0].headers['x-call-id']).not.toBe('chosen-by-harness')
    expect(seen[0].headers['x-billing-profile-id']).not.toBe('someone-elses')
    const [report] = await reported(1)
    expect(report.providerId).toBe('prov-cloud')
    // In a test run `usageBilling` is on (core's feature flags), so the gateway is told the call and its profile.
    expect(seen[0].headers['x-call-id']).toBe(report.callId)
    expect(seen[0].headers['x-billing-profile-id']).toBe('bp-1')
  })

  it('refuses the call, without reaching the gateway, while hq has no Cloud token to give', async () => {
    pointRelayToken(token, 'run-1', [CLOUD])
    cloudAnswer = { ok: false, refusal: 'not_available' }
    const res = await post('/anthropic/v1/messages')
    expect(res.status).toBe(503)
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain('not_available')
    expect(seen).toEqual([])
  })
})
