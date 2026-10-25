/**
 * Security A12 (B-2, workflows spec part 6): the site's git credential endpoint is gone. What the agent container's
 * old helper called, `POST /api/v1/git/credential` with its run token, answers 404 over real HTTP and reaches no
 * handler. The handlers are stand-ins that record a call, so only the route table is under test.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Request, Response } from 'express'

const { calls, record } = vi.hoisted(() => {
  const calls: string[] = []
  return { calls, record: (name: string) => (_req: Request, res: Response) => { calls.push(name); res.json({}) } }
})

vi.mock('../health', () => ({ healthHandler: record('health') }))
vi.mock('../identity/identityApi', () => ({ whoamiHandler: record('whoami') }))
vi.mock('../mcp/handler', () => ({ mcpHandler: record('mcp') }))
vi.mock('../harness/turnApi', () => ({ harnessTurnHandler: record('harnessTurn') }))
vi.mock('../harness/harnessGateApi', () => ({ harnessGateHandler: record('harnessGate') }))
vi.mock('../runtime/claudeKeyApi', () => ({ claudeKeyHandler: record('claudeKey') }))
vi.mock('../modelRelay/modelRelayApi', () => ({ modelRelayHandler: record('modelRelay') }))

import { createApp } from '../app'

let server: http.Server
let base: string

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  server = http.createServer(createApp())
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
})

describe('A12 (B-2): the site has no git credential endpoint @SC-1354', () => {
  it.each(['/api/v1/git/credential', '/api/v1/git/credential/', '/api/v1/git'])('answers 404 to the old helper\'s request at %s', async (path) => {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer canary-run-token-6b' },
      body: JSON.stringify({ protocol: 'https', host: 'github.com', path: 'acme/app.git' }),
    })
    expect(res.status).toBe(404)
    expect(await res.text()).not.toMatch(/password|token/i)
    expect(calls).toEqual([])
  })
})
