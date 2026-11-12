/**
 * Replaced and removed pictures' files are deleted (spec, *Replaced and removed files are deleted*), against a stand-in
 * for the rows and the run's own storage folder: after the row is updated, only in that subject's own images folder,
 * never through a link, and a failed delete logged rather than thrown.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

type Row = Record<string, unknown> & { id: string }
const db = vi.hoisted(() => ({
  tables: { agent: new Map(), user: new Map(), team: new Map(), org: new Map() } as Record<string, Map<string, Row>>,
  /** Runs before an update is matched: a second writer landing first, or the database failing. */
  beforeUpdate: null as null | ((table: string, id: string) => void),
}))

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('wasp/server')
  const model = (table: string) => ({
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = db.tables[table].get(where.id)
      return row ? { ...row } : null
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      db.beforeUpdate?.(table, where.id as string)
      const row = db.tables[table].get(where.id as string)
      if (!row || Object.entries(where).some(([k, v]) => row[k] !== v)) return { count: 0 }
      Object.assign(row, data)
      return { count: 1 }
    },
  })
  return { ...actual, prisma: { agent: model('agent'), user: model('user'), team: model('team'), org: model('org') } }
})
vi.mock('../robots', async () => {
  const actual = await vi.importActual<typeof import('../robots')>('../robots')
  return { ...actual, getRobots: async () => null }
})

import { applyDefaultPictures, deletePictureFiles, redrawIfFollowsName, removePicture, saveRecipePicture } from '../service'
import { randomRecipe } from '../../shared/pictures/pictures'
import { smallPictureName } from '../../shared/pictures/files'
import { getHqStorageRoot } from '../../server/hqStoragePaths'

const EMPTY = { avatarUrl: null, avatarRecipe: null, coverUrl: null, coverRecipe: null }
const TOP = { agent: 'agents', user: 'people', team: 'teams' } as const

function add(table: 'agent' | 'user' | 'team' | 'org', extra: Record<string, unknown> = {}): string {
  const id = crypto.randomUUID()
  db.tables[table].set(id, { id, name: 'Design team', isKernel: false, displayName: null, auth: { identities: [{ providerUserId: 'avery' }] }, ...EMPTY, ...extra })
  return id
}
const row = (table: string, id: string) => db.tables[table].get(id)!
const dirOf = (table: 'agent' | 'user' | 'team' | 'org', id: string) =>
  table === 'org' ? path.join(getHqStorageRoot(), 'org', 'images') : path.join(getHqStorageRoot(), TOP[table], id, 'images')
const urlOf = (table: 'agent' | 'user' | 'team' | 'org', id: string, file: string) =>
  table === 'org' ? `/org/images/${file}` : `/${TOP[table]}/${id}/images/${file}`

/** An uploaded picture's two files in the subject's folder, recorded as its avatar; returns its url and file paths. */
async function uploaded(table: 'agent' | 'user' | 'team' | 'org', id: string, field: 'avatarUrl' | 'coverUrl' = 'avatarUrl') {
  const name = `${crypto.randomUUID()}.webp`
  const dir = dirOf(table, id)
  await fs.mkdir(dir, { recursive: true })
  const files = [path.join(dir, name), path.join(dir, smallPictureName(name))]
  for (const f of files) await fs.writeFile(f, 'x')
  const url = urlOf(table, id, name)
  row(table, id)[field] = url
  return { url, files }
}
const exists = (f: string) => fs.lstat(f).then(() => true, () => false)

beforeEach(() => {
  for (const t of Object.values(db.tables)) t.clear()
  db.beforeUpdate = null
  vi.restoreAllMocks()
})

describe('a replaced picture', () => {
  it('has its file and its small copy deleted once the new one is recorded', async () => {
    const id = add('agent')
    const old = await uploaded('agent', id)
    const recipe = await randomRecipe('thumbs', 4, { subject: { kind: 'agent', name: 'x' }, robots: null })
    const saved = await saveRecipePicture({ kind: 'agent', id }, 'avatar', recipe)
    expect(row('agent', id).avatarUrl).toBe(saved.url)
    for (const f of old.files) expect(await exists(f)).toBe(false)
    expect((await fs.readdir(dirOf('agent', id))).sort()).toEqual([path.basename(saved.url), smallPictureName(path.basename(saved.url))].sort())
  })

  it('is kept when the new one is refused: the row still names it', async () => {
    const id = add('agent')
    const old = await uploaded('agent', id)
    await expect(saveRecipePicture({ kind: 'agent', id }, 'avatar', { v: 1, kind: 'avatar', style: 'nope', styleVersion: 1, choices: {} }))
      .rejects.toMatchObject({ statusCode: 400 })
    for (const f of old.files) expect(await exists(f)).toBe(true)
  })

  it('leaves the other picture alone', async () => {
    const id = add('team')
    const cover = await uploaded('team', id, 'coverUrl')
    const recipe = await randomRecipe('initials', 1, { subject: { kind: 'team', name: 'Design team' }, robots: null })
    await saveRecipePicture({ kind: 'team', id }, 'avatar', recipe)
    for (const f of cover.files) expect(await exists(f)).toBe(true)
  })
})

describe('deletePictureFiles', () => {
  it("never deletes a file in another subject's folder that a url names", async () => {
    const mine = add('agent')
    const theirs = add('agent')
    const other = await uploaded('agent', theirs)
    await deletePictureFiles({ kind: 'agent', id: mine }, other.url)
    await deletePictureFiles({ kind: 'person', id: theirs }, other.url)
    for (const f of other.files) expect(await exists(f)).toBe(true)
  })

  it('refuses a url that climbs out of the folder, and an id hq could not have written', async () => {
    const id = add('agent')
    const victim = path.join(getHqStorageRoot(), 'victim.webp')
    await fs.writeFile(victim, 'x')
    await deletePictureFiles({ kind: 'agent', id }, `/agents/${id}/images/../../../victim.webp`)
    await deletePictureFiles({ kind: 'agent', id: '..' }, '/agents/../images/../victim.webp')
    expect(await exists(victim)).toBe(true)
  })

  it("never follows a link: a subject's folder that is a link out of the storage root is left alone", async () => {
    const id = add('agent')
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'pictures-outside-'))
    await fs.writeFile(path.join(outside, 'a.webp'), 'x')
    await fs.mkdir(path.join(getHqStorageRoot(), 'agents', id), { recursive: true })
    await fs.symlink(outside, dirOf('agent', id))
    await deletePictureFiles({ kind: 'agent', id }, `/agents/${id}/images/a.webp`)
    expect(await exists(path.join(outside, 'a.webp'))).toBe(true)
    await fs.rm(outside, { recursive: true, force: true })
  })

  it('removes a link the url names without touching what it points at', async () => {
    const id = add('agent')
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'pictures-outside-'))
    await fs.writeFile(path.join(outside, 'target.webp'), 'x')
    await fs.mkdir(dirOf('agent', id), { recursive: true })
    await fs.symlink(path.join(outside, 'target.webp'), path.join(dirOf('agent', id), 'a.webp'))
    await deletePictureFiles({ kind: 'agent', id }, `/agents/${id}/images/a.webp`)
    expect(await exists(path.join(dirOf('agent', id), 'a.webp'))).toBe(false)
    expect(await exists(path.join(outside, 'target.webp'))).toBe(true)
    await fs.rm(outside, { recursive: true, force: true })
  })

  it('logs a delete that fails and does not throw', async () => {
    const id = add('agent')
    const old = await uploaded('agent', id)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(fs, 'unlink').mockRejectedValue(Object.assign(new Error('busy'), { code: 'EBUSY' }))
    await expect(deletePictureFiles({ kind: 'agent', id }, old.url)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    vi.mocked(fs.unlink).mockRestore()
    for (const f of old.files) expect(await exists(f)).toBe(true)
  })
})

describe('removePicture', () => {
  it("takes a person's avatar back to their initials and deletes the upload", async () => {
    const id = add('user')
    const old = await uploaded('user', id)
    expect(await removePicture({ kind: 'person', id }, 'avatar')).toEqual({ url: null, recipe: null })
    expect(row('user', id).avatarUrl).toBeNull()
    for (const f of old.files) expect(await exists(f)).toBe(false)
  })

  it.each([
    ['agent', 'agent', 'avatar', 'thumbs'],
    ['team', 'team', 'avatar', 'initials'],
    ['org', 'org', 'avatar', 'icons'],
    ['person', 'user', 'cover', 'patterns'],
    ['agent', 'agent', 'cover', 'patterns'],
  ] as const)("takes a %s's uploaded %s back to its generated default (%s), deleting the upload", async (kind, table, which, style) => {
    const id = add(table)
    const field = which === 'avatar' ? 'avatarUrl' : 'coverUrl'
    const old = await uploaded(table, id, field)
    const result = await removePicture({ kind, id }, which)
    expect(result.recipe?.style).toBe(style)
    expect(row(table, id)[field]).toBe(result.url)
    for (const f of old.files) expect(await exists(f)).toBe(false)
  })

  it('answers 404 for a subject that is not there', async () => {
    await expect(removePicture({ kind: 'team', id: crypto.randomUUID() }, 'avatar')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('the files just written, when the row is not updated', () => {
  it('are deleted when the update itself fails', async () => {
    const id = add('agent')
    db.beforeUpdate = () => { throw new Error('the database went away') }
    const recipe = await randomRecipe('thumbs', 4, { subject: { kind: 'agent', name: 'x' }, robots: null })
    await expect(saveRecipePicture({ kind: 'agent', id }, 'avatar', recipe)).rejects.toThrow('the database went away')
    expect(await fs.readdir(dirOf('agent', id))).toEqual([])
  })
})

describe("Kernel's defaults", () => {
  it('are the same whatever id its row has, so a demo reset keeps them; another agent gets its own', async () => {
    const first = add('agent', { name: 'Kernel', isKernel: true })
    const again = add('agent', { name: 'Kernel', isKernel: true })
    const other = add('agent', { name: 'Kernel' })
    const [a, b, c] = [await applyDefaultPictures({ kind: 'agent', id: first }), await applyDefaultPictures({ kind: 'agent', id: again }),
      await applyDefaultPictures({ kind: 'agent', id: other })]
    expect(a.coverRecipe).toEqual(b.coverRecipe)
    expect(a.avatarRecipe).toEqual(b.avatarRecipe)
    expect(c.coverRecipe).not.toEqual(a.coverRecipe)
  })
})

describe('redrawIfFollowsName after two quick renames', () => {
  it('draws again from the row as it is now when the first re-draw lost its guard', async () => {
    const id = add('team', { name: 'Research' })
    const recipe = await randomRecipe('initials', 1, { subject: { kind: 'team', name: 'Design team' }, robots: null })
    const first = await saveRecipePicture({ kind: 'team', id }, 'avatar', recipe)
    // The other rename's re-draw lands first, once.
    let landed = false
    db.beforeUpdate = (table, rowId) => {
      if (landed || table !== 'team' || rowId !== id) return
      landed = true
      row('team', id).avatarUrl = urlOf('team', id, `${crypto.randomUUID()}.webp`)
    }
    const set = await redrawIfFollowsName({ kind: 'team', id })
    expect(set.avatarUrl).toBeDefined()
    expect(set.avatarUrl).not.toBe(first.url)
    expect(row('team', id).avatarUrl).toBe(set.avatarUrl)
  })
})
