/**
 * `files.serve` for the spaces beside a place (spec part 6, T5, T6, V2): an artefact and a knowledge page, or one of its
 * kept versions, served on a ticket through the same reader as a place's file — the same head, ranges and version
 * check — and confined as their reads are: every link refused, hard links refused, a version that is not there not
 * found. A ticket for an upload is never served by a site.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  FILES_SERVE_METHOD,
  createStreamHeadReader,
  fileVersion,
  type FileServeHead,
  type SiteFileRef,
} from '@agenthix/core'
import { getArtefactsDir, knowledgePagesDir, knowledgeVersionsDir } from '../../storage/paths'
import { openRead } from '../../hq/content/__tests__/contentReadHarness'
import { createFilesServe } from '../filesServe'
import { ReadSlots } from '../readSlots'
import { RELAY_ID, SITE_ID, fileTicketClaims, fixedKeys, makeKey, signToken } from './ticketKit'

const opened = vi.hoisted(() => ({ count: 0 }))
vi.mock('../../files/openSiteFile', async importOriginal => {
  const real = await importOriginal<typeof import('../../files/openSiteFile')>()
  return {
    ...real,
    openSiteFile: (...args: Parameters<typeof real.openSiteFile>) => {
      opened.count++
      return real.openSiteFile(...args)
    },
  }
})

const hqKey = makeKey('hq-1')
const owner = { ownerType: 'project' as const, ownerId: 'proj-0001' }
const VERSION_ID = '20261026T101500123Z-0a1b2c3d'
const REPORT = 'region,total\nnorth,12\nsouth,30\n'
const PAGE = '# How sign-in works\n'
const OLD = '# Sign-in, as it was\n'

let root: string
let artefacts: string
let pages: string
let versions: string
const savedSiteRoot = process.env.SITE_ROOT

beforeEach(async () => {
  opened.count = 0
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  process.env.SITE_ROOT = root
  artefacts = getArtefactsDir(owner.ownerType, owner.ownerId)
  pages = knowledgePagesDir(owner)
  versions = path.join(knowledgeVersionsDir(owner), 'decisions', 'auth.md')
  await fs.mkdir(artefacts, { recursive: true })
  await fs.mkdir(path.join(pages, 'decisions'), { recursive: true })
  await fs.mkdir(versions, { recursive: true })
  await fs.writeFile(path.join(artefacts, 'report.csv'), REPORT)
  await fs.writeFile(path.join(pages, 'decisions', 'auth.md'), PAGE)
  await fs.writeFile(path.join(versions, `${VERSION_ID}.md`), OLD)
  await fs.writeFile(path.join(root, 'secret.md'), 'not yours\n')
})

afterEach(async () => {
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
  await fs.rm(root, { recursive: true, force: true })
})

async function versionOf(abs: string): Promise<string> {
  try {
    const s = await fs.stat(abs)
    return fileVersion(s.size, s.mtimeMs)
  } catch {
    return 'missing'
  }
}

const artefact = (name: string): SiteFileRef => ({ space: 'artefact', owner, name })
const page = (p: string, versionId?: string): SiteFileRef =>
  ({ space: 'knowledge', owner, path: p, ...(versionId ? { versionId } : {}) })

async function ticket(ref: SiteFileRef, abs: string, over: Record<string, unknown> = {}): Promise<string> {
  return signToken(hqKey, fileTicketClaims(ref, await versionOf(abs), over))
}

async function serve(params: unknown) {
  const handler = createFilesServe({
    siteId: SITE_ID, relayId: RELAY_ID, keys: fixedKeys({ keys: [hqKey.jwk] }), slots: new ReadSlots(),
  })
  const read = openRead(params, undefined, undefined, handler, FILES_SERVE_METHOD)
  await read.outcome
  await vi.waitFor(() => expect(read.handlerSettled()).toBe('resolved'))
  const parsed = createStreamHeadReader().push(new Uint8Array(read.body()))
  if (parsed.state !== 'head') throw new Error(`no head: ${parsed.state}`)
  return { head: parsed.head, bytes: Buffer.from(parsed.rest), read }
}

const refusalOf = (head: FileServeHead) => ('refusal' in head ? head.refusal : null)

describe('files.serve: an artefact @SC-1496 @SC-1567', () => {
  it('serves it whole, named and typed by its name, and ends its half', async () => {
    const { head, bytes, read } = await serve({ ticket: await ticket(artefact('report.csv'), path.join(artefacts, 'report.csv')) })
    expect(head).toEqual({ status: 200, size: REPORT.length, contentType: 'text/csv', purpose: 'preview', fileName: 'report.csv' })
    expect(bytes.toString()).toBe(REPORT)
    expect(read.writableEnded()).toBe(true)
  })

  it('serves a range of it, and a head alone', async () => {
    const t = await ticket(artefact('report.csv'), path.join(artefacts, 'report.csv'), { purpose: 'download' })
    const ranged = await serve({ ticket: t, range: 'bytes=0-5' })
    expect(ranged.head).toMatchObject({ status: 206, range: { start: 0, end: 5 }, purpose: 'download' })
    expect(ranged.bytes.toString()).toBe('region')
    const headOnly = await serve({ ticket: t, headOnly: true })
    expect(headOnly.head).toMatchObject({ status: 200, size: REPORT.length })
    expect(headOnly.bytes.length).toBe(0)
  })

  it('refuses it once it has changed', async () => {
    const t = await ticket(artefact('report.csv'), path.join(artefacts, 'report.csv'))
    await fs.writeFile(path.join(artefacts, 'report.csv'), `${REPORT}east,4\n`)
    expect(refusalOf((await serve({ ticket: t })).head)).toBe('changed')
  })

  it('refuses a symbolic link, even one that stays inside, and a hard link', async () => {
    await fs.symlink(path.join(artefacts, 'report.csv'), path.join(artefacts, 'alias.csv'))
    await fs.symlink(path.join(root, 'secret.md'), path.join(artefacts, 'escape.md'))
    await fs.link(path.join(root, 'secret.md'), path.join(artefacts, 'hard.md'))
    for (const [name, target] of [['alias.csv', 'report.csv'], ['escape.md', '../../../secret.md'], ['hard.md', 'hard.md']]) {
      const { head, bytes } = await serve({ ticket: await ticket(artefact(name), path.join(artefacts, target)) })
      expect(refusalOf(head)).toBe('not-found')
      expect(bytes.length).toBe(0)
    }
  })

  it('refuses when the artefacts folder itself has been replaced by a link out', async () => {
    const elsewhere = path.join(root, 'elsewhere')
    await fs.mkdir(elsewhere)
    await fs.writeFile(path.join(elsewhere, 'report.csv'), REPORT)
    await fs.rm(artefacts, { recursive: true })
    await fs.symlink(elsewhere, artefacts)
    expect(refusalOf((await serve({ ticket: await ticket(artefact('report.csv'), path.join(elsewhere, 'report.csv')) })).head))
      .toBe('not-found')
  })
})

describe('files.serve: a knowledge page @SC-1496', () => {
  it('serves a page by its path', async () => {
    const { head, bytes } = await serve({ ticket: await ticket(page('decisions/auth.md'), path.join(pages, 'decisions', 'auth.md')) })
    expect(head).toMatchObject({ status: 200, size: PAGE.length, contentType: 'text/markdown', fileName: 'auth.md' })
    expect(bytes.toString()).toBe(PAGE)
  })

  it('serves one of its kept versions', async () => {
    const abs = path.join(versions, `${VERSION_ID}.md`)
    const { head, bytes } = await serve({ ticket: await ticket(page('decisions/auth.md', VERSION_ID), abs) })
    expect(head).toMatchObject({ status: 200, size: OLD.length, fileName: 'auth.md' })
    expect(bytes.toString()).toBe(OLD)
  })

  it('refuses a version that is not there, and one that is not a version id', async () => {
    const abs = path.join(versions, `${VERSION_ID}.md`)
    for (const v of ['20261026T101500123Z-ffffffff', '../../../../secret']) {
      expect(refusalOf((await serve({ ticket: await ticket(page('decisions/auth.md', v), abs) })).head)).toBe('not-found')
    }
  })

  it('refuses a symbolic link and a hard link out of the pages', async () => {
    await fs.symlink(path.join(root, 'secret.md'), path.join(pages, 'escape.md'))
    await fs.link(path.join(root, 'secret.md'), path.join(pages, 'hard.md'))
    for (const name of ['escape.md', 'hard.md']) {
      const { head, bytes } = await serve({ ticket: await ticket(page(name), path.join(root, 'secret.md')) })
      expect(refusalOf(head)).toBe('not-found')
      expect(bytes.length).toBe(0)
    }
  })

  it('refuses a page path with .., as a ticket no hq makes, before opening anything', async () => {
    const { head } = await serve({ ticket: await ticket(page('../../../../secret.md'), path.join(root, 'secret.md')) })
    expect(refusalOf(head)).toBe('ticket-invalid')
    expect(opened.count).toBe(0)
  })
})

describe('files.serve: what a site never serves @SC-1497', () => {
  it("refuses a ticket for an upload hq keeps, before opening anything", async () => {
    const claims = fileTicketClaims(artefact('report.csv'), await versionOf(path.join(artefacts, 'report.csv')))
    const upload: Record<string, unknown> = { ...claims, space: 'upload', path: '/files/task/t1/a1/report.csv', aud: RELAY_ID }
    for (const k of ['site', 'owner', 'name']) delete upload[k]
    for (const t of [signToken(hqKey, upload), signToken(hqKey, { ...upload, aud: SITE_ID, site: SITE_ID })]) {
      const { head, bytes } = await serve({ ticket: t })
      expect(refusalOf(head)).toBe('ticket-invalid')
      expect(bytes.length).toBe(0)
    }
    expect(opened.count).toBe(0)
  })

  it("refuses an artefact ticket naming another owner's file as not found, not as that owner's", async () => {
    const other = { space: 'artefact' as const, owner: { ownerType: 'project' as const, ownerId: 'proj-0002' }, name: 'report.csv' }
    expect(refusalOf((await serve({ ticket: await ticket(other, path.join(artefacts, 'report.csv')) })).head)).toBe('not-found')
  })
})
