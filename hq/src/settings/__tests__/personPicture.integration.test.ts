/**
 * A person's picture and cover by upload (ADR-0187), against the real test database and hq's storage: re-encoded as
 * WebP with a small copy, the recipe of that picture cleared, the other picture left alone; a file that is not a
 * picture refused with nothing written; someone else's only for an organisation admin.
 */
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs/promises'
import sharp from 'sharp'
import { prisma } from '../../test/db'
import { createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})

import { uploadPersonPicture, removePersonPicture } from '../personProfileActions'
import { getPersonImagesDir } from '../../server/hqStoragePaths'
import { smallPictureName } from '../../shared/pictures/files'

const ctx = (user: { id: string }) => ({ user })
const recipe = { v: 1, kind: 'cover', style: 'patterns', styleVersion: 1, choices: {} }
const stored = async (userId: string) => (await fs.readdir(getPersonImagesDir(userId)).catch(() => [] as string[])).sort()

async function pictureUrl(width: number, height: number): Promise<string> {
  const png = await sharp({ create: { width, height, channels: 3, background: '#336699' } }).png().toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}

describe("a person's uploaded pictures @SC-2011", () => {
  it('stores an avatar as WebP with its small copy, clearing only the avatar\'s recipe', async () => {
    const me = await createUserWithRole('MEMBER')
    await prisma.user.update({ where: { id: me.id }, data: { avatarRecipe: recipe, coverRecipe: recipe } })

    const { url } = await uploadPersonPicture({ userId: me.id, dataUrl: await pictureUrl(2000, 2000) }, ctx(me))

    expect(url).toMatch(new RegExp(`^/people/${me.id}/images/[0-9a-f-]+\\.webp$`))
    const row = await prisma.user.findUniqueOrThrow({ where: { id: me.id } })
    expect([row.avatarUrl, row.avatarRecipe, row.coverRecipe]).toEqual([url, null, recipe])
    const name = url.split('/').pop()!
    expect(await stored(me.id)).toEqual([name, smallPictureName(name)].sort())
  })

  it('stores a cover beside it when asked for one, leaving the avatar alone', async () => {
    const me = await createUserWithRole('MEMBER')
    const avatar = await uploadPersonPicture({ userId: me.id, dataUrl: await pictureUrl(300, 300) }, ctx(me))
    await prisma.user.update({ where: { id: me.id }, data: { coverRecipe: recipe } })

    const { url } = await uploadPersonPicture({ userId: me.id, type: 'cover', dataUrl: await pictureUrl(3000, 1000) }, ctx(me))

    const row = await prisma.user.findUniqueOrThrow({ where: { id: me.id } })
    expect([row.coverUrl, row.coverRecipe, row.avatarUrl]).toEqual([url, null, avatar.url])
  })

  it('refuses a file that is not a picture, or a type that is neither, writing nothing', async () => {
    const me = await createUserWithRole('MEMBER')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const svg = `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9"/>').toString('base64')}`
    await expect(uploadPersonPicture({ userId: me.id, dataUrl: svg }, ctx(me))).rejects.toMatchObject({ statusCode: 400 })
    await expect(uploadPersonPicture({ userId: me.id, type: 'banner' as 'cover', dataUrl: await pictureUrl(9, 9) }, ctx(me)))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(await stored(me.id)).toEqual([])
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).avatarUrl).toBeNull()
  })

  it("changes someone else's only for an organisation admin", async () => {
    const someone = await createUserWithRole('MEMBER')
    const member = await createUserWithRole('MEMBER')
    const admin = await createUserWithRole('ADMIN')
    const dataUrl = await pictureUrl(64, 64)
    await expect(uploadPersonPicture({ userId: someone.id, type: 'cover', dataUrl }, ctx(member))).rejects.toMatchObject({ statusCode: 403 })
    expect(await stored(someone.id)).toEqual([])
    await uploadPersonPicture({ userId: someone.id, type: 'cover', dataUrl }, ctx(admin))
    expect((await prisma.user.findUniqueOrThrow({ where: { id: someone.id } })).coverUrl).not.toBeNull()
  })

  it('goes back to initials on removing the avatar, its recipe cleared too @SC-2015', async () => {
    const me = await createUserWithRole('MEMBER')
    await uploadPersonPicture({ userId: me.id, dataUrl: await pictureUrl(64, 64) }, ctx(me))
    await prisma.user.update({ where: { id: me.id }, data: { avatarRecipe: recipe } })
    await removePersonPicture({ userId: me.id }, ctx(me))
    const row = await prisma.user.findUniqueOrThrow({ where: { id: me.id } })
    expect([row.avatarUrl, row.avatarRecipe]).toEqual([null, null])
  })

  it('refuses the 31st picture a person uploads in a minute, as the picker does, and stores nothing for it @SC-2018', async () => {
    const me = await createUserWithRole('MEMBER')
    const dataUrl = await pictureUrl(20, 20)
    for (let i = 0; i < 30; i++) await uploadPersonPicture({ userId: me.id, type: 'cover', dataUrl }, ctx(me))
    const before = await stored(me.id)
    await expect(uploadPersonPicture({ userId: me.id, type: 'cover', dataUrl }, ctx(me))).rejects.toMatchObject({ statusCode: 429 })
    expect(await stored(me.id)).toEqual(before)
  })
})
