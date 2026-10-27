/**
 * How large a JSON body hq-server reads: the upload actions take a 10 MB file as a data URL; every other route keeps
 * Express's 100 kB default. Served on an ephemeral port in front of a stand-in operation.
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('wasp/server', async () => ({ ...(await vi.importActual<object>('wasp/server')), config: { allowedCORSOrigins: [] } }))

const { jsonBody } = await import('../middleware')

let server: http.Server
let url: string

beforeAll(async () => {
  const app = express()
  app.use(jsonBody)
  app.post('/operations/:name', (_req, res) => { res.json({ ok: true }) })
  server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

const post = (name: string, bytes: number) => fetch(`${url}/operations/${name}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ dataUrl: `data:image/png;base64,${'A'.repeat(bytes)}` }),
})

describe('JSON body limits @SC-1531', () => {
  it('lets a task attachment of several megabytes through', async () => {
    expect((await post('upload-task-attachment', 8 * 1024 * 1024)).status).toBe(200)
  })

  it('lets a picture through', async () => {
    expect((await post('upload-person-picture', 1024 * 1024)).status).toBe(200)
  })

  it('keeps the default for every other operation', async () => {
    expect((await post('update-task', 200 * 1024)).status).toBe(413)
  })
})
