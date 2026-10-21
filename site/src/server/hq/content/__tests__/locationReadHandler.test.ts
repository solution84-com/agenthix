/**
 * `location.readFile` on the content transport — the second handler ever
 * written against it, and the first written knowing the two ways the first one
 * could have gone wrong:
 *
 *  1. A handler that resolves WITHOUT ending its writable half leaves the
 *     stream open until the connection drops. hq's caller waits on an `end`
 *     frame that never comes, and reads it as a hung site rather than a bug.
 *     So every success case below asserts the half actually ended, on both
 *     sides — hq saw the frame, and the site's own writable is finished.
 *  2. A handler that reads its request with `for await` destroys the stream
 *     before it can reply. This one reads nothing: hq opens the stream and
 *     sends no request body, and the site writes straight back.
 *
 * The harness (`./contentReadHarness.ts`) is an opener mux wired directly to a
 * server mux, no socket.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { readdirSync } from 'node:fs'
import {
  LOCATION_FILE_METHODS,
  MAX_CHUNK_BYTES,
  LocationFileError,
  type LocationRef,
} from '@agenthix/core'
import { contentMethods } from '../contentMethods'
import { handleLocationRead } from '../locationReadHandler'
import { locationDir } from '../../../storage/paths'
import { openRead } from './contentReadHarness'
import { swapAfterCheck, replaceWithLink } from '../../../storage/__tests__/swapAfterCheck'

const ROADMAP = '# Project — Roadmap\n\nMission / Vision\n'
const projectId = 'proj-0001'
const loc: LocationRef = { ownerType: 'project', ownerId: projectId }

let root: string
let dir: string
const savedSiteRoot = process.env.SITE_ROOT

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  process.env.SITE_ROOT = root
  dir = locationDir({ ownerType: 'project', ownerId: projectId })
  await fs.mkdir(path.join(dir, 'history'), { recursive: true })
  await fs.writeFile(path.join(dir, 'ROADMAP.md'), ROADMAP)
  await fs.writeFile(path.join(root, 'secrets'), 'not yours\n')
})

afterEach(async () => {
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
  await fs.rm(root, { recursive: true, force: true })
})

describe('location.readFile', () => {
  it("streams a file's bytes and ends its half of the stream", async () => {
    const read = openRead({ loc, relPath: 'ROADMAP.md' })
    await read.outcome
    expect(read.body().toString('utf8')).toContain('# Project — Roadmap')
    expect(read.body().toString('utf8')).toBe(ROADMAP)
    // The handler ended its writable half explicitly, and did not merely
    // resolve and leave hq waiting on a frame that never comes.
    expect(read.writableEnded()).toBe(true)
    // `waitFor`, not a bare read: hq's `end` arrives INSIDE the site's
    // `stream.end()` call (this harness delivers frames synchronously), so the
    // handler's own promise settles one microtask after hq has already seen
    // the end. What matters is that it settles at all, and settles cleanly.
    await vi.waitFor(() => expect(read.handlerSettled()).toBe('resolved'))
  })

  it('carries a large file whole, in frames inside the chunk bound', async () => {
    const big = Buffer.alloc(MAX_CHUNK_BYTES * 3 + 1234, 7)
    await fs.writeFile(path.join(dir, 'big.bin'), big)
    const read = openRead({ loc, relPath: 'big.bin' })
    await read.outcome
    expect(read.body().equals(big)).toBe(true)
    expect(read.frameSizes.length).toBeGreaterThan(1)
    expect(Math.max(...read.frameSizes)).toBeLessThanOrEqual(MAX_CHUNK_BYTES)
    expect(read.writableEnded()).toBe(true)
  })

  it('refuses a path outside the location without sending any of the file', async () => {
    const read = openRead({ loc, relPath: '../../secrets' })
    await expect(read.outcome).rejects.toMatch(/outside/i)
    expect(read.body().length).toBe(0)
  })

  // Lexically inside, really outside. A prefix comparison passes this.
  it('refuses a symlink pointing outside the location', async () => {
    await fs.symlink(path.join(root, 'secrets'), path.join(dir, 'escape'))
    const read = openRead({ loc, relPath: 'escape' })
    await expect(read.outcome).rejects.toMatch(/outside/i)
    expect(read.body().length).toBe(0)
  })

  it('refuses a directory rather than streaming something that is not a file', async () => {
    const read = openRead({ loc, relPath: 'history' })
    await expect(read.outcome).rejects.toMatch(/handler_failed: /)
    expect(read.body().length).toBe(0)
  })

  it('fails a missing file rather than ending empty, which would read as an empty file', async () => {
    const read = openRead({ loc, relPath: 'nope.md' })
    await expect(read.outcome).rejects.toMatch(/handler_failed: /)
  })

  it('refuses a malformed request — the params are validated off the wire', async () => {
    const read = openRead({ loc, relPath: 7 })
    await expect(read.outcome).rejects.toMatch(/handler_failed: /)
  })

  it('never names the site\'s own storage root in a refusal', async () => {
    const read = openRead({ loc, relPath: '../../secrets' })
    const message = await read.outcome.then(() => '', (e: string) => e)
    expect(message).not.toContain(root)
  })
})

describe('the content registry', () => {
  it('serves the read under the name core publishes, beside packages.put', () => {
    expect(contentMethods[LOCATION_FILE_METHODS.readFile]).toBe(handleLocationRead)
  })
})

/**
 * `hqConnection.ts` and `contentConnection.ts` both forward a handler's
 * `err.message` to hq verbatim, and a raw `fs` error carries the absolute path
 * it failed on. Asserted against the ACTUAL sandbox root rather than a pattern
 * that resembles one, so it keeps holding when the sandbox path changes.
 */
describe('a refusal names the relative path and never the site\'s disk', () => {
  const cases: [string, string, string][] = [
    ['a missing file', 'nope.md', 'not_found'],
    ['a directory', 'history', 'not_a_file'],
    ['a climb out', '../../secrets', 'outside'],
  ]
  for (const [label, relPath, code] of cases) {
    it(`refuses ${label} with a code and no host path`, async () => {
      const read = openRead({ loc, relPath })
      await read.handled()
      const err = read.failure()
      expect(err).toBeInstanceOf(LocationFileError)
      expect((err as LocationFileError).code).toBe(code)
      expect(err?.message).not.toContain(root)
      expect(err?.message).not.toContain(os.tmpdir())
      expect((err as LocationFileError).detail).toContain('proj-0001')
    })
  }

  /**
   * A payload that does not parse leaves as a coded refusal too, the
   * convention the repository-work methods set: a raw `ZodError` forwarded
   * verbatim reaches hq as an unclassified failure and shows a person a blob
   * of validation issues.
   */
  it('refuses a payload it does not accept as invalid', async () => {
    const method = LOCATION_FILE_METHODS.readFile
    const read = openRead({ loc })
    await read.handled()
    const err = read.failure()
    expect(err).toBeInstanceOf(LocationFileError)
    expect((err as LocationFileError).code).toBe('invalid')
    expect((err as LocationFileError).detail).toContain(method)
    expect(err?.message).not.toContain(root)
  })

  it('refuses a file it may not open, saying so rather than leaking where it is', async () => {
    if (process.getuid?.() === 0) return // root reads everything; the case cannot be staged
    const locked = path.join(dir, 'locked.md')
    await fs.writeFile(locked, 'x')
    await fs.chmod(locked, 0o000)
    try {
      const read = openRead({ loc, relPath: 'locked.md' })
      await read.handled()
      expect((read.failure() as LocationFileError).code).toBe('refused')
      expect(read.failure()?.message).not.toContain(root)
    } finally {
      await fs.chmod(locked, 0o600)
    }
  })
})

const REPEATS = 20
const SETTLE_GUARD_MS = 250

/** Null where the platform exposes no descriptor table to count. */
function openDescriptorCount(): number | null {
  for (const table of ['/dev/fd', '/proc/self/fd']) {
    try {
      return readdirSync(table).length
    } catch {
      // try the next one
    }
  }
  return null
}

/**
 * The window between accepting the stream and setting up the pipe.
 *
 * A cancel landing there used to leave the handler's promise unsettled
 * forever — nothing failed, nothing logged, and the caller simply waited. The
 * guard is that it SETTLES, measured across repetitions so a single stuck
 * promise cannot hide in the noise of one run.
 *
 * The file IS open on this path: containment opens it once and confirms the
 * descriptor before anything else, so a link swapped in afterwards cannot
 * redirect the read. A cancel here must close that descriptor, which the
 * count below guards — delete the close in `streamContainedFile`'s early exit
 * and it leaks one per call.
 */
describe('a cancel before the pipe exists', () => {
  /** Cancels inside the window, then reports whether the handler ever settled. */
  async function earlyCancel(): Promise<'settled' | 'hung'> {
    const read = openRead({ loc, relPath: 'ROADMAP.md' }, stream => stream.destroy())
    return Promise.race([
      read.handled().then<'settled'>(() => 'settled'),
      new Promise<'hung'>(resolve => setTimeout(() => resolve('hung'), SETTLE_GUARD_MS)),
    ])
  }

  it('settles every time rather than leaving the caller waiting, and closes the file', async () => {
    expect(await earlyCancel()).toBe('settled')
    const before = openDescriptorCount()
    const outcomes: string[] = []
    for (let i = 0; i < REPEATS; i++) outcomes.push(await earlyCancel())
    const after = openDescriptorCount()
    expect(outcomes).toEqual(Array.from({ length: REPEATS }, () => 'settled'))
    if (before !== null && after !== null) {
      expect(after, `descriptors before ${before}, after ${after}`).toBeLessThanOrEqual(before + 2)
    }
  })

  it('reports the cancel as a cancel rather than as a mystery', async () => {
    const read = openRead({ loc, relPath: 'ROADMAP.md' }, stream => stream.destroy())
    await read.handled()
    expect((read.failure() as LocationFileError).code).toBe('cancelled')
  })
})

/**
 * A cancel AFTER the pipe exists — the path that can actually hold a
 * descriptor, because by then one is open and a read is in flight.
 *
 * This is what `done()`'s `source.destroy()` is for, and this is the test that
 * fails without it: delete that line and this leaks one descriptor per call
 * while every other test in this file still passes.
 */
describe('a cancel mid-stream', () => {
  const BIG_BYTES = MAX_CHUNK_BYTES * 16

  /** Lets the first frame arrive at hq, then drops the stream underneath it. */
  async function midStreamCancel(): Promise<'settled' | 'hung'> {
    let cancelled = false
    const read = openRead({ loc, relPath: 'big.bin' }, undefined, served => {
      if (cancelled) return
      cancelled = true
      served.destroy()
    })
    return Promise.race([
      read.handled().then<'settled'>(() => 'settled'),
      new Promise<'hung'>(resolve => setTimeout(() => resolve('hung'), SETTLE_GUARD_MS)),
    ])
  }

  it('closes the open file every time, and settles', async () => {
    await fs.writeFile(path.join(dir, 'big.bin'), Buffer.alloc(BIG_BYTES, 7))

    // One warm-up, so anything opened lazily is inside the baseline.
    expect(await midStreamCancel()).toBe('settled')

    const before = openDescriptorCount()
    const outcomes: string[] = []
    for (let i = 0; i < REPEATS; i++) outcomes.push(await midStreamCancel())
    const after = openDescriptorCount()

    expect(outcomes).toEqual(Array.from({ length: REPEATS }, () => 'settled'))
    if (before !== null && after !== null) {
      // Flat, not exact: reading the descriptor table opens one itself. A leak
      // of one per call would be +20.
      expect(after, `descriptors before ${before}, after ${after}`).toBeLessThanOrEqual(before + 2)
    }
  })

  it('does not hand hq a truncated file as if it were whole', async () => {
    await fs.writeFile(path.join(dir, 'big.bin'), Buffer.alloc(BIG_BYTES, 7))
    let cancelled = false
    const read = openRead({ loc, relPath: 'big.bin' }, undefined, served => {
      if (cancelled) return
      cancelled = true
      served.destroy()
    })
    await read.handled()
    expect(read.failure()).toBeInstanceOf(Error)
    // hq is told the stream failed; it never sees a clean end after a partial body.
    await expect(read.outcome).rejects.toBeTruthy()
    expect(read.body().length).toBeLessThan(BIG_BYTES)
  })
})

// A link swapped in AFTER containment approved the path, staged the way
// `storage/__tests__/swapAfterCheck.ts` describes: the bytes must come from the
// entry the check approved, or not at all.
describe('a directory swapped for a link between the check and the read', () => {
  let outside: string
  let spy: ReturnType<typeof swapAfterCheck> | null = null
  beforeEach(async () => {
    outside = await fs.mkdtemp(path.join(os.tmpdir(), 'site-outside-'))
    await fs.writeFile(path.join(outside, 'ROADMAP.md'), 'OUTSIDE SECRET\n')
  })
  afterEach(async () => {
    spy?.mockRestore()
    spy = null
    await fs.rm(outside, { recursive: true, force: true })
  })

  it('location.readFile sends none of the file outside', async () => {
    await fs.mkdir(path.join(dir, 'docs'))
    await fs.writeFile(path.join(dir, 'docs', 'ROADMAP.md'), ROADMAP)
    spy = swapAfterCheck(path.join(dir, 'docs'), () => replaceWithLink(path.join(dir, 'docs'), outside))
    const read = openRead({ loc, relPath: 'docs/ROADMAP.md' })
    await expect(read.outcome).rejects.toMatch(/outside/i)
    expect(read.body().toString('utf8')).not.toContain('OUTSIDE SECRET')
  })

  it('still reads a nested file when nothing is swapped', async () => {
    await fs.mkdir(path.join(dir, 'docs', 'deeper'), { recursive: true })
    await fs.writeFile(path.join(dir, 'docs', 'deeper', 'x.md'), 'nested body')
    const read = openRead({ loc, relPath: 'docs/deeper/x.md' })
    await read.outcome
    expect(read.body().toString('utf8')).toBe('nested body')
  })
})
