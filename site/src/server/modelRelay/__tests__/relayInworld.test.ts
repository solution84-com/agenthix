/**
 * Inworld through the model relay: its fixed upstream, the key as a Bearer token (Inworld refuses `x-api-key`), and a run's
 * usage reported against its provider. Over real HTTP in front of a stand-in provider on this machine; the real upstream is checked, never called.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import type { RunProviderDescriptor, UsageReport } from '@agenthix/core'
import { createModelRelayHandler } from '../modelRelayApi'
import { issueRelayToken, pointRelayToken, resetRelayTokensForTests } from '../relayTokens'
import { resetGateRunsForTests } from '../../../agents/runtime/toolGateRuns'
import { RELAY_PROVIDERS, providerKeyHeaders, upstreamBase } from '../relayProviders'
import { relayedPath, upstreamUrl } from '../relayRequest'
import { runAccessOf, siteCredentialOf, type RelayApiKeyCredential, type RelayCredential } from '../runAccess'
import { usageApiFor } from '../usageReader'

const INWORLD_UPSTREAM = 'https://api.inworld.ai/v1'
const REAL_KEY = 'iw-REAL-KEY-never-in-a-container'
const INWORLD: RelayApiKeyCredential = { kind: 'apiKey', providerId: 'prov-iw', provider: 'inworld', apiKey: REAL_KEY }
const NO_SWITCHES = {}

describe("Inworld's upstream and key, as the relay adds them @SC-1865", () => {
  it('is fixed in code, whatever the credential carries', () => {
    expect(upstreamBase(INWORLD)).toBe(INWORLD_UPSTREAM)
    // A descriptor never carries an address for Inworld (dispatchParams refuses one); even so, it is not used.
    expect(upstreamBase({ ...INWORLD, baseUrl: 'https://attacker.example/v1' })).toBe(INWORLD_UPSTREAM)
  })

  it('stays on that origin and under /v1 for any path a harness sends', () => {
    const prefix = '/api/v1/model-relay/inworld'
    const paths = [
      '/chat/completions', '//attacker.example/v1/chat/completions', '/@attacker.example/x', '/https://attacker.example/v1',
      '/chat/completions?url=https://attacker.example', '/:443@attacker.example/x',
    ]
    for (const p of paths) {
      const relayed = relayedPath(prefix + p, prefix)
      const url = relayed ? upstreamUrl(INWORLD_UPSTREAM, relayed) : null
      if (url) {
        expect(url.origin, p).toBe('https://api.inworld.ai')
        expect(url.pathname.startsWith('/v1/'), p).toBe(true)
      }
    }
    for (const p of ['/../x', '/%2e%2e/x', '/a%2fb', '/a\\b', '/#x']) expect(relayedPath(prefix + p, prefix), p).toBeNull()
  })

  it('presents the key as a Bearer token, never in x-api-key', () => {
    expect(providerKeyHeaders(INWORLD)).toEqual({ authorization: `Bearer ${REAL_KEY}` })
    expect(providerKeyHeaders({ ...INWORLD, provider: 'anthropic' })).toEqual({ 'x-api-key': REAL_KEY })
  })

  it('reads usage from the OpenAI-format answer', () => {
    expect(usageApiFor('inworld')).toBe('openai')
  })

  it('has a header and a usage format for every relayed provider (the switches are exhaustive)', () => {
    for (const provider of RELAY_PROVIDERS) {
      const credential = { kind: 'apiKey' as const, provider, apiKey: 'k', ...(provider === 'openai_compatible' ? { baseUrl: 'http://x/v1' } : {}) }
      expect(Object.keys(providerKeyHeaders(credential))).toHaveLength(1)
      expect(['anthropic', 'openai', 'google']).toContain(usageApiFor(provider))
      expect(upstreamBase(credential)).toMatch(/^https?:\/\//)
    }
  })
})

describe("a run's Inworld descriptor, as the site reads it", () => {
  const descriptor: RunProviderDescriptor = { kind: 'api_key', providerId: 'prov-iw', vendor: 'inworld', apiKey: REAL_KEY }

  it('resolves to a credential the relay uses', () => {
    expect(siteCredentialOf(descriptor)).toEqual(INWORLD)
    const run = runAccessOf({ modelAccess: { model: { providerId: 'prov-iw', model: 'anthropic/claude-sonnet-5' }, provider: descriptor, others: [], billingProfileId: '' }, credential: null })
    expect(run.credential).toEqual(INWORLD)
  })

  it('still gives nothing for a speech-only vendor or one the site does not know', () => {
    expect(siteCredentialOf({ ...descriptor, vendor: 'assemblyai' })).toBeNull()
    // A vendor from a newer hq that this site's types do not list.
    expect(siteCredentialOf({ ...descriptor, vendor: 'mystery' as unknown as 'openai' })).toBeNull()
  })
})

describe('an Inworld request through the relay @SC-1865', () => {
  type Seen = { url: string; headers: http.IncomingHttpHeaders }
  let provider: http.Server
  let providerUrl: string
  let relay: http.Server
  let relayUrl: string
  let seen: Seen[] = []
  let reports: UsageReport[] = []
  let token: string

  const listen = (server: http.Server) =>
    new Promise<string>(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)))

  beforeAll(async () => {
    provider = http.createServer((req, res) => {
      seen.push({ url: req.url!, headers: req.headers })
      req.resume()
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        // The shape measured from Inworld: the usage in the last chunk, then [DONE] (findings §2).
        res.end(
          'data: {"id":"c","choices":[{"delta":{"content":"ok"}}]}\n\n' +
          'data: {"id":"c","choices":[],"usage":{"prompt_tokens":12,"completion_tokens":3,"prompt_tokens_details":{"cached_tokens":2}}}\n\n' +
          'data: [DONE]\n\n',
        )
      })
    })
    providerUrl = await listen(provider)
    const handler = createModelRelayHandler({
      checkSource: async () => true,
      // The real rule decides the upstream; only its origin is swapped for the stand-in, its path kept.
      upstreamBase: (c: RelayCredential) => {
        const real = upstreamBase(c)
        if (c.provider !== 'inworld' || real !== INWORLD_UPSTREAM) throw new Error(`unexpected upstream ${real}`)
        return `${providerUrl}/v1`
      },
      log: () => {},
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

  beforeEach(() => {
    resetRelayTokensForTests()
    resetGateRunsForTests()
    seen = []
    reports = []
    token = issueRelayToken('c1', 'conv-1')
  })

  const post = (headers: Record<string, string>, path = '/inworld/chat/completions') =>
    fetch(`${relayUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agenthix-turn': token, ...headers },
      body: '{"model":"inworld/models/deepseek-v4-flash","stream":true,"messages":[]}',
    })

  it("reaches Inworld's fixed upstream with the turn's key as a Bearer token, nothing the harness sent overriding it", async () => {
    pointRelayToken(token, 'run-1', [INWORLD], null, NO_SWITCHES)
    const res = await post({
      authorization: 'Bearer agenthix-key-arrives-with-each-request',
      'x-api-key': 'agenthix-key-arrives-with-each-request',
      host: 'attacker.example',
      'x-forwarded-host': 'attacker.example',
      forwarded: 'host=attacker.example',
    })
    expect(res.status).toBe(200)
    await res.text()
    expect(seen).toHaveLength(1)
    expect(seen[0].url).toBe('/v1/chat/completions')
    expect(seen[0].headers.authorization).toBe(`Bearer ${REAL_KEY}`)
    expect(seen[0].headers['x-api-key']).toBeUndefined()
    expect(seen[0].headers['x-agenthix-turn']).toBeUndefined()
    expect(seen[0].headers.host).toBe(new URL(providerUrl).host)
    expect(seen[0].headers['x-forwarded-host']).toBeUndefined()
    expect(seen[0].headers.forwarded).toBeUndefined()
  })

  it("reports the call's usage against the Inworld provider, with the model id as sent", async () => {
    pointRelayToken(token, 'run-1', [INWORLD], null, NO_SWITCHES)
    await (await post({})).text()
    for (let i = 0; i < 100 && reports.length < 1; i++) await new Promise(r => setTimeout(r, 10))
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      runId: 'run-1', providerId: 'prov-iw', model: 'inworld/models/deepseek-v4-flash', upstreamStatus: 200,
      usage: { inputTokens: 10, outputTokens: 3, cacheReadTokens: 2, cacheWriteTokens: 0 },
    })
    expect(reports[0].errorKind).toBeUndefined()
  })

  it('refuses a turn with no Inworld credential, and a provider the site does not relay', async () => {
    pointRelayToken(token, 'run-1', [{ kind: 'apiKey', provider: 'openai', apiKey: 'oai' }], null, NO_SWITCHES)
    expect((await post({})).status).toBe(403)
    expect((await post({}, '/inworld-evil/chat/completions')).status).toBe(404)
    expect((await post({}, '/assemblyai/chat/completions')).status).toBe(404)
    expect(seen).toEqual([])
  })
})
