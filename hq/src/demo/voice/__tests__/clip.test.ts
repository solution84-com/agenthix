/**
 * `GET /api/demo/voice/:clip` (live demo spec, *Voice is in, as a demo voice*): a recorded line from the demo data
 * folder's `voice/`, only in demo mode, only a name the loader accepts, cached, as audio.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { demoVoiceClipHandler, forgetClipsForTests } from '../clip'
import { setDemoModeForTests } from '../../demoMode'

type Answer = { status: number; headers: Record<string, string>; body: unknown }

async function get(clip: unknown): Promise<Answer> {
  const answer: Answer = { status: 200, headers: {}, body: null }
  const res = {
    status(code: number) { answer.status = code; return this },
    set(headers: Record<string, string>) { Object.assign(answer.headers, headers); return this },
    json(body: unknown) { answer.body = body; return this },
    send(body: unknown) { answer.body = body; return this },
  }
  // The handler's types are Wasp's; only these parts are used.
  await (demoVoiceClipHandler as unknown as (req: unknown, res: unknown, ctx: unknown) => Promise<unknown>)({ params: { clip } }, res, {})
  return answer
}

let root: string
const saved = process.env.DEMO_DATA_DIR
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-clips-'))
  fs.mkdirSync(path.join(root, 'voice'))
  fs.writeFileSync(path.join(root, 'voice', 'writer-hello.mp3'), 'AUDIO')
  fs.writeFileSync(path.join(root, 'secret.mp3'), 'NOT A CLIP')
  process.env.DEMO_DATA_DIR = root
  forgetClipsForTests()
})
afterEach(() => {
  setDemoModeForTests(null)
  if (saved === undefined) delete process.env.DEMO_DATA_DIR
  else process.env.DEMO_DATA_DIR = saved
  fs.rmSync(root, { recursive: true, force: true })
})

describe('GET /api/demo/voice/:clip @SC-1966', () => {
  it('is not there with the setting off: 404, the file is never read @SC-1979', async () => {
    setDemoModeForTests(false)
    expect((await get('writer-hello.mp3')).status).toBe(404)
  })

  it('in demo mode serves a clip as audio, checked again before each play, never as a page', async () => {
    setDemoModeForTests(true)
    const got = await get('writer-hello.mp3')
    expect(got.status).toBe(200)
    expect(Buffer.from(got.body as Buffer).toString()).toBe('AUDIO')
    expect(got.headers['Content-Type']).toBe('audio/mpeg')
    expect(got.headers['Cache-Control']).toBe('public, no-cache')
    expect(got.headers['X-Content-Type-Options']).toBe('nosniff')
    expect(got.headers['Cross-Origin-Resource-Policy']).toBe('same-site')
  })

  it('serves wav and ogg with their own types', async () => {
    setDemoModeForTests(true)
    fs.writeFileSync(path.join(root, 'voice', 'a-b.wav'), 'W')
    fs.writeFileSync(path.join(root, 'voice', 'a-c.ogg'), 'O')
    expect((await get('a-b.wav')).headers['Content-Type']).toBe('audio/wav')
    expect((await get('a-c.ogg')).headers['Content-Type']).toBe('audio/ogg')
  })

  it('keeps a clip once read, so a second request does not read the disk', async () => {
    setDemoModeForTests(true)
    await get('writer-hello.mp3')
    fs.rmSync(path.join(root, 'voice', 'writer-hello.mp3'))
    expect((await get('writer-hello.mp3')).status).toBe(200)
  })

  it.each(['../secret.mp3', '..%2Fsecret.mp3', 'secret.mp3/../x.mp3', '.hidden.mp3', 'a.txt', 'a.MP3', '', 'x'.repeat(80) + '.mp3', 'a/b.mp3', 'a\\b.mp3'])(
    'refuses %j: only a name the loader accepts', async (name) => {
      setDemoModeForTests(true)
      expect((await get(name)).status).toBe(404)
    })

  it('refuses a name that is not a string', async () => {
    setDemoModeForTests(true)
    expect((await get(['writer-hello.mp3'])).status).toBe(404)
    expect((await get(undefined)).status).toBe(404)
  })

  it('answers 404 for a clip that is not there', async () => {
    setDemoModeForTests(true)
    expect((await get('writer-gone.mp3')).status).toBe(404)
  })
})
