/**
 * `location.readArtefact` and `location.readKnowledge` on the content
 * transport: one file out of an owner's `artefacts/` or `knowledge/`.
 *
 * They share `location.readFile`'s stream, so what is pinned here is what is
 * theirs: the address (an artefact by name, knowledge by path), containment
 * that refuses every link — not only one leading out — the size bound checked
 * before a byte is sent, and refusals that name no path on the site's disk.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { LOCATION_FILE_METHODS, LocationFileError } from '@agenthix/core'
import { contentMethods } from '../contentMethods'
import { handleArtefactRead, handleKnowledgeRead } from '../locationReadHandler'
import { getArtefactsDir, getFilesDir, knowledgePagesDir, knowledgeVersionsDir } from '../../../storage/paths'
import { openRead } from './contentReadHarness'
import { replaceWithLink } from '../../../storage/__tests__/swapAfterCheck'

const owner = { ownerType: 'project' as const, ownerId: 'proj-0001' }
const PRICING = '# Pricing options\n'
const AUTH = '# How sign-in works\n'
const MAX = 1_000_000

let root: string
let outside: string
let artefacts: string
let knowledge: string
const savedSiteRoot = process.env.SITE_ROOT

const readArtefact = (params: unknown) =>
  openRead(params, undefined, undefined, handleArtefactRead, LOCATION_FILE_METHODS.readArtefact)
const readKnowledge = (params: unknown) =>
  openRead(params, undefined, undefined, handleKnowledgeRead, LOCATION_FILE_METHODS.readKnowledge)

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'site-outside-'))
  process.env.SITE_ROOT = root
  artefacts = getArtefactsDir(owner.ownerType, owner.ownerId)
  knowledge = knowledgePagesDir(owner)
  await fs.mkdir(artefacts, { recursive: true })
  await fs.mkdir(path.join(knowledge, 'decisions'), { recursive: true })
  await fs.mkdir(getFilesDir(owner.ownerType, owner.ownerId), { recursive: true })
  await fs.writeFile(path.join(artefacts, 'pricing-options.md'), PRICING)
  await fs.writeFile(path.join(knowledge, 'decisions', 'auth.md'), AUTH)
  await fs.writeFile(path.join(getFilesDir(owner.ownerType, owner.ownerId), 'AGENTS.md'), 'not an artefact\n')
  await fs.writeFile(path.join(outside, 'secret.md'), 'OUTSIDE SECRET\n')
})

afterEach(async () => {
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
  await fs.rm(root, { recursive: true, force: true })
  await fs.rm(outside, { recursive: true, force: true })
})

/** The code a read was refused with, after checking the refusal names nothing on this disk. */
async function refusedWith(read: ReturnType<typeof openRead>): Promise<string | undefined> {
  await read.handled()
  const err = read.failure()
  expect(err).toBeInstanceOf(LocationFileError)
  expect(err?.message).not.toContain(root)
  expect(err?.message).not.toContain(outside)
  expect(read.body().length).toBe(0)
  return (err as LocationFileError).code
}

describe('location.readArtefact @SC-780', () => {
  it("streams an artefact's bytes by its name and ends its half of the stream", async () => {
    const read = readArtefact({ ...owner, name: 'pricing-options.md', maxBytes: MAX })
    await read.outcome
    expect(read.body().toString('utf8')).toBe(PRICING)
    expect(read.writableEnded()).toBe(true)
    await vi.waitFor(() => expect(read.handlerSettled()).toBe('resolved'))
  })

  it('refuses a name that is a path, as a malformed request', async () => {
    expect(await refusedWith(readArtefact({ ...owner, name: '../files/AGENTS.md', maxBytes: MAX }))).toBe('invalid')
  })

  it('refuses a link even when it points back inside', async () => {
    await fs.symlink(path.join(artefacts, 'pricing-options.md'), path.join(artefacts, 'alias.md'))
    expect(await refusedWith(readArtefact({ ...owner, name: 'alias.md', maxBytes: MAX }))).toBe('outside')
  })

  it('refuses a link pointing outside', async () => {
    await fs.symlink(path.join(outside, 'secret.md'), path.join(artefacts, 'escape.md'))
    expect(await refusedWith(readArtefact({ ...owner, name: 'escape.md', maxBytes: MAX }))).toBe('outside')
  })

  it('refuses when the artefacts folder itself has been replaced by a link', async () => {
    await fs.rm(artefacts, { recursive: true })
    await fs.writeFile(path.join(outside, 'pricing-options.md'), 'OUTSIDE SECRET\n')
    await fs.symlink(outside, artefacts)
    expect(await refusedWith(readArtefact({ ...owner, name: 'pricing-options.md', maxBytes: MAX }))).toBe('outside')
  })

  it('refuses a file over the size the caller will take, before sending any of it', async () => {
    expect(await refusedWith(readArtefact({ ...owner, name: 'pricing-options.md', maxBytes: 3 }))).toBe('too_large')
  })

  it('fails a missing artefact as not found', async () => {
    expect(await refusedWith(readArtefact({ ...owner, name: 'nope.md', maxBytes: MAX }))).toBe('not_found')
  })

  it('refuses a directory', async () => {
    await fs.mkdir(path.join(artefacts, 'a-set'))
    expect(await refusedWith(readArtefact({ ...owner, name: 'a-set', maxBytes: MAX }))).toBe('not_a_file')
  })
})

describe('location.readKnowledge @SC-1392', () => {
  it('streams a page by its path in the knowledge pages, outside the folder runs mount', async () => {
    const read = readKnowledge({ ...owner, relPath: 'decisions/auth.md', maxBytes: MAX })
    await read.outcome
    expect(read.body().toString('utf8')).toBe(AUTH)
    expect(read.writableEnded()).toBe(true)
  })

  it('streams a kept version by its id', async () => {
    const id = '20261025T120000000Z-0123abcd'
    const kept = path.join(knowledgeVersionsDir(owner), 'decisions', 'auth.md')
    await fs.mkdir(kept, { recursive: true })
    await fs.writeFile(path.join(kept, `${id}.md`), '# Before\n')
    const read = readKnowledge({ ...owner, relPath: 'decisions/auth.md', versionId: id, maxBytes: MAX })
    await read.outcome
    expect(read.body().toString('utf8')).toBe('# Before\n')
  })

  it('fails a version id that is not one, or not kept, as not found', async () => {
    expect(await refusedWith(readKnowledge({ ...owner, relPath: 'decisions/auth.md', versionId: '../../x', maxBytes: MAX }))).toBe('not_found')
    expect(await refusedWith(readKnowledge({
      ...owner, relPath: 'decisions/auth.md', versionId: '20261025T120000000Z-0123abcd', maxBytes: MAX,
    }))).toBe('not_found')
  })

  it("never reads the old knowledge folder inside the owner's folder @SC-1384", async () => {
    const old = path.join(path.dirname(getFilesDir(owner.ownerType, owner.ownerId)), 'knowledge')
    await fs.mkdir(old, { recursive: true })
    await fs.writeFile(path.join(old, 'old.md'), 'OLD\n')
    expect(await refusedWith(readKnowledge({ ...owner, relPath: 'old.md', maxBytes: MAX }))).toBe('not_found')
  })

  it("refuses a climb out of the pages, even into the owner's own files", async () => {
    expect(await refusedWith(readKnowledge({ ...owner, relPath: '../files/AGENTS.md', maxBytes: MAX }))).toBe('outside')
    expect(await refusedWith(readKnowledge({ ...owner, relPath: '../../../projects/proj-0001/files/AGENTS.md', maxBytes: MAX }))).toBe('outside')
  })

  it('refuses an absolute path', async () => {
    expect(await refusedWith(readKnowledge({ ...owner, relPath: path.join(outside, 'secret.md'), maxBytes: MAX }))).toBe('outside')
  })

  it('refuses a path through a linked directory, even one that stays inside', async () => {
    await fs.symlink(path.join(knowledge, 'decisions'), path.join(knowledge, 'alias'))
    expect(await refusedWith(readKnowledge({ ...owner, relPath: 'alias/auth.md', maxBytes: MAX }))).toBe('outside')
  })

  it('refuses a page that is a link', async () => {
    await fs.symlink(path.join(outside, 'secret.md'), path.join(knowledge, 'escape.md'))
    expect(await refusedWith(readKnowledge({ ...owner, relPath: 'escape.md', maxBytes: MAX }))).toBe('outside')
  })

  it('sends none of a file outside when a directory is swapped for a link after the check', async () => {
    await fs.writeFile(path.join(outside, 'auth.md'), 'OUTSIDE SECRET\n')
    const dir = path.join(knowledge, 'decisions')
    const realOpen = fs.open
    const spy = vi.spyOn(fs, 'open').mockImplementation((async (...args: Parameters<typeof fs.open>) => {
      spy.mockRestore()
      await replaceWithLink(dir, outside)
      return realOpen(...args)
    }) as typeof fs.open)
    try {
      const read = readKnowledge({ ...owner, relPath: 'decisions/auth.md', maxBytes: MAX })
      await expect(read.outcome).rejects.toMatch(/outside/i)
      expect(read.body().toString('utf8')).not.toContain('OUTSIDE SECRET')
    } finally {
      spy.mockRestore()
    }
  })

  it('reads the organisation\'s knowledge', async () => {
    const org = { ownerType: 'org' as const, ownerId: 'org' }
    await fs.mkdir(knowledgePagesDir(org), { recursive: true })
    await fs.writeFile(path.join(knowledgePagesDir(org), 'brand.md'), '# Brand\n')
    const read = readKnowledge({ ...org, relPath: 'brand.md', maxBytes: MAX })
    await read.outcome
    expect(read.body().toString('utf8')).toBe('# Brand\n')
  })
})

describe('the content registry', () => {
  it('serves both reads under the names core publishes @SC-780 @SC-1392', () => {
    expect(contentMethods[LOCATION_FILE_METHODS.readArtefact]).toBe(handleArtefactRead)
    expect(contentMethods[LOCATION_FILE_METHODS.readKnowledge]).toBe(handleKnowledgeRead)
  })
})
