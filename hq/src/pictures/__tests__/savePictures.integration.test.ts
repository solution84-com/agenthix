/**
 * The picker's Save, `savePictures` (ADR-0187), against the real test database and a temporary storage root: each
 * subject by recipe, upload and removal; a refused recipe or upload changes nothing; each subject's permission rule;
 * the rate limit of 30 pictures a minute; and, in a demo, the bytes written counted to the visitor's budget.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { prisma } from '../../test/db'
import { createAgent, createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../robots', async () => ({ ...(await vi.importActual<typeof import('../robots')>('../robots')), getRobots: async () => null }))
const demo = vi.hoisted(() => ({ on: false }))
vi.mock('../../demo/demoMode', async () => ({ ...(await vi.importActual<Record<string, unknown>>('../../demo/demoMode')), demoOn: () => demo.on }))

import { savePictures, PICTURE_SAVE_RULE } from '../saveActions'
import { randomRecipe } from '../../shared/pictures/pictures'
import { getHqStorageRoot } from '../../server/hqStoragePaths'
import { resetRateLimit } from '../../server/rateLimit'
import { VISITOR_BYTES } from '../../demo/guard/storageBudget'
import { useTempRoots, type TempRoots } from '../../agents/__tests__/definitionFixtures'

let roots: TempRoots
beforeEach(async () => { roots = await useTempRoots(); demo.on = false; await resetRateLimit() })
afterEach(async () => { await roots.restore() })

const ctx = (user: { id: string }) => ({ user })
const exists = (url: string | null) => fs.stat(path.join(getHqStorageRoot(), String(url))).then(() => true, () => false)
const ctxOf = (kind: 'agent' | 'person' | 'team' | 'org', name = 'Writer') => ({ subject: { kind, name }, robots: null })
async function pictureUrl(width: number, height: number): Promise<string> {
  const png = await sharp({ create: { width, height, channels: 3, background: { r: 51, g: 102, b: 153 } } }).png().toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}

describe('savePictures', () => {
  it("saves an agent's avatar and cover from recipes in one Save, each a file with its recipe on the row @SC-046 @SC-2008", async () => {
    const admin = await createUserWithRole('ADMIN')
    const agent = await createAgent({ name: 'Writer' })
    const avatar = await randomRecipe('thumbs', 1, ctxOf('agent'))
    const cover = await randomRecipe('patterns', 1, ctxOf('agent'))
    const result = await savePictures({ subject: { kind: 'agent', id: agent.id }, avatar: { recipe: avatar as never }, cover: { recipe: cover as never } }, ctx(admin))
    expect(result.avatarRecipe).toEqual(avatar)
    expect(result.coverRecipe).toEqual(cover)
    expect(await exists(result.avatarUrl)).toBe(true)
    expect(await exists(result.coverUrl)).toBe(true)
  })

  it("uploads a person's cover, clearing its recipe, by the person themselves @SC-2011", async () => {
    const me = await createUserWithRole('MEMBER')
    const result = await savePictures({ subject: { kind: 'person', id: me.id }, cover: { upload: await pictureUrl(1500, 500) } }, ctx(me))
    expect(result.coverUrl).toMatch(new RegExp(`^/people/${me.id}/images/[0-9a-f-]+\\.webp$`))
    expect(result.coverRecipe).toBeNull()
    expect(await exists(result.coverUrl)).toBe(true)
  })

  it("removes a person's avatar through the picture service @SC-2015", async () => {
    const me = await createUserWithRole('MEMBER')
    await savePictures({ subject: { kind: 'person', id: me.id }, avatar: { recipe: (await randomRecipe('initials', 1, ctxOf('person'))) as never } }, ctx(me))
    const result = await savePictures({ subject: { kind: 'person', id: me.id }, avatar: { remove: true } }, ctx(me))
    expect(result.avatarUrl).toBeNull()
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).avatarRecipe).toBeNull()
  })

  it("saves a team's Initials and the organisation's symbol for an admin @SC-2008", async () => {
    const admin = await createUserWithRole('ADMIN')
    const team = await prisma.team.create({ data: { name: 'Design team' } })
    const org = await prisma.org.findFirst() ?? await prisma.org.create({ data: { name: 'Fernhill' } })
    const teamResult = await savePictures({ subject: { kind: 'team', id: team.id }, avatar: { recipe: (await randomRecipe('initials', 2, ctxOf('team'))) as never } }, ctx(admin))
    expect(teamResult.avatarRecipe).toMatchObject({ style: 'initials' })
    const orgResult = await savePictures({ subject: { kind: 'org' }, avatar: { recipe: (await randomRecipe('icons', 2, ctxOf('org', org.name))) as never } }, ctx(admin))
    expect(orgResult.avatarRecipe).toMatchObject({ style: 'icons' })
  })

  it('refuses a recipe the subject may not use, and a file that is not a picture, changing nothing @SC-2008', async () => {
    const me = await createUserWithRole('MEMBER')
    const symbol = await randomRecipe('icons', 1, ctxOf('org'))
    await expect(savePictures({ subject: { kind: 'person', id: me.id }, avatar: { recipe: symbol as never } }, ctx(me))).rejects.toMatchObject({ statusCode: 400 })
    const svg = `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`
    await expect(savePictures({ subject: { kind: 'person', id: me.id }, avatar: { upload: svg } }, ctx(me))).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).toMatchObject({ avatarUrl: null, avatarRecipe: null })
  })

  it('keeps each subject\'s rule: a member may not change an agent, a team, the organisation or someone else @SC-2008', async () => {
    const member = await createUserWithRole('MEMBER')
    const other = await createUserWithRole('MEMBER')
    const agent = await createAgent({ name: 'Writer' })
    const team = await prisma.team.create({ data: { name: 'Design team' } })
    const cover = { recipe: (await randomRecipe('patterns', 1, ctxOf('agent'))) as never }
    for (const subject of [{ kind: 'agent', id: agent.id }, { kind: 'team', id: team.id }, { kind: 'org' }, { kind: 'person', id: other.id }] as const) {
      await expect(savePictures({ subject, cover }, ctx(member))).rejects.toMatchObject({ statusCode: 403 })
    }
    await expect(savePictures({ subject: { kind: 'agent', id: agent.id }, cover }, {})).rejects.toMatchObject({ statusCode: 401 })
  })

  it('refuses a malformed save: no subject, nothing to save, or a change of two kinds at once @SC-2008', async () => {
    const me = await createUserWithRole('MEMBER')
    await expect(savePictures({ subject: { kind: 'robot', id: 'x' } } as never, ctx(me))).rejects.toMatchObject({ statusCode: 400 })
    await expect(savePictures({ subject: { kind: 'person', id: me.id } }, ctx(me))).rejects.toMatchObject({ statusCode: 400 })
    await expect(savePictures({ subject: { kind: 'person', id: me.id }, avatar: { remove: true, upload: 'x' } as never }, ctx(me))).rejects.toMatchObject({ statusCode: 400 })
  })

  it('refuses the 31st picture saved within a minute @SC-2018', async () => {
    const me = await createUserWithRole('MEMBER')
    const cover = { recipe: (await randomRecipe('patterns', 1, ctxOf('person'))) as never }
    for (let i = 0; i < PICTURE_SAVE_RULE.max; i++) await savePictures({ subject: { kind: 'person', id: me.id }, cover }, ctx(me))
    await expect(savePictures({ subject: { kind: 'person', id: me.id }, cover }, ctx(me))).rejects.toMatchObject({ statusCode: 429 })
  })

  it('in a demo, counts the bytes written to the visitor, and refuses once their budget is used @SC-2018', async () => {
    demo.on = true
    const me = await createUserWithRole('MEMBER')
    const cover = { recipe: (await randomRecipe('patterns', 1, ctxOf('person'))) as never }
    await savePictures({ subject: { kind: 'person', id: me.id }, cover }, ctx(me))
    const spent = await prisma.rateLimit.findUniqueOrThrow({ where: { ip: `demo-bytes:${me.id}` } })
    expect(spent.count).toBeGreaterThan(1000)
    await prisma.rateLimit.update({ where: { ip: `demo-bytes:${me.id}` }, data: { count: VISITOR_BYTES + 1 } })
    await expect(savePictures({ subject: { kind: 'person', id: me.id }, cover }, ctx(me))).rejects.toMatchObject({ statusCode: 403 })
  })
})
