import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Request, Response } from 'express'
import { listPresets, servePreset } from '../presetHandlers'

let root: string
const saved = process.env.HQ_ASSETS_ROOT

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-presets-'))
  await fs.mkdir(path.join(root, 'avatars'), { recursive: true })
  await fs.writeFile(path.join(root, 'avatars', 'brain.png'), 'png')
  await fs.writeFile(path.join(root, 'avatars', 'logo.svg'), '<svg/>')
  process.env.HQ_ASSETS_ROOT = root
})

afterAll(async () => {
  if (saved === undefined) delete process.env.HQ_ASSETS_ROOT
  else process.env.HQ_ASSETS_ROOT = saved
  await fs.rm(root, { recursive: true, force: true })
})

function fakeRes() {
  const out: { status?: number; body?: unknown } = {}
  const res = {
    status(code: number) { out.status = code; return res },
    json(body: unknown) { out.body = body; return res },
    send(body: unknown) { out.body = body; return res },
    setHeader() { return res },
  }
  return { res: res as unknown as Response, out }
}

describe('preset image route', () => {
  it('lists only the image types the image route can serve', async () => {
    const { res, out } = fakeRes()
    await listPresets({ params: { type: 'avatars' } } as unknown as Request, res)
    expect(out.body).toEqual(['brain.png'])
  })

  it('refuses an SVG', async () => {
    const { res, out } = fakeRes()
    await servePreset({ params: { type: 'avatars', filename: 'logo.svg' } } as unknown as Request, res)
    expect(out.status).toBe(400)
  })

  it('still serves a PNG', async () => {
    const { res, out } = fakeRes()
    await servePreset({ params: { type: 'avatars', filename: 'brain.png' } } as unknown as Request, res)
    expect(out.status).toBeUndefined()
    expect(out.body).toEqual(Buffer.from('png'))
  })
})
