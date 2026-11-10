/**
 * `file.about` (spec part 1, step 3; part 6, T6 and V2): facts about a file in each of the site's spaces, from the open
 * descriptor, through the same confinement as a read; coded refusals for `..`, symbolic and hard links out of a place,
 * an owner folder or the knowledge pages, and a knowledge version that is not there. No answer names a path on this
 * disk.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { LocationFileError, TEXT_SNIFF_BYTES, fileVersion, type LocationRef } from '@agenthix/core'
import { getArtefactsDir, knowledgePagesDir, knowledgeVersionsDir, locationDir } from '../../storage/paths'
import { fileAbout } from '../fileAbout'

const loc: LocationRef = { ownerType: 'project', ownerId: 'proj-0001' }
const owner = { ownerType: 'project' as const, ownerId: 'proj-0001' }
const VERSION_ID = '20261026T101500123Z-0a1b2c3d'
const PAGE = '# How sign-in works\n'

let root: string
let outside: string
let place: string
let artefacts: string
let pages: string
const savedSiteRoot = process.env.SITE_ROOT

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'site-outside-'))
  process.env.SITE_ROOT = root
  place = locationDir(loc)
  artefacts = getArtefactsDir(owner.ownerType, owner.ownerId)
  pages = knowledgePagesDir(owner)
  await fs.mkdir(path.join(place, 'docs'), { recursive: true })
  await fs.mkdir(artefacts, { recursive: true })
  await fs.mkdir(path.join(pages, 'decisions'), { recursive: true })
  await fs.mkdir(path.join(knowledgeVersionsDir(owner), 'decisions', 'auth.md'), { recursive: true })
  await fs.writeFile(path.join(place, 'docs', 'a.md'), 'abcdef')
  await fs.writeFile(path.join(place, 'image.bin'), Buffer.from([0x89, 0x50, 0x00, 0x01]))
  await fs.writeFile(path.join(artefacts, 'report.csv'), 'a,b\n1,2\n')
  await fs.writeFile(path.join(pages, 'decisions', 'auth.md'), PAGE)
  await fs.writeFile(path.join(knowledgeVersionsDir(owner), 'decisions', 'auth.md', `${VERSION_ID}.md`), '# Old\n')
  await fs.writeFile(path.join(outside, 'secret.md'), 'OUTSIDE SECRET\n')
})

afterEach(async () => {
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
  await fs.rm(root, { recursive: true, force: true })
  await fs.rm(outside, { recursive: true, force: true })
})

async function about(params: unknown) {
  const answer = await fileAbout(params)
  expect(JSON.stringify(answer)).not.toContain(root)
  expect(JSON.stringify(answer)).not.toContain(outside)
  return answer
}

const placeFile = (p: string) => ({ space: 'place', loc, path: p })
const artefact = (name: string) => ({ space: 'artefact', owner, name })
const page = (p: string, versionId?: string) => ({ space: 'knowledge', owner, path: p, ...(versionId ? { versionId } : {}) })

describe('file.about: the facts @SC-1490', () => {
  it("answers a place's file from its descriptor: name, size, time, version, type guess, text", async () => {
    const s = await fs.stat(path.join(place, 'docs', 'a.md'))
    expect(await about(placeFile('docs/a.md'))).toEqual({
      ok: true,
      name: 'a.md',
      size: 6,
      modifiedAt: s.mtime.toISOString(),
      version: fileVersion(s.size, s.mtimeMs),
      contentType: 'text/markdown',
      looksLikeText: true,
    })
  })

  it('says a file whose first bytes hold a NUL is not text', async () => {
    expect(await about(placeFile('image.bin'))).toMatchObject({ ok: true, looksLikeText: false })
  })

  it('judges only the first bytes: a NUL past them is not seen', async () => {
    await fs.writeFile(path.join(place, 'long.txt'), Buffer.concat([Buffer.alloc(TEXT_SNIFF_BYTES, 'a'), Buffer.from([0])]))
    expect(await about(placeFile('long.txt'))).toMatchObject({ ok: true, looksLikeText: true, size: TEXT_SNIFF_BYTES + 1 })
  })

  it('answers an empty file as text of size 0', async () => {
    await fs.writeFile(path.join(place, 'empty.txt'), '')
    expect(await about(placeFile('empty.txt'))).toMatchObject({ ok: true, size: 0, looksLikeText: true })
  })

  it('answers an artefact by its name', async () => {
    const s = await fs.stat(path.join(artefacts, 'report.csv'))
    expect(await about(artefact('report.csv'))).toMatchObject({
      ok: true, name: 'report.csv', size: s.size, version: fileVersion(s.size, s.mtimeMs), contentType: 'text/csv',
    })
  })

  it('answers a knowledge page, and one of its kept versions, by the page name', async () => {
    expect(await about(page('decisions/auth.md'))).toMatchObject({ ok: true, name: 'auth.md', size: PAGE.length })
    expect(await about(page('decisions/auth.md', VERSION_ID))).toMatchObject({ ok: true, name: 'auth.md', size: 6 })
  })

  it('follows a symbolic link that stays inside a place', async () => {
    await fs.symlink(path.join(place, 'docs', 'a.md'), path.join(place, 'inside.md'))
    expect(await about(placeFile('inside.md'))).toMatchObject({ ok: true, name: 'inside.md', size: 6 })
  })
})

describe('file.about: refusals @SC-1491 @SC-1567 @SC-1894', () => {
  it('answers a missing file and a directory apart, in every space', async () => {
    expect(await about(placeFile('docs/none.md'))).toEqual({ ok: false, refusal: 'not-found' })
    expect(await about(placeFile('docs'))).toEqual({ ok: false, refusal: 'not-a-file' })
    expect(await about(artefact('none.md'))).toEqual({ ok: false, refusal: 'not-found' })
    await fs.mkdir(path.join(artefacts, 'a-set'))
    expect(await about(artefact('a-set'))).toEqual({ ok: false, refusal: 'not-a-file' })
    expect(await about(page('decisions/none.md'))).toEqual({ ok: false, refusal: 'not-found' })
  })

  it.each([
    ['a place path with ..', () => placeFile(`../../../${path.basename(outside)}/secret.md`)],
    ['an artefact name that is a path', () => artefact('../files/AGENTS.md')],
    ['a knowledge path with ..', () => page('../../../../secret.md')],
  ])('answers %s as not found', async (_name, params) => {
    expect(await about(params())).toEqual({ ok: false, refusal: 'not-found' })
  })

  it('answers an absolute place path as not found', async () => {
    expect(await about(placeFile(path.join(outside, 'secret.md')))).toEqual({ ok: false, refusal: 'not-found' })
  })

  it.each([
    ['a place', () => path.join(place, 'link.md'), () => placeFile('link.md')],
    ['the artefacts folder', () => path.join(artefacts, 'link.md'), () => artefact('link.md')],
    ['the knowledge pages', () => path.join(pages, 'link.md'), () => page('link.md')],
  ])('answers a symbolic link out of %s as not found', async (_name, at, params) => {
    await fs.symlink(path.join(outside, 'secret.md'), at())
    expect(await about(params())).toEqual({ ok: false, refusal: 'not-found' })
  })

  it.each([
    ['a place', () => path.join(place, 'hard.md'), () => placeFile('hard.md')],
    ['the artefacts folder', () => path.join(artefacts, 'hard.md'), () => artefact('hard.md')],
    ['the knowledge pages', () => path.join(pages, 'hard.md'), () => page('hard.md')],
  ])('answers a hard link out of %s as linked, its own reason', async (_name, at, params) => {
    // Inside the site root, so the link can be made on the same file system.
    await fs.writeFile(path.join(root, 'secret.md'), 'OUTSIDE SECRET\n')
    await fs.link(path.join(root, 'secret.md'), at())
    expect(await about(params())).toEqual({ ok: false, refusal: 'linked' })
  })

  it('answers a knowledge version that is not there, or not a version id, as not found', async () => {
    expect(await about(page('decisions/auth.md', '20261026T101500123Z-ffffffff'))).toEqual({ ok: false, refusal: 'not-found' })
    expect(await about(page('decisions/auth.md', '../../../secret'))).toEqual({ ok: false, refusal: 'not-found' })
  })

  it('answers an owner id this site would never store as not found, without echoing it', async () => {
    expect(await about({ space: 'knowledge', owner: { ownerType: 'project', ownerId: '..' }, path: 'a.md' }))
      .toEqual({ ok: false, refusal: 'not-found' })
  })

  it.each([
    ['nothing', undefined],
    ['an upload', { space: 'upload', path: '/files/task/t1/a1/x.png' }],
    ['an unknown space', { space: 'elsewhere', path: 'a.md' }],
    ['a place with no location', { space: 'place', path: 'a.md' }],
  ])('refuses %s as a malformed request', async (_name, params) => {
    const err = await fileAbout(params).catch(e => e)
    expect(err).toBeInstanceOf(LocationFileError)
    expect((err as LocationFileError).code).toBe('invalid')
  })
})
