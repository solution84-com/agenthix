/**
 * `location.listArtefacts` and `location.listKnowledge`: an owner's folders
 * beside its `files/`, listed for hq's Artefacts and Knowledge tools.
 *
 * What is pinned: what each lists (regular files, with size and time, newest
 * first), that a link is never listed or followed — at an entry, at a
 * directory, or standing in for the folder itself — and that a refusal names
 * no path on the site's disk.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  LOCATION_FILE_METHODS,
  LocationFileError,
  type LocationListArtefactsParams,
  type LocationListKnowledgeParams,
  type LocationReadArtefactParams,
  type LocationReadKnowledgeParams,
} from '@agenthix/core'

vi.mock('#db', () => ({ prisma: {} }))

import {
  listArtefacts,
  listArtefactsParams,
  listKnowledgeParams,
  readArtefactParams,
  readKnowledgeParams,
} from '../ownerFolderMethods'
import { channelMethods } from '../../hq/channelMethods'
import { getArtefactsDir, getFilesDir } from '../paths'

const owner = { ownerType: 'project' as const, ownerId: 'proj-0001' }

let root: string
let outside: string
let artefacts: string
const savedSiteRoot = process.env.SITE_ROOT

async function writeAt(file: string, body: string, when: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, body)
  await fs.utimes(file, new Date(when), new Date(when))
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'site-outside-'))
  process.env.SITE_ROOT = root
  artefacts = getArtefactsDir(owner.ownerType, owner.ownerId)
  await fs.mkdir(getFilesDir(owner.ownerType, owner.ownerId), { recursive: true })
  await fs.writeFile(path.join(outside, 'secret.md'), 'not yours\n')
})

afterEach(async () => {
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
  await fs.rm(root, { recursive: true, force: true })
  await fs.rm(outside, { recursive: true, force: true })
})

describe('location.listArtefacts @SC-780', () => {
  it('lists each file directly in artefacts/, newest first, with its size and time', async () => {
    await writeAt(path.join(artefacts, 'older.md'), 'one\n', '2026-01-01T00:00:00.000Z')
    await writeAt(path.join(artefacts, 'pricing-options.pdf'), 'two two\n', '2026-02-01T00:00:00.000Z')
    expect(await listArtefacts(owner)).toEqual({
      entries: [
        { path: 'pricing-options.pdf', size: 8, modifiedAt: '2026-02-01T00:00:00.000Z' },
        { path: 'older.md', size: 4, modifiedAt: '2026-01-01T00:00:00.000Z' },
      ],
    })
  })

  it('lists no folder and no link — an artefact is one file', async () => {
    await writeAt(path.join(artefacts, 'kept.md'), 'x', '2026-01-01T00:00:00.000Z')
    await fs.mkdir(path.join(artefacts, 'a-set'))
    await fs.writeFile(path.join(artefacts, 'a-set', 'inside.md'), 'x')
    await fs.symlink(path.join(outside, 'secret.md'), path.join(artefacts, 'escape.md'))
    const { entries } = await listArtefacts(owner)
    expect(entries.map(e => e.path)).toEqual(['kept.md'])
  })

  it('answers empty when nothing has been written there yet', async () => {
    expect(await listArtefacts(owner)).toEqual({ entries: [] })
  })

  it('refuses an artefacts folder that is a link, without naming where anything is', async () => {
    await fs.symlink(outside, artefacts)
    const err = await listArtefacts(owner).then(() => null, (e: unknown) => e as LocationFileError)
    expect(err).toBeInstanceOf(LocationFileError)
    expect(err?.code).toBe('outside')
    expect(err?.message).not.toContain(root)
    expect(err?.message).not.toContain(outside)
  })

  it('refuses a crafted owner id as a coded refusal', async () => {
    const err = await listArtefacts({ ownerType: 'project', ownerId: '../x' }).then(() => null, (e: unknown) => e as LocationFileError)
    expect(err?.code).toBe('outside')
  })

  it('refuses a payload it does not accept as invalid', async () => {
    const err = await listArtefacts({ ...owner, ownerId: '' }).then(() => null, (e: unknown) => e as LocationFileError)
    expect(err?.code).toBe('invalid')
  })
})

describe('the wire', () => {
  it('registers both listings on the control channel under the names core publishes', () => {
    expect(channelMethods[LOCATION_FILE_METHODS.listArtefacts]).toBeTypeOf('function')
    expect(channelMethods[LOCATION_FILE_METHODS.listKnowledge]).toBeTypeOf('function')
  })

  it('validates exactly the fields each core params type declares, and no caller', () => {
    const listA: Record<keyof LocationListArtefactsParams, true> = { ownerType: true, ownerId: true }
    const readA: Record<keyof LocationReadArtefactParams, true> = { ownerType: true, ownerId: true, name: true, maxBytes: true }
    const listK: Record<keyof LocationListKnowledgeParams, true> = { ownerType: true, ownerId: true }
    const readK: Record<keyof LocationReadKnowledgeParams, true> = { ownerType: true, ownerId: true, relPath: true, maxBytes: true, versionId: true }
    const pairs: [{ shape: object }, object][] = [
      [listArtefactsParams, listA],
      [readArtefactParams, readA],
      [listKnowledgeParams.innerType(), listK],
      [readKnowledgeParams.innerType(), readK],
    ]
    for (const [schema, expected] of pairs) {
      expect(Object.keys(schema.shape).sort()).toEqual(Object.keys(expected).sort())
      expect(Object.keys(schema.shape)).not.toContain('userId')
    }
  })

  it('lists and searches the organisation\'s knowledge by its one id only @SC-1391 @SC-1393', () => {
    expect(listKnowledgeParams.safeParse({ ownerType: 'org', ownerId: 'org' }).success).toBe(true)
    expect(listKnowledgeParams.safeParse({ ownerType: 'org', ownerId: 'other' }).success).toBe(false)
  })

  it('takes an artefact by name, never by a path', () => {
    for (const name of ['a/b.md', '../x.md', '..', '.', 'a\\b.md', '']) {
      expect(readArtefactParams.safeParse({ ...owner, name, maxBytes: 10 }).success).toBe(false)
    }
    expect(readArtefactParams.safeParse({ ...owner, name: 'pricing-options.pdf', maxBytes: 10 }).success).toBe(true)
  })
})

describe('the knowledge methods site protocol 1.7 added', () => {
  it('reads a kept version, and the organisation\'s knowledge by its one id @SC-1390 @SC-1392', () => {
    expect(readKnowledgeParams.safeParse({ ...owner, relPath: 'a.md', maxBytes: 10 }).success).toBe(true)
    expect(readKnowledgeParams.safeParse({ ...owner, relPath: 'a.md', maxBytes: 10, versionId: 'v1' }).success).toBe(true)
    expect(readKnowledgeParams.safeParse({ ownerType: 'org', ownerId: 'org', relPath: 'a.md', maxBytes: 10 }).success).toBe(true)
    expect(readKnowledgeParams.safeParse({ ownerType: 'org', ownerId: 'other', relPath: 'a.md', maxBytes: 10 }).success).toBe(false)
  })
})
