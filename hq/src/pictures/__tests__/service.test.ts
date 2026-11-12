/** The picture service against a stand-in for the rows and the real picture writer, in the run's own storage folder. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

type Row = Record<string, unknown> & { id: string }
const db = vi.hoisted(() => ({ tables: { agent: new Map(), user: new Map(), team: new Map(), org: new Map() } as Record<string, Map<string, Row>> }))
const robotsNow = vi.hoisted(() => ({ value: null as null | { names: string[]; robot(name: string): Promise<Buffer> } }))

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('wasp/server')
  const model = (table: string) => ({
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = db.tables[table].get(where.id)
      return row ? { ...row } : null
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const row = db.tables[table].get(where.id as string)
      if (!row || Object.entries(where).some(([k, v]) => (row[k] ?? null) !== v)) return { count: 0 }
      Object.assign(row, data)
      return { count: 1 }
    },
  })
  return { ...actual, prisma: { agent: model('agent'), user: model('user'), team: model('team'), org: model('org') } }
})
vi.mock('../robots', async () => {
  const actual = await vi.importActual<typeof import('../robots')>('../robots')
  return { ...actual, getRobots: async () => robotsNow.value }
})

import { applyDefaultPictures, redrawIfFollowsName, saveRecipePicture, type PictureOwner } from '../service'
import { KERNEL_FALLBACK_RECIPE, randomRecipe } from '../../shared/pictures/pictures'
import { smallPictureName } from '../../shared/pictures/files'
import { getHqStorageRoot } from '../../server/hqStoragePaths'
import type { PictureRecipe } from '../../shared/pictures/recipe'

const EMPTY = { avatarUrl: null, avatarRecipe: null, coverUrl: null, coverRecipe: null }
const robotPicture = () => sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } } }).webp().toBuffer()
const withRobots = () => { robotsNow.value = { names: ['planner-checklist', 'security', 'kernel'], robot: () => robotPicture() } }

let n = 0
function add(table: 'agent' | 'user' | 'team' | 'org', extra: Record<string, unknown> = {}): string {
  n += 1
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  db.tables[table].set(id, { id, name: `Thing ${n}`, isKernel: false, displayName: null, auth: { identities: [{ providerUserId: 'avery' }] }, ...EMPTY, ...extra })
  return id
}
const row = (table: string, id: string) => db.tables[table].get(id)!
const fileOf = (url: unknown) => path.join(getHqStorageRoot(), String(url))

async function expectPictureFiles(url: unknown) {
  expect(typeof url).toBe('string')
  await expect(fs.stat(fileOf(url))).resolves.toBeTruthy()
  await expect(fs.stat(fileOf(path.join(path.dirname(String(url)), smallPictureName(path.basename(String(url))))))).resolves.toBeTruthy()
}

beforeEach(() => {
  for (const t of Object.values(db.tables)) t.clear()
  robotsNow.value = null
})

describe('saveRecipePicture @SC-2008', () => {
  it('writes the full picture and its small copy, and sets the url and the recipe together', async () => {
    const id = add('agent', { name: 'Writer' })
    const recipe = await randomRecipe('thumbs', 3, { subject: { kind: 'agent', name: 'Writer' }, robots: null })
    const saved = await saveRecipePicture({ kind: 'agent', id }, 'avatar', recipe)
    expect(saved.url).toMatch(new RegExp(`^/agents/${id}/images/[0-9a-f-]+\\.webp$`))
    expect(row('agent', id)).toMatchObject({ avatarUrl: saved.url, avatarRecipe: recipe, coverUrl: null })
    await expectPictureFiles(saved.url)
  })

  it('refuses a recipe the registry does not allow, writing nothing', async () => {
    const id = add('team')
    const face = await randomRecipe('thumbs', 3, { subject: { kind: 'agent', name: 'x' }, robots: null })
    await expect(saveRecipePicture({ kind: 'team', id }, 'avatar', face)).rejects.toMatchObject({ statusCode: 400 })
    await expect(saveRecipePicture({ kind: 'team', id }, 'avatar', { ...face, style: 'nope' })).rejects.toMatchObject({ statusCode: 400 })
    expect(row('team', id)).toMatchObject(EMPTY)
    await expect(fs.readdir(path.join(getHqStorageRoot(), 'teams', id, 'images'))).rejects.toThrow()
  })

  it('answers 404 for a subject that is not there', async () => {
    const recipe = await randomRecipe('patterns', 1, { subject: { kind: 'org', name: 'x' }, robots: null })
    await expect(saveRecipePicture({ kind: 'org', id: 'missing' }, 'cover', recipe)).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('applyDefaultPictures', () => {
  const defaults = async (owner: PictureOwner, table: string) => {
    const set = await applyDefaultPictures(owner)
    return { set, row: row(table, owner.id) }
  }

  it('gives an agent a Thumbs character without the robots, and a cover @SC-2002', async () => {
    const id = add('agent')
    const { set, row: r } = await defaults({ kind: 'agent', id }, 'agent')
    expect((r.avatarRecipe as PictureRecipe).style).toBe('thumbs')
    expect((r.coverRecipe as PictureRecipe).style).toBe('patterns')
    expect(set).toMatchObject({ avatarUrl: r.avatarUrl, coverUrl: r.coverUrl })
    await expectPictureFiles(r.avatarUrl)
    await expectPictureFiles(r.coverUrl)
  })

  it('gives an agent a robot, never Kernel\'s, where the robots are installed @SC-2002', async () => {
    withRobots()
    for (let i = 0; i < 4; i++) {
      const id = add('agent')
      const { row: r } = await defaults({ kind: 'agent', id }, 'agent')
      const recipe = r.avatarRecipe as PictureRecipe
      expect(recipe.style).toBe('robots')
      expect(recipe.choices.robot).not.toBe('kernel')
    }
  })

  it('gives Kernel its own robot, or its fixed Thumbs look without the robots @SC-2003', async () => {
    const without = add('agent', { name: 'Kernel', isKernel: true })
    await applyDefaultPictures({ kind: 'agent', id: without })
    expect(row('agent', without).avatarRecipe).toEqual(KERNEL_FALLBACK_RECIPE)
    expect((row('agent', without).coverRecipe as PictureRecipe).style).toBe('patterns')

    withRobots()
    const withThem = add('agent', { name: 'Kernel', isKernel: true })
    await applyDefaultPictures({ kind: 'agent', id: withThem })
    expect((row('agent', withThem).avatarRecipe as PictureRecipe).choices.robot).toBe('kernel')
  })

  it('gives a person a cover only: they keep their initials @SC-2004', async () => {
    const id = add('user')
    const { row: r } = await defaults({ kind: 'person', id }, 'user')
    expect(r.avatarUrl).toBeNull()
    expect(r.coverUrl).toMatch(new RegExp(`^/people/${id}/images/`))
    await expectPictureFiles(r.coverUrl)
  })

  it('gives a team Initials and a cover, and the organisation an Icons symbol and a cover @SC-2004', async () => {
    const team = add('team', { name: 'Design team' })
    const t = (await defaults({ kind: 'team', id: team }, 'team')).row
    expect((t.avatarRecipe as PictureRecipe).style).toBe('initials')
    expect(t.avatarUrl).toMatch(new RegExp(`^/teams/${team}/images/`))
    expect((t.coverRecipe as PictureRecipe).style).toBe('patterns')

    const org = add('org')
    const o = (await defaults({ kind: 'org', id: org }, 'org')).row
    expect((o.avatarRecipe as PictureRecipe).style).toBe('icons')
    expect(o.coverUrl).toMatch(/^\/org\/images\//)
  })

  it('draws the same pictures for the same subject, from its id @SC-2002', async () => {
    const id = add('team')
    await applyDefaultPictures({ kind: 'team', id })
    const first = { ...row('team', id) }
    Object.assign(row('team', id), EMPTY)
    await applyDefaultPictures({ kind: 'team', id })
    expect(row('team', id).avatarRecipe).toEqual(first.avatarRecipe)
    expect(row('team', id).coverRecipe).toEqual(first.coverRecipe)
    expect(row('team', id).avatarUrl).not.toBe(first.avatarUrl)
  })

  it('leaves a picture the subject already has @SC-2002', async () => {
    const id = add('agent', { avatarUrl: '/agents/x/images/mine.webp' })
    const set = await applyDefaultPictures({ kind: 'agent', id })
    expect(row('agent', id).avatarUrl).toBe('/agents/x/images/mine.webp')
    expect(set.avatarUrl).toBeUndefined()
    expect(set.coverUrl).toBeTruthy()
  })

  it('survives a picture that cannot be made: logs, leaves it empty, and still makes the other @SC-2002', async () => {
    robotsNow.value = { names: ['planner-checklist'], robot: () => Promise.reject(new Error('disk gone')) }
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const id = add('agent')
    await expect(applyDefaultPictures({ kind: 'agent', id })).resolves.toBeTruthy()
    expect(row('agent', id).avatarUrl).toBeNull()
    expect(row('agent', id).coverUrl).toBeTruthy()
    expect(errors).toHaveBeenCalled()
    errors.mockRestore()
  })

  it('does nothing, and does not throw, for a subject that is gone @SC-2002', async () => {
    await expect(applyDefaultPictures({ kind: 'team', id: 'gone' })).resolves.toEqual({})
  })
})

describe('redrawIfFollowsName @SC-2014', () => {
  it('draws Initials again after a rename, and leaves a face as it is', async () => {
    const team = add('team', { name: 'Design team' })
    await applyDefaultPictures({ kind: 'team', id: team })
    const before = { ...row('team', team) }
    row('team', team).name = 'Research'
    await redrawIfFollowsName({ kind: 'team', id: team })
    expect(row('team', team).avatarUrl).not.toBe(before.avatarUrl)
    expect(row('team', team).avatarRecipe).toEqual(before.avatarRecipe)
    expect(row('team', team).coverUrl).toBe(before.coverUrl)
    await expectPictureFiles(row('team', team).avatarUrl)

    const agent = add('agent', { name: 'Writer' })
    await applyDefaultPictures({ kind: 'agent', id: agent })
    const face = row('agent', agent).avatarUrl
    row('agent', agent).name = 'Editor'
    await redrawIfFollowsName({ kind: 'agent', id: agent })
    expect(row('agent', agent).avatarUrl).toBe(face)
  })
})
