import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Request, Response } from 'express'
import { DEMO_UPLOAD_BODY_MAX_BYTES, DEMO_UPLOAD_TOO_LARGE } from '../uploads'
import { setDemoModeForTests } from '../demoMode'

vi.mock('wasp/server', async () => ({ ...(await vi.importActual<object>('wasp/server')), config: { allowedCORSOrigins: [] } }))

const { jsonBody } = await import('../../server/middleware')

afterEach(() => setDemoModeForTests(null))

type Outcome = { status: number | null; body: unknown; passed: boolean; parsed: unknown }

function send(url: string, bytes: number, sayLength = true): Promise<Outcome> {
  const text = JSON.stringify({ json: { dataUrl: 'x'.repeat(bytes) } })
  const req = Object.assign(Readable.from([Buffer.from(text)]), {
    method: 'POST', url, originalUrl: url,
    headers: { 'content-type': 'application/json', ...(sayLength ? { 'content-length': String(Buffer.byteLength(text)) } : { 'transfer-encoding': 'chunked' }) },
  }) as unknown as Request
  const out: Outcome = { status: null, body: null, passed: false, parsed: null }
  return new Promise((resolve) => {
    const res = {
      status(code: number) { out.status = code; return this },
      json(b: unknown) { out.body = b; resolve(out); return this },
    } as unknown as Response
    jsonBody(req, res, (err?: unknown) => {
      out.passed = !err
      out.parsed = (req as unknown as { body: unknown }).body
      resolve(out)
    })
  })
}

const UPLOAD = '/operations/upload-task-attachment'
const OVER = DEMO_UPLOAD_BODY_MAX_BYTES + 1024

describe('uploads in the demo @SC-1971', () => {
  it('refuses a file over 2 MB with one sentence, before reading it', async () => {
    setDemoModeForTests(true)
    expect(await send(UPLOAD, OVER)).toMatchObject({ status: 413, body: { message: DEMO_UPLOAD_TOO_LARGE }, passed: false })
  })

  it('cuts a body that does not say its length at the cap', async () => {
    setDemoModeForTests(true)
    expect(await send(UPLOAD, OVER, false)).toMatchObject({ status: 413, body: { message: DEMO_UPLOAD_TOO_LARGE } })
  })

  it('takes a small file', async () => {
    setDemoModeForTests(true)
    expect((await send(UPLOAD, 1024)).passed).toBe(true)
  })

  it('takes the same file with the setting off: the ordinary limit applies @SC-1979', async () => {
    setDemoModeForTests(false)
    const outcome = await send(UPLOAD, OVER)
    expect(outcome.status).toBeNull()
    expect(outcome.passed).toBe(true)
  })
})
