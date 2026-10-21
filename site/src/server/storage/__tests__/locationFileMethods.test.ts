/**
 * The four control-channel methods a site serves over its own locations, and
 * the containment rule all five location methods share.
 *
 * Two properties are asserted here rather than assumed from the code reading
 * correctly:
 *
 *  1. **Containment is real, not lexical.** A symlink planted inside a location
 *     and pointing outside it resolves lexically inside and sails through a
 *     `startsWith` comparison. Every refusal case below is written so that a
 *     prefix check would pass it.
 *  2. **The site never asks who is calling.** hq checks entitlement before it
 *     asks; a site holds no identity store and has nothing to re-derive it
 *     from (ADR-0042). Every params shape is asserted to carry no caller.
 *
 * And one drift guard, stated precisely, because an earlier version of this
 * comment claimed more than it delivered. Site validates these payloads with
 * zod schemas that mirror core's types by hand, and the mirror is pinned in
 * two halves that catch different things:
 *
 *  - **`locationFileMethods.ts`'s own `Exact<…>` assertions** (core's
 *    `Exact`, shared so hq pins the same shapes with the same type). It
 *    compares key sets at every depth and then mutual assignability. Each half
 *    is load-bearing: assignability alone does NOT see an OPTIONAL field added
 *    on one side, since an object type without an optional property is
 *    assignable to one with it in both directions; and comparing only the top
 *    level misses a field added to a NESTED type, which is exactly as
 *    breaking, because these schemas drop a field they do not list, and would lose it at
 *    the wire with everything compiling.
 *
 *    What it catches: a field added to, removed from or renamed in either a
 *    schema or the core type it mirrors, optional or required, at any depth
 *    reachable through an object or an array element. What it cannot catch:
 *    anything `tsc` never sees — vitest transpiles these assertions away
 *    through esbuild without checking them. `npx tsc --noEmit` is not optional
 *    for this module.
 *  - **The runtime key comparison below**, whose expected set is itself typed
 *    `Record<keyof …, true>` against the core type. It is what fails under a
 *    plain `vitest run` when a zod schema gains or loses a field — and only at
 *    the top level, since it compares one object's keys.
 *
 * Both halves were verified by mutating a real type and watching them fail;
 * neither alone is the guard.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  LOCATION_FILE_METHODS,
  LOCATION_SEED_MAX_BYTES,
  LOCATION_SEED_MAX_FILES,
  LocationFileError,
  type LocationFileErrorCode,
  type LocationRef as WireLocationRef,
  type LocationListFilesParams,
  type LocationStatFileParams,
  type LocationSeedFile,
  type LocationSeedFilesParams,
  type LocationEnsureDirParams,
  type LocationReadFileParams,
} from '@agenthix/core'

// channelMethods.ts reaches for `prisma` at module scope through `#db`; only
// `site.describe` ever touches it, and nothing here calls that. The
// registration assertion below is the reason this file imports it
// at all.
vi.mock('#db', () => ({ prisma: {} }))

import {
  listFiles,
  statFile,
  seedFiles,
  ensureDir,
  LIST_FILES_PARAMS_SHAPE,
  STAT_FILE_PARAMS_SHAPE,
  SEED_FILES_PARAMS_SHAPE,
  ENSURE_DIR_PARAMS_SHAPE,
  READ_FILE_PARAMS_SHAPE,
} from '../locationFileMethods'
import { channelMethods } from '../../hq/channelMethods'
import { locationDir } from '../paths'

const ROADMAP = '# Project — Roadmap\n'
const projectId = 'proj-0001'
const loc: WireLocationRef = { ownerType: 'project', ownerId: projectId }

let root: string
let dir: string
const savedSiteRoot = process.env.SITE_ROOT

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  process.env.SITE_ROOT = root
  dir = locationDir({ ownerType: 'project', ownerId: projectId })
  await fs.mkdir(path.join(dir, 'history'), { recursive: true })
  await fs.writeFile(path.join(dir, 'ROADMAP.md'), ROADMAP)
  await fs.writeFile(path.join(dir, 'PROJECT.md'), 'Vision:\nMission:\n')
})

afterEach(async () => {
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
  await fs.rm(root, { recursive: true, force: true })
})

describe('location.listFiles', () => {
  it("lists a location's entries with kind, size and when each last changed", async () => {
    const result = await listFiles({ loc })
    expect(result.entries).toContainEqual(
      expect.objectContaining({ name: 'ROADMAP.md', kind: 'file', size: Buffer.byteLength(ROADMAP) }),
    )
    expect(result.entries).toContainEqual(expect.objectContaining({ name: 'history', kind: 'directory' }))
    const when = new Date('2026-03-04T05:06:07.000Z')
    await fs.utimes(path.join(dir, 'ROADMAP.md'), when, when)
    const again = await listFiles({ loc })
    expect(again.entries.find(e => e.name === 'ROADMAP.md')?.modifiedAt).toBe(when.toISOString())
  })

  it('names entries and nothing else — never a path on the site\'s disk', async () => {
    const result = await listFiles({ loc })
    expect(result.entries.length).toBeGreaterThan(0)
    for (const entry of result.entries) {
      expect(Object.keys(entry).sort()).toEqual(['kind', 'modifiedAt', 'name', 'size'])
      expect(entry.name).not.toContain('/')
    }
    expect(JSON.stringify(result)).not.toContain(root)
  })

  it('lists one directory inside the location when asked for it', async () => {
    await fs.writeFile(path.join(dir, 'history', '2026-W01.md'), 'week one\n')
    const result = await listFiles({ loc, subPath: 'history' })
    expect(result.entries).toEqual([expect.objectContaining({ name: '2026-W01.md', kind: 'file', size: 'week one\n'.length })])
  })

  it('puts directories before files, and sorts each by name', async () => {
    const { entries } = await listFiles({ loc })
    expect(entries.map(e => e.name)).toEqual(['history', 'PROJECT.md', 'ROADMAP.md'])
  })

  it('refuses a subPath that climbs out of the location', async () => {
    await expect(listFiles({ loc, subPath: '../../etc' })).rejects.toThrow(/outside/i)
  })

  // A prefix comparison passes this: the link's own path is lexically inside
  // the location. Only resolving it is a boundary.
  it('drops a symlink pointing outside the location from the listing', async () => {
    await fs.symlink('/etc/passwd', path.join(dir, 'escape'))
    const { entries } = await listFiles({ loc })
    expect(entries.map(e => e.name)).not.toContain('escape')
  })

  it('keeps a symlink that stays inside, reported as what it resolves to', async () => {
    await fs.symlink(path.join(dir, 'history'), path.join(dir, 'archive'))
    const { entries } = await listFiles({ loc })
    expect(entries).toContainEqual(expect.objectContaining({ name: 'archive', kind: 'directory' }))
  })

  // The refusal says what was wrong without saying where the location is.
  it('refuses without naming the site\'s own storage root', async () => {
    const err = await listFiles({ loc, subPath: '../..' }).catch((e: unknown) => e as Error)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).not.toContain(root)
  })
})

describe('location.statFile', () => {
  it("answers one entry's kind, size and modification time", async () => {
    const result = await statFile({ loc, relPath: 'ROADMAP.md' })
    expect(result).toEqual({
      name: 'ROADMAP.md',
      kind: 'file',
      size: Buffer.byteLength(ROADMAP),
      modifiedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown as string,
    })
  })

  it('answers for a directory too — that is how hq probes for .git', async () => {
    await fs.mkdir(path.join(dir, '.git'))
    expect((await statFile({ loc, relPath: '.git' })).kind).toBe('directory')
  })

  it('refuses a relative path that climbs out of the location', async () => {
    await expect(statFile({ loc, relPath: '../../etc/passwd' })).rejects.toThrow(/outside/i)
  })

  it('refuses a symlink pointing outside the location', async () => {
    await fs.symlink('/etc/passwd', path.join(dir, 'escape'))
    await expect(statFile({ loc, relPath: 'escape' })).rejects.toThrow(/outside/i)
  })
})

describe('location.seedFiles', () => {
  it("writes a new location's starter documents", async () => {
    const empty: WireLocationRef = { ownerType: 'user', ownerId: 'user-0001' }
    const result = await seedFiles({ loc: empty, files: [{ relPath: 'agenda.md', content: '# Agenda\n', ifAbsent: true }] })
    expect(result).toEqual({ written: ['agenda.md'], skipped: [] })
    expect(await fs.readFile(path.join(locationDir(empty), 'agenda.md'), 'utf8')).toBe('# Agenda\n')
  })

  it('never overwrites — a second call writes nothing and says so', async () => {
    const files = [{ relPath: 'ROADMAP.md', content: 'replaced', ifAbsent: true }]
    expect(await seedFiles({ loc, files })).toEqual({ written: [], skipped: ['ROADMAP.md'] })
    expect(await fs.readFile(path.join(dir, 'ROADMAP.md'), 'utf8')).toBe(ROADMAP)
  })

  // The rule rides in the call, and the only value the call may carry is the
  // rule itself. A seed that asked to overwrite would be a general file write
  // wearing a seed's name; there is no branch here that could serve it, and
  // the wire refuses it rather than a handler quietly deciding.
  it('refuses a seed file that asks to overwrite', async () => {
    await expect(
      seedFiles({ loc, files: [{ relPath: 'ROADMAP.md', content: 'replaced', ifAbsent: false }] }),
    ).rejects.toThrow()
    expect(await fs.readFile(path.join(dir, 'ROADMAP.md'), 'utf8')).toBe(ROADMAP)
  })

  it('refuses a seed file that does not say which rule it wants', async () => {
    await expect(seedFiles({ loc, files: [{ relPath: 'ROADMAP.md', content: 'x' }] })).rejects.toThrow()
    expect(await fs.readFile(path.join(dir, 'ROADMAP.md'), 'utf8')).toBe(ROADMAP)
  })

  it('creates the directories a seeded path needs', async () => {
    const result = await seedFiles({ loc, files: [{ relPath: 'history/README.md', content: 'past weeks\n', ifAbsent: true }] })
    expect(result.written).toEqual(['history/README.md'])
  })

  it('refuses a seed path that climbs out of the location, writing nothing', async () => {
    await expect(
      seedFiles({ loc, files: [{ relPath: 'ROADMAP.md', content: 'x', ifAbsent: true }, { relPath: '../escaped.md', content: 'x', ifAbsent: true }] }),
    ).rejects.toThrow(/outside/i)
    expect(await fs.readFile(path.join(dir, 'ROADMAP.md'), 'utf8')).toBe(ROADMAP)
  })

  // Seeding carries code-owned starter documents on the control channel. The
  // cap is what stops it quietly becoming a general file-write path — those
  // belong on the content transport.
  it('refuses a payload over the seed size cap', async () => {
    const files = [{ relPath: 'huge.md', content: 'x'.repeat(LOCATION_SEED_MAX_BYTES + 1), ifAbsent: true }]
    await expect(seedFiles({ loc, files })).rejects.toThrow(/seed/i)
  })
})

describe('location.ensureDir', () => {
  it('creates a location that is not there yet, and says it did', async () => {
    const fresh: WireLocationRef = { ownerType: 'project', ownerId: projectId, workspaceId: 'ws-0001' }
    expect(await ensureDir({ loc: fresh })).toEqual({ created: true })
    expect((await fs.stat(locationDir(fresh))).isDirectory()).toBe(true)
  })

  it('succeeds without creating anything when the directory is already there', async () => {
    expect(await ensureDir({ loc })).toEqual({ created: false })
  })

  it('refuses a subPath that climbs out of the location', async () => {
    await expect(ensureDir({ loc, subPath: '../../escaped' })).rejects.toThrow(/outside/i)
  })
})

describe('the site never asks who is calling', () => {
  // The handlers' parameters carry a location and a path, and no user id:
  // entitlement is hq's to check, and site has no identity store to check it
  // with.
  it('carries no caller in any params shape', () => {
    for (const shape of [
      LIST_FILES_PARAMS_SHAPE,
      STAT_FILE_PARAMS_SHAPE,
      SEED_FILES_PARAMS_SHAPE,
      ENSURE_DIR_PARAMS_SHAPE,
      READ_FILE_PARAMS_SHAPE,
    ]) {
      const keys = Object.keys(shape)
      expect(keys).not.toContain('userId')
      expect(keys).not.toContain('user')
      expect(keys).not.toContain('callerId')
    }
  })

  it('carries no caller inside the location itself', () => {
    expect(Object.keys(LIST_FILES_PARAMS_SHAPE.loc.shape)).toEqual(['ownerType', 'ownerId', 'workspaceId', 'taskId'])
  })
})

describe('the wire schemas mirror core, and are pinned to it', () => {
  it('validates exactly the fields each core params type declares', () => {
    const list: Record<keyof LocationListFilesParams, true> = { loc: true, subPath: true }
    const stat: Record<keyof LocationStatFileParams, true> = { loc: true, relPath: true }
    const seed: Record<keyof LocationSeedFilesParams, true> = { loc: true, files: true }
    const ensure: Record<keyof LocationEnsureDirParams, true> = { loc: true, subPath: true }
    const read: Record<keyof LocationReadFileParams, true> = { loc: true, relPath: true }

    const pairs: [object, object][] = [
      [LIST_FILES_PARAMS_SHAPE, list],
      [STAT_FILE_PARAMS_SHAPE, stat],
      [SEED_FILES_PARAMS_SHAPE, seed],
      [ENSURE_DIR_PARAMS_SHAPE, ensure],
      [READ_FILE_PARAMS_SHAPE, read],
    ]
    for (const [shape, expected] of pairs) {
      expect(Object.keys(shape).sort()).toEqual(Object.keys(expected).sort())
    }
  })

  it('validates exactly the fields a seed file declares', () => {
    const seedFile: Record<keyof LocationSeedFile, true> = { relPath: true, content: true, ifAbsent: true }
    expect(Object.keys(SEED_FILES_PARAMS_SHAPE.files.element.shape).sort()).toEqual(Object.keys(seedFile).sort())
  })

  it('ignores a field neither side declares @SC-1153', async () => {
    await expect(listFiles({ loc, depth: 3 })).resolves.toBeDefined()
  })

  it('refuses an owner kind that is not a storage owner', async () => {
    await expect(listFiles({ loc: { ownerType: 'product', ownerId: 'x' } })).rejects.toThrow()
  })
})

describe('the closed map', () => {
  it('serves the four control methods under the names core publishes', () => {
    expect(channelMethods[LOCATION_FILE_METHODS.listFiles]).toBeTypeOf('function')
    expect(channelMethods[LOCATION_FILE_METHODS.statFile]).toBeTypeOf('function')
    expect(channelMethods[LOCATION_FILE_METHODS.seedFiles]).toBeTypeOf('function')
    expect(channelMethods[LOCATION_FILE_METHODS.ensureDir]).toBeTypeOf('function')
  })

  // The bytes cross the content transport. A control-channel entry for the
  // read would be a second, untested implementation of one operation.
  it('does not serve the read on the control channel', () => {
    expect((channelMethods as Readonly<Record<string, unknown>>)[LOCATION_FILE_METHODS.readFile]).toBeUndefined()
  })
})

/**
 * The leak the result types were shaped to avoid, arriving by the other door.
 *
 * `hqConnection.ts` forwards a handler's `err.message` to hq verbatim, and a
 * raw `fs` error carries the absolute path it failed on — so an ENOENT from a
 * `stat` used to hand hq the site's whole storage layout. Every refusal below
 * is asserted against the ACTUAL sandbox root, not a pattern that looks like
 * one, so the test keeps working when the sandbox path changes.
 */
describe('a refusal says what went wrong and not where the site keeps its files', () => {
  async function refusalOf(run: () => Promise<unknown>): Promise<LocationFileError> {
    const err = await run().then(() => null, (e: unknown) => e)
    expect(err).toBeInstanceOf(LocationFileError)
    return err as LocationFileError
  }

  it('names the location and the relative path, never a path on disk', async () => {
    const cases: [string, () => Promise<unknown>, LocationFileErrorCode][] = [
      ['a missing file', () => statFile({ loc, relPath: 'nope.md' }), 'not_found'],
      ['a missing directory', () => statFile({ loc, relPath: 'history/nope/deeper.md' }), 'not_found'],
      ['a climb out', () => statFile({ loc, relPath: '../../etc/passwd' }), 'outside'],
      ['a list through a file', () => listFiles({ loc, subPath: 'ROADMAP.md' }), 'not_a_directory'],
      ['a read of a directory as a file', () => ensureDir({ loc, subPath: 'ROADMAP.md/under' }), 'not_a_directory'],
      ['a seed under a file', () => seedFiles({ loc, files: [{ relPath: 'ROADMAP.md/x.md', content: 'x', ifAbsent: true }] }), 'not_a_directory'],
    ]
    for (const [label, run, code] of cases) {
      const err = await refusalOf(run)
      expect(err.message, label).not.toContain(root)
      expect(err.message, label).not.toContain(os.tmpdir())
      expect(err.code, label).toBe(code)
      // The detail still says enough to act on: which location, which path.
      expect(err.detail, label).toContain('proj-0001')
    }
  })

  it('names a workspace or a task when the location has one', async () => {
    const ws = { ...loc, workspaceId: 'ws-0001' }
    const err = await refusalOf(() => statFile({ loc: ws, relPath: 'nope.md' }))
    expect(err.detail).toContain('workspace ws-0001')
    expect(err.message).not.toContain(root)
  })

  /**
   * `assertSafeId` echoes the id it rejected, raw and uncoded. It is not a
   * host path, but it is the last refusal shape that reached hq unclassified,
   * and it comes out of `locationDir` — which every method calls before it
   * calls anything else.
   */
  it('refuses a crafted owner id with a code, through every method', async () => {
    const crafted: WireLocationRef = { ownerType: 'project', ownerId: '../../etc' }
    const calls: [string, () => Promise<unknown>][] = [
      ['listFiles', () => listFiles({ loc: crafted })],
      ['statFile', () => statFile({ loc: crafted, relPath: 'passwd' })],
      ['ensureDir', () => ensureDir({ loc: crafted })],
      ['seedFiles', () => seedFiles({ loc: crafted, files: [{ relPath: 'x.md', content: 'x', ifAbsent: true }] })],
    ]
    for (const [label, run] of calls) {
      const err = await refusalOf(run)
      expect(err.code, label).toBe('outside')
      expect(err.message, label).not.toContain('Unsafe storage id')
      expect(err.message, label).not.toContain(root)
    }
  })

  it('refuses an existing path that is occupied by a file, as "exists"', async () => {
    const err = await refusalOf(() => ensureDir({ loc, subPath: 'ROADMAP.md' }))
    expect(['exists', 'not_a_directory']).toContain(err.code)
    expect(err.message).not.toContain(root)
  })
})

/**
 * An unreadable directory reported as an empty one is the failure mode where
 * nobody ever finds out. hq surfaces these today and must keep doing so.
 */
describe('listFiles surfaces what it cannot read', () => {
  it('refuses a path that is a file, rather than answering with nothing', async () => {
    const err = await listFiles({ loc, subPath: 'PROJECT.md' }).then(() => null, (e: unknown) => e as LocationFileError)
    expect(err?.code).toBe('not_a_directory')
  })

  it('refuses a directory it may not read, rather than answering with nothing', async () => {
    if (process.getuid?.() === 0) return // root reads everything; the case cannot be staged
    const locked = path.join(dir, 'locked')
    await fs.mkdir(locked)
    await fs.writeFile(path.join(locked, 'inside.md'), 'x')
    await fs.chmod(locked, 0o000)
    try {
      const err = await listFiles({ loc, subPath: 'locked' }).then(() => null, (e: unknown) => e as LocationFileError)
      expect(err?.code).toBe('refused')
      expect(err?.message).not.toContain(root)
    } finally {
      await fs.chmod(locked, 0o700)
    }
  })

  // A location whose disk has not been provisioned yet is an ordinary state,
  // and this is the one case that stays an empty listing rather than a refusal.
  it('still answers empty for a location that does not exist yet', async () => {
    const fresh: WireLocationRef = { ownerType: 'user', ownerId: 'user-9999' }
    expect(await listFiles({ loc: fresh })).toEqual({ entries: [] })
  })
})

describe('the seed bounds', () => {
  it('refuses more files than a set of starter documents would ever be', async () => {
    const files = Array.from({ length: LOCATION_SEED_MAX_FILES + 1 }, (_, i) => ({ relPath: `f${i}.md`, content: '', ifAbsent: true }))
    const err = await seedFiles({ loc, files }).then(() => null, (e: unknown) => e as LocationFileError)
    expect(err?.code).toBe('too_many')
    // Nothing was written: the bound is checked before any path is touched.
    expect((await listFiles({ loc })).entries.map(e => e.name)).not.toContain('f0.md')
  })

  it('refuses a byte total over the cap, writing nothing', async () => {
    const files = [{ relPath: 'huge.md', content: 'x'.repeat(LOCATION_SEED_MAX_BYTES + 1), ifAbsent: true }]
    const err = await seedFiles({ loc, files }).then(() => null, (e: unknown) => e as LocationFileError)
    expect(err?.code).toBe('too_large')
    expect((await listFiles({ loc })).entries.map(e => e.name)).not.toContain('huge.md')
  })
})

/**
 * A payload that does not parse is a refusal with a code, not a `ZodError`.
 *
 * The repository-work methods settled this: left outside the guard, a zod
 * error crosses the channel raw, hq's decoder finds no marker on it, and a
 * person is shown a blob of validation issues under a 500. These four methods
 * were written before that convention and did not have it.
 */
describe('a payload the wire does not accept', () => {
  const badPayloads: [string, () => Promise<unknown>][] = [
    [LOCATION_FILE_METHODS.listFiles, () => listFiles({ loc, subPath: 3 })],
    [LOCATION_FILE_METHODS.statFile, () => statFile({ loc })],
    [LOCATION_FILE_METHODS.seedFiles, () => seedFiles({ loc, files: [{ relPath: 'x.md', content: 'x' }] })],
    [LOCATION_FILE_METHODS.ensureDir, () => ensureDir({ loc: { ownerType: 'product', ownerId: 'x' } })],
  ]

  it.each(badPayloads)('%s refuses it as invalid, with a code hq can read', async (method, call) => {
    const err = await call().then(() => null, (e: unknown) => e as LocationFileError)
    expect(err).toBeInstanceOf(LocationFileError)
    expect(err?.code).toBe('invalid')
    expect(err?.detail).toContain(method)
    // Nothing of what arrived is echoed back, and nothing of this disk is
    // named: the refusal knows only which method was called.
    expect(err?.detail).not.toContain(root)
    expect(err?.detail).not.toContain('zod')
  })
})
