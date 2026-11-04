/** An upstream that goes silent is cut off by the relay's own deadline, and the harness is told which provider. */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import type { UsageReport } from '@agenthix/core'
import { createModelRelayHandler } from '../modelRelayApi'
import { issueRelayToken, pointRelayToken, resetRelayTokensForTests } from '../relayTokens'
import { resetGateRunsForTests } from '../../../agents/runtime/toolGateRuns'

let silent: http.Server
let relay: http.Server
let relayUrl: string
const reports: UsageReport[] = []

function listen(server: http.Server): Promise<string> {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)))
}

beforeAll(async () => {
  // Reads the request and never answers.
  silent = http.createServer(req => { req.resume() })
  const silentUrl = await listen(silent)
  const handler = createModelRelayHandler({
    checkSource: async () => true,
    upstreamBase: () => silentUrl,
    log: () => {},
    report: r => { reports.push(r) },
    idleTimeoutMs: 150,
  })
  const app = express()
  app.all('/api/v1/model-relay/:provider{/*rest}', (req, res) => { void handler(req, res) })
  relay = http.createServer(app)
  relayUrl = `${await listen(relay)}/api/v1/model-relay`
})

afterAll(async () => {
  relay.closeAllConnections()
  silent.closeAllConnections()
  await Promise.all([new Promise(r => relay.close(r)), new Promise(r => silent.close(r))])
})

beforeEach(() => {
  resetRelayTokensForTests()
  resetGateRunsForTests()
  reports.length = 0
})

describe('a stalled provider', () => {
  it('is answered with a 504 naming the provider, and reported as unavailable', async () => {
    const token = issueRelayToken('c1', 'conv-1')
    pointRelayToken(token, 'run-1', [{ kind: 'apiKey', provider: 'anthropic', apiKey: 'sk-ant-REAL', providerId: 'p1' }])
    const res = await fetch(`${relayUrl}/anthropic/v1/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': token }, body: '{"model":"m1","messages":[]}',
    })
    expect(res.status).toBe(504)
    expect(JSON.stringify(await res.json())).toContain('anthropic')
    await new Promise(r => setTimeout(r, 50))
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({ errorKind: 'unavailable', providerId: 'p1' })
  })
})
