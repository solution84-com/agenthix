/**
 * An organisation's and a team's identity (every screen reviewed spec §3,
 * Organisation: an identity has a hero), against the real test database with
 * hq's storage in a temporary folder: everyone reads it, admins change it, and
 * a picture or cover is stored as an agent's is, and opened by the same rule.
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
import { getOrgIdentity, normaliseOrgHandle, updateOrgIdentity } from '../identity'
import { removeOrgImage, uploadOrgImage, uploadTeamImage } from '../identityImages'
import { uploadAccess } from '../../server/files/uploadAccess'

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

/** What opening an upload would answer: 200 when hq would sign its ticket, else the refusal's status. */
async function opening(uploadPath: string, userId: string | null): Promise<number> {
  const access = await uploadAccess(uploadPath, userId)
  return access.ok ? 200 : access.status
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

  it("stores an admin's picture and cover in hq's storage and opens them to anyone signed in, and signed out only while the sign-in page shows them", async () => {
    const admin = await createUserWithRole('ADMIN')
    const member = await createUserWithRole('MEMBER')
    await prisma.org.create({ data: { name: 'Acme' } })

    const { url } = await uploadOrgImage({ type: 'cover', dataUrl: PNG }, ctx(admin))
    expect(url).toMatch(/^\/org\/images\/[0-9a-f-]+\.png$/)
    expect((await prisma.org.findFirstOrThrow()).coverUrl).toBe(url)
    await expect(uploadOrgImage({ type: 'avatar', dataUrl: PNG }, ctx(member))).rejects.toMatchObject({ statusCode: 403 })

    // Signed out, only while the sign-in page shows the whole cover (getting-in spec).
    await prisma.org.updateMany({ data: { signInShows: 'NAME' } })
    expect(await opening(url, null)).toBe(401)
    expect(await opening(url, member.id)).toBe(200)
    await prisma.org.updateMany({ data: { signInShows: 'COVER' } })
    expect(await opening(url, null)).toBe(200)

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

    expect(await opening(url, admin.id)).toBe(200)
    expect(await opening(`/teams/../images/${url.split('/').pop()}`, admin.id)).toBe(404)
    expect(await opening(`/teams/not-a-team/images/${url.split('/').pop()}`, admin.id)).toBe(404)
    expect(await opening(url, null)).toBe(401)
    await expect(uploadTeamImage({ teamId: 'missing', type: 'avatar', dataUrl: PNG }, ctx(admin))).rejects.toMatchObject({ statusCode: 404 })
  })
})
