/**
 * Integration tests (ADR-0094 — real test DB) for the Library's skill actions over the asset records:
 * createLibrarySkill and updateLibrarySkill publish skills made here, deleteLibrarySkill removes one. Each permission
 * is the policy's: administrators and Library maintainers publish, only administrators remove.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))

import { createLibrarySkill, updateLibrarySkill, deleteLibrarySkill, installSkill } from '../librarySkillActions'
import { readContent, storeContent } from '../../assets/content'
import { readCurrentFiles } from '../../packages/packageStore'
import { contextWithRole, contextWithoutRole, opContext, useTempRoots, type TempRoots } from './definitionFixtures'

let roots: TempRoots
beforeEach(async () => { roots = await useTempRoots() })
afterEach(async () => { await roots.restore(); vi.restoreAllMocks() })

const newSkill = { scope: 'ORG' as const, slug: 'release-notes', name: 'Release Notes', description: 'Writes release notes', content: 'Write them.' }

async function maintainer() {
  const m = await contextWithRole('MEMBER')
  await prisma.libraryMaintainer.create({ data: { userId: m.user.id } })
  return m
}

async function skillMd(assetId: string): Promise<string> {
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId }, include: { currentVersion: true } })
  return (await readContent(asset.currentVersion!.digest, prisma)).find(f => f.path === 'SKILL.md')!.content.toString()
}

describe('createLibrarySkill @SC-062', () => {
  it("publishes version 1.0.0 under the organisation's publisher name, with its history", async () => {
    await prisma.org.create({ data: { name: 'Fernhill Studio' } })
    const { user, ctx } = await contextWithRole('ADMIN')

    const result = await createLibrarySkill(newSkill, ctx)

    expect(result.identity).toBe('fernhill-studio/release-notes')
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: result.id }, include: { currentVersion: true, pinChanges: true } })
    expect(asset).toMatchObject({ kind: 'SKILL', publisher: 'fernhill-studio', name: 'release-notes', givenToAll: false })
    expect(asset.currentVersion).toMatchObject({ version: '1.0.0', source: 'MADE_HERE', signerKind: 'NONE', byId: user.id })
    expect(asset.pinChanges).toMatchObject([{ fromVersionId: null, toVersionId: asset.currentVersionId, byId: user.id }])
    expect(await skillMd(result.id)).toBe('---\nname: release-notes\ndescription: "Writes release notes"\n---\n\n# Release Notes\n\nWrite them.\n')
  })

  it("keeps the publisher name it first wrote when the organisation is renamed", async () => {
    const org = await prisma.org.create({ data: { name: 'Fernhill' } })
    const { ctx } = await contextWithRole('ADMIN')
    await createLibrarySkill(newSkill, ctx)
    await prisma.org.update({ where: { id: org.id }, data: { name: 'Renamed' } })

    const second = await createLibrarySkill({ ...newSkill, slug: 'second' }, ctx)

    expect(second.identity).toBe('fernhill/second')
  })

  it('lets a Library maintainer publish one', async () => {
    await prisma.org.create({ data: { name: 'Fernhill' } })
    await expect(createLibrarySkill(newSkill, (await maintainer()).ctx)).resolves.toMatchObject({ identity: 'fernhill/release-notes' })
  })

  it('refuses a name outside the Agent Skills rules, a traversal included, and writes nothing', async () => {
    await prisma.org.create({ data: { name: 'Fernhill' } })
    const { ctx } = await contextWithRole('ADMIN')
    for (const slug of ['../../../escape', 'Release Notes', 'x'.repeat(65)]) {
      await expect(createLibrarySkill({ ...newSkill, slug }, ctx)).rejects.toMatchObject({ statusCode: 400 })
    }
    expect(await prisma.asset.count()).toBe(0)
  })

  it('refuses a description the rules refuse', async () => {
    await prisma.org.create({ data: { name: 'Fernhill' } })
    const { ctx } = await contextWithRole('ADMIN')
    await expect(createLibrarySkill({ ...newSkill, description: '' }, ctx)).rejects.toMatchObject({ statusCode: 400 })
    await expect(createLibrarySkill({ ...newSkill, description: 'd'.repeat(1025) }, ctx)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('refuses a taken name and leaves the skill that has it alone (T10)', async () => {
    await prisma.org.create({ data: { name: 'Fernhill' } })
    const { ctx } = await contextWithRole('ADMIN')
    const first = await createLibrarySkill(newSkill, ctx)

    await expect(createLibrarySkill({ ...newSkill, content: 'replaced' }, ctx)).rejects.toMatchObject({ statusCode: 409 })

    expect(await skillMd(first.id)).toContain('Write them.')
    expect(await prisma.asset.count()).toBe(1)
  })

  it('answers 409 before an organisation exists: there is no publisher to make it under', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    await expect(createLibrarySkill(newSkill, ctx)).rejects.toMatchObject({ statusCode: 409 })
    expect(await prisma.asset.count()).toBe(0)
  })

  it('refuses a Member, a person with no role and a signed-out caller', async () => {
    await prisma.org.create({ data: { name: 'Fernhill' } })
    await expect(createLibrarySkill(newSkill, (await contextWithRole('MEMBER')).ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(createLibrarySkill(newSkill, (await contextWithoutRole()).ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(createLibrarySkill(newSkill, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
    expect(await prisma.asset.count()).toBe(0)
  })
})

describe('updateLibrarySkill @SC-062', () => {
  async function made() {
    await prisma.org.create({ data: { name: 'Fernhill' } })
    const admin = await contextWithRole('ADMIN')
    return { ...admin, skill: await createLibrarySkill(newSkill, admin.ctx) }
  }

  it('publishes the next version and records the pin move', async () => {
    const { user, ctx, skill } = await made()

    const result = await updateLibrarySkill({ id: skill.id, content: '# Release Notes\n\nWrite them well.' }, ctx)

    expect(result.version).toBe('1.1.0')
    expect(await skillMd(skill.id)).toContain('Write them well.')
    const changes = await prisma.assetPinChange.findMany({ where: { assetId: skill.id }, orderBy: { at: 'asc' } })
    expect(changes).toHaveLength(2)
    expect(changes[1]).toMatchObject({ byId: user.id, reason: 'Published' })
    expect(await prisma.assetVersion.count({ where: { assetId: skill.id } })).toBe(2)
  })

  it('makes no version when nothing changed', async () => {
    const { ctx, skill } = await made()
    const result = await updateLibrarySkill({ id: skill.id }, ctx)
    expect(result.version).toBe('1.0.0')
    expect(await prisma.assetVersion.count()).toBe(1)
  })

  it("refuses to edit a skill another publisher signed: that makes the organisation's own copy", async () => {
    const { ctx } = await made()
    const files = [{ path: 'SKILL.md', content: Buffer.from('---\nname: theirs\ndescription: d\n---\nx') }]
    const theirs = await prisma.asset.create({ data: { kind: 'SKILL', publisher: 'acme', name: 'theirs' } })
    const v = await prisma.assetVersion.create({ data: { assetId: theirs.id, version: '1.0.0', digest: await storeContent(files, prisma), source: 'UPLOAD' } })
    await prisma.asset.update({ where: { id: theirs.id }, data: { currentVersionId: v.id } })

    await expect(updateLibrarySkill({ id: theirs.id, content: 'changed' }, ctx)).rejects.toMatchObject({ statusCode: 409 })
    expect(await prisma.assetVersion.count({ where: { assetId: theirs.id } })).toBe(1)
  })

  it('answers 404 for a skill that is not in the Library', async () => {
    const { ctx } = await made()
    await expect(updateLibrarySkill({ id: 'ghost', content: 'x' }, ctx)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('refuses a Member and a signed-out caller', async () => {
    const { skill } = await made()
    await expect(updateLibrarySkill({ id: skill.id, content: 'x' }, (await contextWithRole('MEMBER')).ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(updateLibrarySkill({ id: skill.id, content: 'x' }, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('deleteLibrarySkill @SC-062', () => {
  async function installedForEveryone() {
    const org = await prisma.org.create({ data: { name: 'Fernhill' } })
    const admin = await contextWithRole('ADMIN')
    const skill = await createLibrarySkill(newSkill, admin.ctx)
    await installSkill({ skillId: skill.id, target: { scope: 'ORG', orgId: org.id } }, admin.ctx)
    return { org, ...admin, skill }
  }

  it("removes it from the Library, keeping its record and history, and takes its copy out of the organisation's package", async () => {
    const { org, user, ctx, skill } = await installedForEveryone()

    await deleteLibrarySkill({ id: skill.id }, ctx)

    const row = await prisma.asset.findUniqueOrThrow({ where: { id: skill.id } })
    expect(row.removedAt).not.toBeNull()
    expect(row.removedById).toBe(user.id)
    expect(await prisma.assetVersion.count({ where: { assetId: skill.id } })).toBe(1)
    expect((await readCurrentFiles('org', org.id))!.map(f => f.path)).not.toContain('skills/release-notes/SKILL.md')
  })

  it("leaves a copy with the same slug that came from another skill", async () => {
    const { org, ctx, skill } = await installedForEveryone()
    const { changeOrgPackage } = await import('../../packages/orgPackageService')
    const { replaceSkill } = await import('../../packages/skillFiles')
    await changeOrgPackage(files => replaceSkill(files, 'release-notes', [{ path: 'SKILL.md', content: Buffer.from('---\nname: x\ninstalled_from: acme/release-notes\n---\nother') }]), null)

    await deleteLibrarySkill({ id: skill.id }, ctx)

    expect((await readCurrentFiles('org', org.id))!.map(f => f.path)).toContain('skills/release-notes/SKILL.md')
  })

  it('answers 404 for a skill that is not in the Library, or already removed', async () => {
    const { ctx, skill } = await installedForEveryone()
    await expect(deleteLibrarySkill({ id: 'ghost' }, ctx)).rejects.toMatchObject({ statusCode: 404 })
    await deleteLibrarySkill({ id: skill.id }, ctx)
    await expect(deleteLibrarySkill({ id: skill.id }, ctx)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('is for administrators: a Library maintainer, a Member and a signed-out caller are refused', async () => {
    const { skill } = await installedForEveryone()
    await expect(deleteLibrarySkill({ id: skill.id }, (await maintainer()).ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(deleteLibrarySkill({ id: skill.id }, (await contextWithRole('MEMBER')).ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(deleteLibrarySkill({ id: skill.id }, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: skill.id } })).removedAt).toBeNull()
  })
})
