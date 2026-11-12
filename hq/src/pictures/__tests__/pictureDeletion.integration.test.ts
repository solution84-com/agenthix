/**
 * Replaced and removed pictures' files are deleted (ADR-0187), against the real test database with hq's storage in a
 * temporary folder of this file's own: every upload path deletes the picture it replaces and its small copy once the
 * row is updated, every remove goes back to what the spec's table says and deletes the upload, and the picture sweep
 * deletes, by the rows, what nothing names.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { prisma } from '../../test/db'
import { createAgent, createUserWithRole } from '../../test/factories'
import { contextWithRole } from '../../agents/__tests__/definitionFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))

import { uploadAgentImage } from '../../agents/actions'
import { uploadPersonPicture, removePersonPicture } from '../../settings/personProfileActions'
import { uploadOrgImage, removeOrgImage, uploadTeamImage, removeTeamImage } from '../../org/identityImages'
import { PICTURE_SWEEP_GRACE_MS, sweepPictures } from '../sweep'
import { smallPictureName } from '../../shared/pictures/files'

let tmp: string
const prev = process.env.HQ_STORAGE_ROOT
beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'picture-deletion-'))
  process.env.HQ_STORAGE_ROOT = tmp
  vi.stubEnv('HQ_ASSETS_ROOT', path.resolve(__dirname, '../../../assets'))
})
afterAll(async () => {
  vi.unstubAllEnvs()
  if (prev === undefined) delete process.env.HQ_STORAGE_ROOT
  else process.env.HQ_STORAGE_ROOT = prev
  await fs.rm(tmp, { recursive: true, force: true })
})

const ctx = (user: { id: string }) => ({ user })
const picture = async () =>
  `data:image/png;base64,${(await sharp({ create: { width: 64, height: 64, channels: 3, background: '#336699' } }).png().toBuffer()).toString('base64')}`
/** The two files a url names on disk. */
const filesOf = (url: string) => {
  const full = path.join(tmp, url)
  return [full, path.join(path.dirname(full), smallPictureName(path.basename(full)))]
}
const exists = (f: string) => fs.lstat(f).then(() => true, () => false)
async function expectGone(url: string) { for (const f of filesOf(url)) expect(await exists(f)).toBe(false) }
async function expectThere(url: string) { for (const f of filesOf(url)) expect(await exists(f)).toBe(true) }

describe('a replaced upload', () => {
  it("is deleted for an agent's avatar, and its cover is left alone", async () => {
    const { ctx: admin } = await contextWithRole('ADMIN')
    const agent = await createAgent()
    const cover = await uploadAgentImage({ agentId: agent.id, type: 'cover', dataUrl: await picture() }, admin)
    const first = await uploadAgentImage({ agentId: agent.id, type: 'avatar', dataUrl: await picture() }, admin)
    const second = await uploadAgentImage({ agentId: agent.id, type: 'avatar', dataUrl: await picture() }, admin)
    await expectGone(first.url)
    await expectThere(second.url)
    await expectThere(cover.url)
  })

  it("is deleted for a person's avatar and cover", async () => {
    const me = await createUserWithRole('MEMBER')
    const firstCover = await uploadPersonPicture({ userId: me.id, type: 'cover', dataUrl: await picture() }, ctx(me))
    const secondCover = await uploadPersonPicture({ userId: me.id, type: 'cover', dataUrl: await picture() }, ctx(me))
    await expectGone(firstCover.url)
    await expectThere(secondCover.url)
  })

  it("is deleted for the organisation's and a team's", async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.org.create({ data: { name: 'Acme' } })
    const team = await prisma.team.create({ data: { name: 'Design' } })
    const orgFirst = await uploadOrgImage({ type: 'avatar', dataUrl: await picture() }, ctx(admin))
    await uploadOrgImage({ type: 'avatar', dataUrl: await picture() }, ctx(admin))
    const teamFirst = await uploadTeamImage({ teamId: team.id, type: 'cover', dataUrl: await picture() }, ctx(admin))
    await uploadTeamImage({ teamId: team.id, type: 'cover', dataUrl: await picture() }, ctx(admin))
    await expectGone(orgFirst.url)
    await expectGone(teamFirst.url)
  })

  it('is kept when the new upload is refused', async () => {
    const me = await createUserWithRole('MEMBER')
    const kept = await uploadPersonPicture({ userId: me.id, dataUrl: await picture() }, ctx(me))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(uploadPersonPicture({ userId: me.id, dataUrl: 'data:image/png;base64,bm90IGEgcGljdHVyZQ==' }, ctx(me)))
      .rejects.toMatchObject({ statusCode: 400 })
    await expectThere(kept.url)
  })
})

describe('a removed upload', () => {
  it("takes a person's avatar back to their initials and deletes it", async () => {
    const me = await createUserWithRole('MEMBER')
    const { url } = await uploadPersonPicture({ userId: me.id, dataUrl: await picture() }, ctx(me))
    await removePersonPicture({ userId: me.id }, ctx(me))
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).avatarUrl).toBeNull()
    await expectGone(url)
  })

  it("takes the organisation's avatar back to a symbol and a team's to its Initials, deleting the uploads", async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.org.create({ data: { name: 'Acme' } })
    const team = await prisma.team.create({ data: { name: 'Design' } })
    const org = await uploadOrgImage({ type: 'avatar', dataUrl: await picture() }, ctx(admin))
    const teamPic = await uploadTeamImage({ teamId: team.id, type: 'avatar', dataUrl: await picture() }, ctx(admin))
    await removeOrgImage({ type: 'avatar' }, ctx(admin))
    await removeTeamImage({ teamId: team.id, type: 'avatar' }, ctx(admin))
    const orgRow = await prisma.org.findFirstOrThrow()
    const teamRow = await prisma.team.findUniqueOrThrow({ where: { id: team.id } })
    expect((orgRow.avatarRecipe as { style: string }).style).toBe('icons')
    expect((teamRow.avatarRecipe as { style: string }).style).toBe('initials')
    await expectThere(orgRow.avatarUrl!)
    await expectGone(org.url)
    await expectGone(teamPic.url)
  })

  it('answers 404 for a team that is not there', async () => {
    const admin = await createUserWithRole('ADMIN')
    await expect(removeTeamImage({ teamId: '00000000-0000-4000-8000-000000000000', type: 'cover' }, ctx(admin)))
      .rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('the picture sweep, by the rows', () => {
  it("deletes an old file no row names, and a deleted agent's folder; keeps what a row names", async () => {
    const { ctx: admin } = await contextWithRole('ADMIN')
    const agent = await createAgent()
    const gone = await createAgent()
    const kept = await uploadAgentImage({ agentId: agent.id, type: 'avatar', dataUrl: await picture() }, admin)
    const stray = path.join(tmp, 'agents', agent.id, 'images', 'stray.webp')
    await fs.writeFile(stray, 'x')
    const orphan = await uploadAgentImage({ agentId: gone.id, type: 'avatar', dataUrl: await picture() }, admin)
    await prisma.agent.delete({ where: { id: gone.id } })

    // Nothing is younger than the hour yet: the sweep leaves it all.
    await sweepPictures(new Date())
    expect(await exists(stray)).toBe(true)

    await sweepPictures(new Date(Date.now() + PICTURE_SWEEP_GRACE_MS + 60_000))
    expect(await exists(stray)).toBe(false)
    await expectThere(kept.url)
    await expectGone(orphan.url)
    expect(await exists(path.join(tmp, 'agents', gone.id))).toBe(false)
  })
})
