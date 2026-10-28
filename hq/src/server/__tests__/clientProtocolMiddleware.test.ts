/**
 * The client protocol as hq's global middleware applies it: Wasp's middleware map as `middlewareConfig` leaves it,
 * in front of a stand-in operation, on an ephemeral port.
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { MiddlewareConfig } from 'wasp/server/middleware'

vi.mock('wasp/server', async () => ({ ...(await vi.importActual<object>('wasp/server')), config: { allowedCORSOrigins: [] } }))

const { middlewareConfig } = await import('../middleware')

let server: http.Server
let url: string
let keys: string[]

beforeAll(async () => {
  const pass: express.RequestHandler = (_req, _res, next) => next()
  const configured = middlewareConfig(new Map([['helmet', pass], ['cors', pass], ['logger', pass], ['express.json', pass]]) as MiddlewareConfig)
  keys = [...configured.keys()]
  const app = express()
  app.use(...configured.values())
  app.post('/operations/get-agents', (_req, res) => { res.json({ ok: true }) })
  server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

const post = (headers: Record<string, string>) =>
  fetch(`${url}/operations/get-agents`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}' })

describe('the client protocol in hq\'s middleware @SC-1138', () => {
  it('runs after CORS, so a refusal carries its headers', () => {
    expect(keys.indexOf('clientProtocol')).toBeGreaterThan(keys.indexOf('cors'))
  })

  it('serves an operation with no version and with one hq serves', async () => {
    expect((await post({})).status).toBe(200)
    expect((await post({ 'X-Client-Protocol-Version': '1.0', 'User-Agent': 'mobile/1.2.0' })).status).toBe(200)
  })

  it('answers an app two majors ahead with 426 and the refusal', async () => {
    const res = await post({ 'X-Client-Protocol-Version': '3.0' })
    expect(res.status).toBe(426)
    expect(res.headers.get('x-client-protocol-version')).toBe('1.7')
    expect(await res.json()).toEqual({
      error: 'This app speaks protocol 3.0 and HQ speaks 1.7, too far apart to work together: upgrade HQ.',
      reason: 'too_far_apart', hqVersion: '1.7', clientVersion: '3.0', upgrade: 'hq',
    })
  })

  it('lets a browser-based client send the header across origins', async () => {
    const res = await fetch(`${url}/operations/get-agents`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-client-protocol-version' },
    })
    expect(res.headers.get('access-control-allow-headers')).toMatch(/X-Client-Protocol-Version/)
  })
})
