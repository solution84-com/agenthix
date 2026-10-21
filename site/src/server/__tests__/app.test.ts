/**
 * The site's routes over real HTTP, as main.ts serves them: every route is
 * mounted, the seven ordinary routes parse JSON and form bodies with Express's
 * defaults (100 kB), and the model relay's body reaches its handler unread —
 * a parser in front of it would consume a streamed body without any error.
 *
 * Each handler is a stand-in that reports what it received, so this checks
 * the mounting and nothing the handlers do; their own tests cover that.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Request, Response } from 'express'

const { echo } = vi.hoisted(() => ({
  echo: (name: string) => (req: Request, res: Response) => {
    res.json({ route: name, params: req.params, body: req.body ?? null })
  },
}))

vi.mock('../health', () => ({ healthHandler: echo('health') }))
vi.mock('../identity/identityApi', () => ({ whoamiHandler: echo('whoami') }))
vi.mock('../mcp/handler', () => ({ mcpHandler: echo('mcp') }))
vi.mock('../git/gitCredentialApi', () => ({ gitCredentialHandler: echo('gitCredential') }))
vi.mock('../harness/turnApi', () => ({ harnessTurnHandler: echo('harnessTurn') }))
vi.mock('../harness/harnessGateApi', () => ({ harnessGateHandler: echo('harnessGate') }))
vi.mock('../runtime/claudeKeyApi', () => ({ claudeKeyHandler: echo('claudeKey') }))
vi.mock('../modelRelay/modelRelayApi', () => ({
  // Counts the body itself: it can only see bytes no parser has read.
  modelRelayHandler: (req: Request, res: Response) => {
    let bytes = 0
    req.on('data', (chunk: Buffer) => { bytes += chunk.length })
    req.on('end', () => res.json({ route: 'modelRelay', params: req.params, parsed: req.body !== undefined, bytes }))
  },
}))

import { HARNESS_GATE_PATH, HARNESS_TURN_PATH } from '@agenthix/core'
import { CLAUDE_KEY_PATH } from '../runtime/claudeKeyTickets'
import { MODEL_RELAY_PATH } from '../modelRelay/relayProviders'
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

const postJson = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('the site routes', () => {
  it.each([
    ['/health', 'health'],
    ['/api/v1/identity/whoami', 'whoami'],
  ])('mounts GET %s', async (path, route) => {
    const res = await fetch(`${base}${path}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ route })
  })

  it.each([
    ['/mcp', 'mcp'],
    ['/api/v1/git/credential', 'gitCredential'],
    [HARNESS_TURN_PATH, 'harnessTurn'],
    [HARNESS_GATE_PATH, 'harnessGate'],
    [CLAUDE_KEY_PATH, 'claudeKey'],
  ])('mounts POST %s and hands it the parsed JSON body', async (path, route) => {
    const res = await postJson(path, { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ route, params: {}, body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } })
  })

  it('parses a form body on an ordinary route', async () => {
    const res = await fetch(`${base}/api/v1/git/credential`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'protocol=https&host=github.com',
    })
    expect(await res.json()).toMatchObject({ body: { protocol: 'https', host: 'github.com' } })
  })

  it('keeps the JSON parser\'s default 100 kB limit', async () => {
    const atLimit = await postJson('/mcp', { pad: 'x'.repeat(99_000) })
    expect(atLimit.status).toBe(200)
    const over = await postJson('/mcp', { pad: 'x'.repeat(110_000) })
    expect(over.status).toBe(413)
  })

  it('answers malformed JSON with a 400, not a crash', async () => {
    const res = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' })
    expect(res.status).toBe(400)
  })

  it('passes a large streamed JSON body through the model relay unread, on every method and any path', async () => {
    const chunk = Buffer.alloc(64 * 1024, 'a')
    const chunks = 80 // 5 MB, far over the parser's limit
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < chunks; i++) controller.enqueue(chunk)
        controller.close()
      },
    })
    const res = await fetch(`${base}${MODEL_RELAY_PATH}/anthropic/v1/messages?beta=true`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      route: 'modelRelay',
      params: { provider: 'anthropic', rest: ['v1', 'messages'] },
      parsed: false,
      bytes: chunk.length * chunks,
    })

    const put = await fetch(`${base}${MODEL_RELAY_PATH}/google`, { method: 'PUT', body: 'k=v', headers: { 'content-type': 'application/x-www-form-urlencoded' } })
    expect(await put.json()).toMatchObject({ params: { provider: 'google' }, parsed: false, bytes: 3 })
  })

  it('answers an unknown path, and the root, with a 404 and no page', async () => {
    for (const path of ['/', '/nope', '/operations']) {
      const res = await fetch(`${base}${path}`)
      expect(res.status).toBe(404)
      expect(res.headers.get('content-type')).toMatch(/application\/json/)
    }
  })

  it('does not advertise Express', async () => {
    const res = await fetch(`${base}/health`)
    expect(res.headers.get('x-powered-by')).toBeNull()
  })

  it('logs one line per ordinary request and none for the relay', async () => {
    const log = vi.mocked(console.log)
    log.mockClear()
    await (await fetch(`${base}${MODEL_RELAY_PATH}/anthropic/v1/models`)).json()
    await (await fetch(`${base}/health?token=secret`)).json()
    await vi.waitFor(() => expect(log).toHaveBeenCalled())
    expect(log).toHaveBeenCalledTimes(1)
    const line = String(log.mock.calls[0][0])
    expect(line).toMatch(/\[http\] GET \/health 200 /)
    expect(line).not.toContain('secret')
  })
})
