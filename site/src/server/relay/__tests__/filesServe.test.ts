/**
 * `files.serve` (spec part 6, V2): only a valid ticket is served; the path is confined to the place against `..`,
 * symbolic links and hard links; a changed file is refused; ranges at the edges. Driven through a relay-side opener mux
 * wired straight to the site's server mux (`contentReadHarness.ts`), no socket.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  FILES_SERVE_METHOD,
  MAX_CHUNK_BYTES,
  RELAY_PASS_TOKEN_TYPE,
  createStreamHeadReader,
  fileVersion,
  type FileServeHead,
  type LocationRef,
} from '@agenthix/core'
import { locationDir } from '../../storage/paths'
import { openRead } from '../../hq/content/__tests__/contentReadHarness'
import { createFilesServe } from '../filesServe'
import { ReadSlots } from '../readSlots'
import { RELAY_ID, SITE_ID, fixedKeys, makeKey, signToken, ticketClaims } from './ticketKit'

const opened = vi.hoisted(() => ({ count: 0 }))
vi.mock('../../storage/locationContainment', async importOriginal => {
  const real = await importOriginal<typeof import('../../storage/locationContainment')>()
  return {
    ...real,
    openInLocation: (...args: Parameters<typeof real.openInLocation>) => {
      opened.count++
      return real.openInLocation(...args)
    },
  }
})

const hqKey = makeKey('hq-1')
const otherKey = makeKey('hq-1')
const loc: LocationRef = { ownerType: 'project', ownerId: 'proj-0001' }
const TEXT = 'abcdefghijklmnopqrstuvwxyz'

let root: string
let dir: string
const savedSiteRoot = process.env.SITE_ROOT

beforeEach(async () => {
  opened.count = 0
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  process.env.SITE_ROOT = root
  dir = locationDir(loc)
  await fs.mkdir(path.join(dir, 'docs'), { recursive: true })
  await fs.writeFile(path.join(dir, 'docs', 'a.md'), TEXT)
  await fs.writeFile(path.join(root, 'secret.txt'), 'not yours\n')
})

afterEach(async () => {
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
  await fs.rm(root, { recursive: true, force: true })
})

async function versionOf(abs: string): Promise<string> {
  const s = await fs.stat(abs)
  return fileVersion(s.size, s.mtimeMs)
}

async function ticketFor(rel: string, over: Record<string, unknown> = {}, key = hqKey): Promise<string> {
  let version = 'missing'
  try {
    version = await versionOf(path.join(dir, rel))
  } catch { /* a ticket for a path that is not there */ }
  return signToken(key, ticketClaims(loc, rel, version, over))
}

async function serve(params: unknown, opts: { slots?: ReadSlots; keys?: ReturnType<typeof fixedKeys> } = {}) {
  const handler = createFilesServe({
    siteId: SITE_ID,
    relayId: RELAY_ID,
    keys: opts.keys ?? fixedKeys({ keys: [hqKey.jwk] }),
    slots: opts.slots ?? new ReadSlots(),
  })
  const read = openRead(params, undefined, undefined, handler, FILES_SERVE_METHOD)
  await read.outcome
  await vi.waitFor(() => expect(read.handlerSettled()).toBe('resolved'))
  const parsed = createStreamHeadReader().push(new Uint8Array(read.body()))
  if (parsed.state !== 'head') throw new Error(`no head: ${parsed.state}`)
  return { head: parsed.head, bytes: Buffer.from(parsed.rest), read }
}

const refusalOf = (head: FileServeHead) => ('refusal' in head ? head.refusal : null)

describe('files.serve: the ticket @SC-1492 @SC-1562 @SC-1566', () => {
  it('serves a valid ticket: a 200 head, then the whole file, and ends its half', async () => {
    const { head, bytes, read } = await serve({ ticket: await ticketFor('docs/a.md') })
    expect(head).toEqual({
      status: 200, size: TEXT.length, contentType: 'text/markdown', purpose: 'preview', fileName: 'a.md',
    })
    expect(bytes.toString()).toBe(TEXT)
    expect(read.writableEnded()).toBe(true)
  })

  it.each([
    ['forged (signed by another key under hq\'s key id)', async () => ticketFor('docs/a.md', {}, otherKey), 'ticket-invalid'],
    ['expired', async () => {
      const iat = Math.floor(Date.now() / 1000) - 600
      return ticketFor('docs/a.md', { iat, exp: iat + 300 })
    }, 'ticket-expired'],
    ['for another site', async () => ticketFor('docs/a.md', { aud: 'site-2', site: 'site-2' }), 'ticket-invalid'],
    ['for another relay', async () => ticketFor('docs/a.md', { relay: 'relay-2' }), 'ticket-invalid'],
    ['for a purpose not accepted', async () => ticketFor('docs/a.md', { purpose: 'ide-session' }), 'ticket-invalid'],
    ['a relay pass, not a ticket', async () => ticketFor('docs/a.md', { tokenType: RELAY_PASS_TOKEN_TYPE }), 'ticket-invalid'],
    ['altered after signing', async () => {
      const [h, , s] = (await ticketFor('docs/a.md')).split('.')
      const payload = Buffer.from(JSON.stringify(ticketClaims(loc, '../../secret.txt', 'x'))).toString('base64url')
      return `${h}.${payload}.${s}`
    }, 'ticket-invalid'],
    ['not a token at all', async () => 'nonsense', 'ticket-invalid'],
  ])('refuses a ticket %s before any file is opened', async (_name, make, refusal) => {
    const ticket = await make()
    const { head, bytes } = await serve({ ticket })
    expect(refusalOf(head)).toBe(refusal)
    expect(bytes.length).toBe(0)
    expect(opened.count).toBe(0)
  })

  it('refuses params that carry no ticket', async () => {
    const { head } = await serve({ range: 'bytes=0-1' })
    expect(refusalOf(head)).toBe('ticket-invalid')
    expect(opened.count).toBe(0)
  })

  it('fetches hq\'s key set once more for a key id it lacks, then serves', async () => {
    const rotated = makeKey('hq-2')
    const keys = fixedKeys({ keys: [hqKey.jwk] }, { keys: [hqKey.jwk, rotated.jwk] })
    const { head } = await serve({ ticket: await ticketFor('docs/a.md', {}, rotated) }, { keys })
    expect(head.status).toBe(200)
    expect(keys.refreshes).toBe(1)
  })

  it('refuses a key id hq\'s key set still lacks after one refetch', async () => {
    const keys = fixedKeys({ keys: [hqKey.jwk] })
    const { head } = await serve({ ticket: await ticketFor('docs/a.md', {}, makeKey('made-up')) }, { keys })
    expect(refusalOf(head)).toBe('ticket-invalid')
    expect(keys.refreshes).toBe(1)
  })

  it('never writes the ticket into a head or a log line', async () => {
    const lines: string[] = []
    const spies = (['log', 'warn', 'error'] as const).map(m =>
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { lines.push(a.join(' ')) }))
    const ticket = await ticketFor('docs/a.md', { relay: 'relay-2' })
    const { read } = await serve({ ticket })
    spies.forEach(s => s.mockRestore())
    const signature = ticket.split('.')[2]
    expect(read.body().toString('latin1')).not.toContain(signature)
    expect(lines.join('\n')).not.toContain(signature)
    expect(lines.join('\n')).not.toContain(root)
  })
})

describe('files.serve: confinement @SC-1493 @SC-1567', () => {
  it('refuses a path that climbs out of the place with .., as a ticket no hq makes, before opening anything', async () => {
    const rel = path.relative(dir, path.join(root, 'secret.txt'))
    const version = await versionOf(path.join(root, 'secret.txt'))
    const { head, bytes } = await serve({ ticket: signToken(hqKey, ticketClaims(loc, rel, version)) })
    expect(refusalOf(head)).toBe('ticket-invalid')
    expect(bytes.length).toBe(0)
    expect(opened.count).toBe(0)
  })

  it('refuses an absolute path, as a ticket no hq makes, before opening anything', async () => {
    const abs = path.join(root, 'secret.txt')
    const { head, bytes } = await serve({ ticket: signToken(hqKey, ticketClaims(loc, abs, await versionOf(abs))) })
    expect(refusalOf(head)).toBe('ticket-invalid')
    expect(bytes.length).toBe(0)
    expect(opened.count).toBe(0)
  })

  it('refuses a symbolic link that leads out of the place', async () => {
    await fs.symlink(path.join(root, 'secret.txt'), path.join(dir, 'link.txt'))
    const version = await versionOf(path.join(root, 'secret.txt'))
    const { head, bytes } = await serve({ ticket: signToken(hqKey, ticketClaims(loc, 'link.txt', version)) })
    expect(refusalOf(head)).toBe('not-found')
    expect(bytes.length).toBe(0)
  })

  it('refuses a directory planted as a link out of the place', async () => {
    await fs.mkdir(path.join(root, 'elsewhere'))
    await fs.writeFile(path.join(root, 'elsewhere', 'x.txt'), 'outside')
    await fs.symlink(path.join(root, 'elsewhere'), path.join(dir, 'out'))
    const version = await versionOf(path.join(root, 'elsewhere', 'x.txt'))
    const { head } = await serve({ ticket: signToken(hqKey, ticketClaims(loc, 'out/x.txt', version)) })
    expect(refusalOf(head)).toBe('not-found')
  })

  it('serves a symbolic link that stays inside the place', async () => {
    await fs.symlink(path.join(dir, 'docs', 'a.md'), path.join(dir, 'inside.md'))
    const { head, bytes } = await serve({ ticket: await ticketFor('inside.md') })
    expect(head.status).toBe(200)
    expect(bytes.toString()).toBe(TEXT)
  })

  it('refuses a hard link, which may be a file outside the place under a second name', async () => {
    await fs.link(path.join(root, 'secret.txt'), path.join(dir, 'hard.txt'))
    const { head, bytes } = await serve({ ticket: await ticketFor('hard.txt') })
    expect(refusalOf(head)).toBe('not-found')
    expect(bytes.length).toBe(0)
  })

  it('refuses a directory and a missing file alike', async () => {
    expect(refusalOf((await serve({ ticket: await ticketFor('docs') })).head)).toBe('not-found')
    expect(refusalOf((await serve({ ticket: await ticketFor('docs/none.md') })).head)).toBe('not-found')
  })

  it('refuses a file changed after its ticket was made @SC-1563', async () => {
    const ticket = await ticketFor('docs/a.md')
    await fs.writeFile(path.join(dir, 'docs', 'a.md'), `${TEXT}!`)
    const { head, bytes } = await serve({ ticket })
    expect(refusalOf(head)).toBe('changed')
    expect(bytes.length).toBe(0)
  })
})

describe('files.serve: ranges @SC-1494', () => {
  it.each([
    ['bytes=0-0', { start: 0, end: 0 }, 'a'],
    ['bytes=25-25', { start: 25, end: 25 }, 'z'],
    ['bytes=20-', { start: 20, end: 25 }, 'uvwxyz'],
    ['bytes=-3', { start: 23, end: 25 }, 'xyz'],
    ['bytes=24-1000', { start: 24, end: 25 }, 'yz'],
    ['bytes=-1000', { start: 0, end: 25 }, TEXT],
  ])('serves %s as a 206 with exactly that span', async (range, expected, text) => {
    const { head, bytes } = await serve({ ticket: await ticketFor('docs/a.md'), range })
    expect(head).toMatchObject({ status: 206, size: TEXT.length, range: expected })
    expect(bytes.toString()).toBe(text)
  })

  it('answers a range that starts past the end with 416 and the size', async () => {
    const { head, bytes } = await serve({ ticket: await ticketFor('docs/a.md'), range: 'bytes=26-' })
    expect(head).toEqual({ status: 416, refusal: 'range-not-satisfiable', size: TEXT.length })
    expect(bytes.length).toBe(0)
  })

  it('serves the whole file for a header it does not serve (several ranges)', async () => {
    const { head, bytes } = await serve({ ticket: await ticketFor('docs/a.md'), range: 'bytes=0-1,4-5' })
    expect(head.status).toBe(200)
    expect(bytes.toString()).toBe(TEXT)
  })

  it('answers a HEAD with the head and no bytes', async () => {
    const { head, bytes } = await serve({ ticket: await ticketFor('docs/a.md'), headOnly: true })
    expect(head.status).toBe(200)
    expect(bytes.length).toBe(0)
  })

  it('serves an empty file as a 200 with no bytes', async () => {
    await fs.writeFile(path.join(dir, 'empty.txt'), '')
    const { head, bytes } = await serve({ ticket: await ticketFor('empty.txt') })
    expect(head).toMatchObject({ status: 200, size: 0 })
    expect(bytes.length).toBe(0)
  })

  it('carries a large file whole, in frames inside the chunk bound, under a download ticket', async () => {
    const big = Buffer.alloc(MAX_CHUNK_BYTES * 3 + 77, 9)
    await fs.writeFile(path.join(dir, 'big.bin'), big)
    const { head, bytes, read } = await serve({ ticket: await ticketFor('big.bin', { purpose: 'download' }) })
    expect(head).toMatchObject({ status: 200, purpose: 'download', contentType: 'application/octet-stream' })
    expect(bytes.equals(big)).toBe(true)
    expect(Math.max(...read.frameSizes)).toBeLessThanOrEqual(MAX_CHUNK_BYTES)
  })
})

describe('files.serve: the site\'s reads at once @SC-1495', () => {
  it('answers busy when every slot and the queue are taken', async () => {
    const slots = new ReadSlots(1, 0)
    const release = await slots.acquire()
    const { head } = await serve({ ticket: await ticketFor('docs/a.md') }, { slots })
    expect(refusalOf(head)).toBe('busy')
    release()
  })

  it('waits for a slot, then serves, and gives the slot back', async () => {
    const slots = new ReadSlots(1, 4)
    const release = await slots.acquire()
    const pending = serve({ ticket: await ticketFor('docs/a.md') }, { slots })
    await vi.waitFor(() => expect(slots.waiting).toBe(1))
    release()
    const { head } = await pending
    expect(head.status).toBe(200)
    await vi.waitFor(() => expect(slots.running).toBe(0))
  })
})
