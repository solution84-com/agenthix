/**
 * The picture sweep against a stand-in for the rows and a storage root of its own (so nothing another test wrote is
 * in reach): what no row names goes after an hour, with its folder when the owner is gone; what a row names, anything
 * new, and anything a link leads to stays.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

type Row = { id: string; avatarUrl: string | null; coverUrl: string | null }
const db = vi.hoisted(() => ({ agent: [] as Row[], user: [] as Row[], team: [] as Row[], org: [] as Row[] }))

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('wasp/server')
  const model = (table: keyof typeof db) => ({ findMany: async () => db[table].map(r => ({ ...r })) })
  return { ...actual, prisma: { agent: model('agent'), user: model('user'), team: model('team'), org: model('org') } }
})

import { PICTURE_SWEEP_GRACE_MS, sweepPictures } from '../sweep'

const AGENT = 'a1b2c3'
const NOW = new Date('2026-11-12T12:00:00Z')
const OLD = new Date(NOW.getTime() - PICTURE_SWEEP_GRACE_MS - 60_000)
const NEW = new Date(NOW.getTime() - 60_000)

let root: string
let outside: string
const saved = process.env.HQ_STORAGE_ROOT

async function file(rel: string, when: Date = OLD): Promise<string> {
  const full = path.join(root, rel)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, 'x')
  await fs.utimes(full, when, when)
  return full
}
const exists = (f: string) => fs.lstat(f).then(() => true, () => false)
const row = (id: string, avatarUrl: string | null = null, coverUrl: string | null = null): Row => ({ id, avatarUrl, coverUrl })

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'picture-sweep-'))
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'picture-sweep-outside-'))
  process.env.HQ_STORAGE_ROOT = root
  for (const t of Object.values(db)) t.length = 0
})
afterEach(async () => {
  if (saved === undefined) delete process.env.HQ_STORAGE_ROOT
  else process.env.HQ_STORAGE_ROOT = saved
  await fs.rm(root, { recursive: true, force: true })
  await fs.rm(outside, { recursive: true, force: true })
})

describe('sweepPictures @SC-2017', () => {
  it('keeps what a row names and its small copy, and deletes the rest past an hour', async () => {
    db.agent.push(row(AGENT, `/agents/${AGENT}/images/cur.webp`, `/agents/${AGENT}/images/old.png`))
    const kept = [
      await file(`agents/${AGENT}/images/cur.webp`), await file(`agents/${AGENT}/images/cur-small.webp`),
      await file(`agents/${AGENT}/images/old.png`), await file(`agents/${AGENT}/images/fresh.webp`, NEW),
    ]
    const gone = [await file(`agents/${AGENT}/images/prev.webp`), await file(`agents/${AGENT}/images/prev-small.webp`)]
    expect(await sweepPictures(NOW)).toEqual({ files: 2, folders: 0 })
    for (const f of kept) expect(await exists(f)).toBe(true)
    for (const f of gone) expect(await exists(f)).toBe(false)
  })

  it("never keeps a file because another subject's row names it", async () => {
    db.agent.push(row(AGENT), row('other', `/agents/${AGENT}/images/cur.webp`))
    const f = await file(`agents/${AGENT}/images/cur.webp`)
    await sweepPictures(NOW)
    expect(await exists(f)).toBe(false)
  })

  it("deletes the images folder of an owner that no longer exists, for every kind", async () => {
    for (const top of ['agents', 'people', 'teams']) await file(`${top}/gone/images/a.webp`)
    await file('org/images/a.webp')
    await file('org/skills/s/SKILL.md')
    expect(await sweepPictures(NOW)).toEqual({ files: 4, folders: 4 })
    for (const top of ['agents', 'people', 'teams']) expect(await exists(path.join(root, top, 'gone'))).toBe(false)
    expect(await exists(path.join(root, 'org/images'))).toBe(false)
    expect(await exists(path.join(root, 'org/skills/s/SKILL.md'))).toBe(true)
  })

  it("keeps an ownerless folder while it holds a file still in its hour", async () => {
    const fresh = await file('teams/gone/images/new.webp', NEW)
    await sweepPictures(NOW)
    expect(await exists(fresh)).toBe(true)
  })

  it('keeps the folders of people, teams and the organisation that exist', async () => {
    db.user.push(row('p1', '/people/p1/images/me.webp'))
    db.team.push(row('t1', null, '/teams/t1/images/c.webp'))
    db.org.push(row('o1', '/org/images/logo.webp'))
    const kept = [await file('people/p1/images/me.webp'), await file('teams/t1/images/c.webp'), await file('org/images/logo.webp')]
    const gone = [await file('people/p1/images/x.webp'), await file('teams/t1/images/x.webp'), await file('org/images/x.webp')]
    expect(await sweepPictures(NOW)).toEqual({ files: 3, folders: 0 })
    for (const f of kept) expect(await exists(f)).toBe(true)
    for (const f of gone) expect(await exists(f)).toBe(false)
  })

  it('never follows a link out of the storage root: a linked owner folder or images folder is not read', async () => {
    await fs.mkdir(path.join(outside, 'images'), { recursive: true })
    const target = path.join(outside, 'images', 'a.webp')
    await fs.writeFile(target, 'x')
    await fs.utimes(target, OLD, OLD)
    await fs.mkdir(path.join(root, 'agents', AGENT), { recursive: true })
    await fs.symlink(path.join(outside, 'images'), path.join(root, 'agents', AGENT, 'images'))
    await fs.symlink(outside, path.join(root, 'agents', 'linked'))
    await fs.symlink(outside, path.join(root, 'people'))
    await sweepPictures(NOW)
    expect(await exists(target)).toBe(true)
  })

  it('removes a stray link inside an images folder without touching what it points at', async () => {
    db.agent.push(row(AGENT))
    const target = path.join(outside, 'secret.webp')
    await fs.writeFile(target, 'x')
    await file(`agents/${AGENT}/images/keep-folder.webp`, NEW)
    const link = path.join(root, 'agents', AGENT, 'images', 'link.webp')
    await fs.symlink(target, link)
    await fs.lutimes(link, OLD, OLD)
    await sweepPictures(NOW)
    expect(await exists(link)).toBe(false)
    expect(await exists(target)).toBe(true)
  })

  it('does nothing when there are no picture folders', async () => {
    expect(await sweepPictures(NOW)).toEqual({ files: 0, folders: 0 })
  })
})
