/**
 * An organisation's and a team's identity (every screen reviewed spec §3,
 * Organisation: an identity has a hero), against the real test database with
 * hq's storage in a temporary folder: everyone reads it, admins change it, and
 * a picture or cover is stored and served as an agent's is.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { prisma } from '../../test/db'
import { createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
const session = vi.hoisted(() => ({ userId: null as string | null }))
vi.mock('../../server/files/fileAccess', async () => ({
  ...(await vi.importActual<typeof import('../../server/files/fileAccess')>('../../server/files/fileAccess')),
  // The link a request carries is the files origin's check (files/__tests__/fileAccess.test.ts); here, who it names.
  readerOf: () => ({ userId: session.userId, download: false }),
}))

import { getOrgIdentity, normaliseOrgHandle, updateOrgIdentity } from '../identity'
import { orgImageHandler, removeOrgImage, teamImageHandler, uploadOrgImage, uploadTeamImage } from '../identityImages'

const ctx = (user?: { id: string }) => ({ user }) as any
const PNG = `data:image/png;base64,${Buffer.from('not really a png').toString('base64')}`

let tmp: string
const prev = process.env.HQ_STORAGE_ROOT
beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'org-identity-'))
  process.env.HQ_STORAGE_ROOT = tmp
  // A first write of the organisation's package reads hq's bundled assets: the checkout's own.
  vi.stubEnv('HQ_ASSETS_ROOT', path.resolve(__dirname, '../../../assets'))
})
afterAll(async () => {
  vi.unstubAllEnvs()
  if (prev === undefined) delete process.env.HQ_STORAGE_ROOT
  else process.env.HQ_STORAGE_ROOT = prev
  await fs.rm(tmp, { recursive: true, force: true })
})

function response() {
  const res: any = { statusCode: 200, headers: {} as Record<string, string>, body: undefined as unknown }
  res.status = (code: number) => { res.statusCode = code; return res }
  res.json = (body: unknown) => { res.body = body; return res }
  res.setHeader = (k: string, v: string) => { res.headers[k] = v }
  res.send = (body: unknown) => { res.body = body; return res }
  return res
}

describe('normaliseOrgHandle @SC-662', () => {
  it('stores a handle lowercase without its @, and none for blank', () => {
    expect(normaliseOrgHandle('@AcmeCorp')).toBe('acmecorp')
    expect(normaliseOrgHandle('  ')).toBeNull()
    expect(normaliseOrgHandle(null)).toBeNull()
  })

  it('refuses one with spaces, one too short, and one that starts with a hyphen', () => {
    for (const bad of ['acme corp', 'a', '-acme']) expect(() => normaliseOrgHandle(bad)).toThrow()
  })
})

describe("the organisation's identity @SC-662 @SC-663", () => {
  it('everyone reads it; an admin changes its name, handle, vision and mission', async () => {
    const admin = await createUserWithRole('ADMIN')
    const member = await createUserWithRole('MEMBER')
    await prisma.org.create({ data: { name: 'Acme' } })

    await updateOrgIdentity({ name: 'Acme Corp', handle: '@acmecorp', vision: 'Shops', mission: 'Tools' }, ctx(admin))

    expect(await getOrgIdentity(undefined, ctx(member))).toMatchObject({
      name: 'Acme Corp', handle: 'acmecorp', vision: 'Shops', mission: 'Tools', avatarUrl: null, coverUrl: null,
    })
  })

  it('refuses a member, and a bad handle, changing nothing', async () => {
    const admin = await createUserWithRole('ADMIN')
    const member = await createUserWithRole('MEMBER')
    await prisma.org.create({ data: { name: 'Acme' } })
    await expect(updateOrgIdentity({ name: 'Mine' }, ctx(member))).rejects.toMatchObject({ statusCode: 403 })
    await expect(updateOrgIdentity({ handle: 'a b' }, ctx(admin))).rejects.toMatchObject({ statusCode: 400 })
    expect((await prisma.org.findFirstOrThrow()).name).toBe('Acme')
  })

  it("stores an admin's picture and cover in hq's storage and serves them to anyone signed in, and signed out only while the sign-in page shows them", async () => {
    const admin = await createUserWithRole('ADMIN')
    const member = await createUserWithRole('MEMBER')
    await prisma.org.create({ data: { name: 'Acme' } })

    const { url } = await uploadOrgImage({ type: 'cover', dataUrl: PNG }, ctx(admin))
    expect(url).toMatch(/^\/org\/images\/[0-9a-f-]+\.png$/)
    expect((await prisma.org.findFirstOrThrow()).coverUrl).toBe(url)
    await expect(uploadOrgImage({ type: 'avatar', dataUrl: PNG }, ctx(member))).rejects.toMatchObject({ statusCode: 403 })

    const filename = url.split('/').pop()!
    session.userId = null
    // Signed out, only while the sign-in page shows the whole cover (getting-in spec).
    await prisma.org.updateMany({ data: { signInShows: 'NAME' } })
    const refused = response()
    await orgImageHandler({ params: { filename } } as any, refused)
    expect(refused.statusCode).toBe(401)
    await prisma.org.updateMany({ data: { signInShows: 'COVER' } })
    session.userId = member.id
    const served = response()
    await orgImageHandler({ params: { filename } } as any, served)
    expect(served.statusCode).toBe(200)
    expect(served.headers['Content-Type']).toBe('image/png')

    await removeOrgImage({ type: 'cover' }, ctx(admin))
    expect((await prisma.org.findFirstOrThrow()).coverUrl).toBeNull()
  })
})

describe("a team's identity @SC-663", () => {
  it("stores a team's picture as an agent's is, and refuses a path that is not a team's", async () => {
    const admin = await createUserWithRole('ADMIN')
    const team = await prisma.team.create({ data: { name: 'Marketing' } })

    const { url } = await uploadTeamImage({ teamId: team.id, type: 'avatar', dataUrl: PNG }, ctx(admin))
    expect(url).toMatch(new RegExp(`^/teams/${team.id}/images/[0-9a-f-]+\\.png$`))
    expect((await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).avatarUrl).toBe(url)

    session.userId = admin.id
    const climbing = response()
    await teamImageHandler({ params: { teamId: '..', filename: url.split('/').pop() } } as any, climbing)
    expect(climbing.statusCode).toBe(404)
    await expect(uploadTeamImage({ teamId: 'missing', type: 'avatar', dataUrl: PNG }, ctx(admin))).rejects.toMatchObject({ statusCode: 404 })
  })
})
