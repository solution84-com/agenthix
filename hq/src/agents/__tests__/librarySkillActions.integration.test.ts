/**
 * Integration tests (ADR-0094 — real test DB) for the library skill actions: createLibrarySkill,
 * updateLibrarySkill, deleteLibrarySkill. An org skill's source lives under a temporary storage root; the
 * organisation's package is real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))

import { createLibrarySkill, updateLibrarySkill, deleteLibrarySkill, installSkill } from '../actions'
import { readCurrentFiles } from '../../packages/packageStore'
import {
  contextWithRole, contextWithoutRole, opContext, useTempRoots, writeTextFile, snapshotTree, type TempRoots,
} from './definitionFixtures'

let roots: TempRoots
beforeEach(async () => { roots = await useTempRoots() })
afterEach(async () => { await roots.restore(); vi.restoreAllMocks() })

const exists = (file: string) => fs.access(file).then(() => true, () => false)
const orgSkillFile = (slug: string) => path.join(roots.storage, 'org', 'skills', slug, 'SKILL.md')

async function orgSkill(slug: string, content = 'original') {
  const skill = await prisma.skill.create({
    data: { slug, name: slug, description: 'd', assetPath: `org/skills/${slug}`, scope: 'ORG' },
  })
  await writeTextFile(orgSkillFile(slug), content)
  return skill
}

describe('createLibrarySkill', () => {
  it('stores the skill and writes its source, keeping only the fields the editor sends', async () => {
    const { ctx } = await contextWithRole('ADMIN')

    const result = await createLibrarySkill(
      { scope: 'ORG', slug: 'new-skill', name: 'New', description: 'd', content: 'body', version: 99 } as any, ctx,
    )

    expect(await fs.readFile(orgSkillFile('new-skill'), 'utf-8')).toBe('body')
    const row = await prisma.skill.findUniqueOrThrow({ where: { id: result.id } })
    expect(row).toMatchObject({ slug: 'new-skill', name: 'New', description: 'd', scope: 'ORG', assetPath: 'org/skills/new-skill', version: 1 })
  })

  it('refuses a traversal slug with 400 before writing anything', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    await writeTextFile(path.join(roots.root, 'escape/skills/victim/SKILL.md'), 'victim')
    const before = await snapshotTree(roots.root)

    await expect(
      createLibrarySkill({ scope: 'ORG', slug: '../../../escape', name: 'X', description: 'd', content: 'pwned' }, ctx),
    ).rejects.toMatchObject({ statusCode: 400 })

    expect(await snapshotTree(roots.root)).toEqual(before)
    expect(await prisma.skill.count()).toBe(0)
  })

  it('does not overwrite an existing skill\'s source when the slug is taken', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const org = await prisma.org.create({ data: { name: 'Acme' } })
    await prisma.skill.create({ data: { slug: 'taken', name: 'Taken', description: 'd', assetPath: 'org/skills/taken', scope: 'ORG', orgId: org.id } })
    await writeTextFile(orgSkillFile('taken'), 'keep me')

    await expect(
      createLibrarySkill({ scope: 'ORG', orgId: org.id, slug: 'taken', name: 'X', description: 'd', content: 'replaced' }, ctx),
    ).rejects.toMatchObject({ statusCode: 400 })

    expect(await fs.readFile(orgSkillFile('taken'), 'utf-8')).toBe('keep me')
    expect(await prisma.skill.count()).toBe(1)
  })

  // DEFECT: Skill's unique key is (slug, scope, orgId) and Postgres treats a null orgId as distinct, so with no
  // organisation yet (the editor sends no orgId) a taken slug is not refused and the existing source is overwritten.
  it.fails('refuses a taken slug when the skill has no organisation either', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    await createLibrarySkill({ scope: 'ORG', slug: 'taken', name: 'First', description: 'd', content: 'keep me' }, ctx)

    await expect(
      createLibrarySkill({ scope: 'ORG', slug: 'taken', name: 'Second', description: 'd', content: 'replaced' }, ctx),
    ).rejects.toMatchObject({ statusCode: 400 })

    expect(await fs.readFile(orgSkillFile('taken'), 'utf-8')).toBe('keep me')
  })

  it('removes the row again and answers 500 when the source cannot be written', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    // A regular file where the skills directory belongs makes the write fail.
    await writeTextFile(path.join(roots.storage, 'org', 'skills'), 'not a directory')

    await expect(
      createLibrarySkill({ scope: 'ORG', slug: 'blocked', name: 'X', description: 'd', content: 'body' }, ctx),
    ).rejects.toMatchObject({ statusCode: 500, message: 'Failed to write skill' })

    expect(await prisma.skill.count()).toBe(0)
  })

  it('logs a failed rollback and still answers with the write failure', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    await writeTextFile(path.join(roots.storage, 'org', 'skills'), 'not a directory')
    vi.spyOn(prisma.skill, 'delete').mockRejectedValueOnce(new Error('delete boom') as never)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      createLibrarySkill({ scope: 'ORG', slug: 'new-skill-2', name: 'X', description: 'd', content: 'body' }, ctx),
    ).rejects.toMatchObject({ statusCode: 500, message: 'Failed to write skill' })

    const message = logged.mock.calls[0].map(String).join(' ')
    expect(message).toContain('new-skill-2')
    expect(message).toContain('delete boom')
  })

  it.each(['MEMBER'] as const)('refuses a %s with 403 and creates nothing', async (role) => {
    const { ctx } = await contextWithRole(role)
    await expect(createLibrarySkill({ scope: 'ORG', slug: 'a-skill', name: 'A', description: 'd', content: '# a' }, ctx))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('ADMIN') })
    expect(await prisma.skill.count()).toBe(0)
    expect(await exists(orgSkillFile('a-skill'))).toBe(false)
  })

  it('refuses a person with no role and a signed-out caller', async () => {
    const args = { scope: 'ORG' as const, slug: 'a-skill', name: 'A', description: 'd', content: '# a' }
    await expect(createLibrarySkill(args, (await contextWithoutRole()).ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(createLibrarySkill(args, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
    expect(await prisma.skill.count()).toBe(0)
  })
})

describe('updateLibrarySkill', () => {
  it('renames an org skill and rewrites its source', async () => {
    const skill = await orgSkill('notes')
    const { ctx } = await contextWithRole('ADMIN')

    const result = await updateLibrarySkill({ id: skill.id, name: 'Renamed', description: 'new d', content: 'rewritten' }, ctx)

    expect(result).toMatchObject({ id: skill.id, name: 'Renamed', description: 'new d' })
    expect(await fs.readFile(orgSkillFile('notes'), 'utf-8')).toBe('rewritten')
    expect(await prisma.skill.findUniqueOrThrow({ where: { id: skill.id } })).toMatchObject({ name: 'Renamed', description: 'new d' })
  })

  it('never stores a client-sent slug or assetPath', async () => {
    const skill = await orgSkill('notes')
    const { ctx } = await contextWithRole('ADMIN')

    await updateLibrarySkill({ id: skill.id, name: 'Renamed', slug: '../../agents', assetPath: '../../escape' } as any, ctx)

    expect(await prisma.skill.findUniqueOrThrow({ where: { id: skill.id } })).toMatchObject({
      name: 'Renamed', slug: 'notes', assetPath: 'org/skills/notes',
    })
  })

  it('leaves a platform skill\'s bundled source alone, whatever content is sent', async () => {
    const skill = await prisma.skill.create({
      data: { slug: 'bundled', name: 'Bundled', description: 'd', assetPath: 'library/skills/bundled', scope: 'PLATFORM' },
    })
    await writeTextFile(path.join(roots.assets, 'library/skills/bundled/SKILL.md'), 'shipped')
    const { ctx } = await contextWithRole('ADMIN')

    await updateLibrarySkill({ id: skill.id, name: 'Renamed', content: 'pwned' }, ctx)

    expect(await fs.readFile(path.join(roots.assets, 'library/skills/bundled/SKILL.md'), 'utf-8')).toBe('shipped')
    expect(await exists(orgSkillFile('bundled'))).toBe(false)
  })

  it('refuses to write content outside org/skills, whatever the stored assetPath says, and updates nothing', async () => {
    const skill = await prisma.skill.create({
      data: { slug: 'sneaky', name: 'Sneaky', description: 'd', assetPath: '../escape', scope: 'ORG' },
    })
    await writeTextFile(path.join(roots.root, 'escape/SKILL.md'), 'victim')
    const before = await snapshotTree(roots.root)
    const { ctx } = await contextWithRole('ADMIN')

    await expect(updateLibrarySkill({ id: skill.id, name: 'X', content: 'pwned' }, ctx))
      .rejects.toMatchObject({ statusCode: 403, message: 'Path not allowed' })

    expect(await snapshotTree(roots.root)).toEqual(before)
    expect((await prisma.skill.findUniqueOrThrow({ where: { id: skill.id } })).name).toBe('Sneaky')
  })

  it('answers 400 for a skill that does not exist', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    await expect(updateLibrarySkill({ id: 'ghost', name: 'X' }, ctx)).rejects.toMatchObject({ statusCode: 400 })
  })

  it.each(['MEMBER'] as const)('refuses a %s with 403 and changes nothing', async (role) => {
    const skill = await orgSkill('notes')
    const { ctx } = await contextWithRole(role)
    await expect(updateLibrarySkill({ id: skill.id, name: 'New', content: 'x' }, ctx)).rejects.toMatchObject({ statusCode: 403 })
    expect((await prisma.skill.findUniqueOrThrow({ where: { id: skill.id } })).name).toBe('notes')
    expect(await fs.readFile(orgSkillFile('notes'), 'utf-8')).toBe('original')
  })

  it('refuses a person with no role and a signed-out caller', async () => {
    const skill = await orgSkill('notes')
    await expect(updateLibrarySkill({ id: skill.id, name: 'New' }, (await contextWithoutRole()).ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(updateLibrarySkill({ id: skill.id, name: 'New' }, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('deleteLibrarySkill', () => {
  it('removes the skill and its source', async () => {
    const skill = await orgSkill('notes')
    const { ctx } = await contextWithRole('ADMIN')

    await deleteLibrarySkill({ id: skill.id }, ctx)

    expect(await prisma.skill.count()).toBe(0)
    expect(await exists(path.dirname(orgSkillFile('notes')))).toBe(false)
  })

  async function installedFrom(orgId: string, slug: string) {
    const file = (await readCurrentFiles('org', orgId))!.find(f => f.path === `skills/${slug}/SKILL.md`)
    return file?.content.toString().match(/^installed_from: (.+)$/m)?.[1]
  }

  it('removes the copy installed in the organisation\'s package', async () => {
    const org = await prisma.org.create({ data: { name: 'Acme' } })
    const skill = await orgSkill('review')
    const { ctx } = await contextWithRole('ADMIN')
    await installSkill({ skillId: skill.id, target: { scope: 'ORG', orgId: org.id } }, ctx)
    expect(await installedFrom(org.id, 'review')).toBe(skill.id)

    await deleteLibrarySkill({ id: skill.id }, ctx)

    expect(await installedFrom(org.id, 'review')).toBeUndefined()
  })

  it('leaves another skill\'s installed copy with the same slug in place', async () => {
    const org = await prisma.org.create({ data: { name: 'Acme' } })
    const orgCopy = await orgSkill('review')
    const platformSkill = await prisma.skill.create({
      data: { slug: 'review', name: 'Review', description: 'd', assetPath: 'library/skills/review', scope: 'PLATFORM' },
    })
    await writeTextFile(path.join(roots.assets, 'library/skills/review/SKILL.md'), 'platform review')
    const { ctx } = await contextWithRole('ADMIN')
    await installSkill({ skillId: platformSkill.id, target: { scope: 'ORG', orgId: org.id } }, ctx)

    await deleteLibrarySkill({ id: orgCopy.id }, ctx)

    expect(await installedFrom(org.id, 'review')).toBe(platformSkill.id)
  })

  it('leaves a platform skill\'s bundled source alone', async () => {
    const skill = await prisma.skill.create({
      data: { slug: 'bundled', name: 'Bundled', description: 'd', assetPath: 'library/skills/bundled', scope: 'PLATFORM' },
    })
    await writeTextFile(path.join(roots.assets, 'library/skills/bundled/SKILL.md'), 'shipped')
    await writeTextFile(orgSkillFile('bundled'), 'org lookalike')
    const { ctx } = await contextWithRole('ADMIN')

    await deleteLibrarySkill({ id: skill.id }, ctx)

    expect(await prisma.skill.count()).toBe(0)
    expect(await exists(path.join(roots.assets, 'library/skills/bundled/SKILL.md'))).toBe(true)
    expect(await exists(orgSkillFile('bundled'))).toBe(true)
  })

  it('never deletes outside org/skills, whatever the stored assetPath says', async () => {
    const skill = await prisma.skill.create({
      data: { slug: 'evil', name: 'Evil', description: 'd', assetPath: 'agents', scope: 'ORG' },
    })
    await writeTextFile(path.join(roots.storage, 'agents', 'SKILL.md'), 'precious')
    const { ctx } = await contextWithRole('ADMIN')

    await deleteLibrarySkill({ id: skill.id }, ctx)

    expect(await prisma.skill.count()).toBe(0)
    expect(await exists(path.join(roots.storage, 'agents', 'SKILL.md'))).toBe(true)
  })

  it('answers 400 for a skill that does not exist', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    await expect(deleteLibrarySkill({ id: 'ghost' }, ctx)).rejects.toMatchObject({ statusCode: 400 })
  })

  it.each(['MEMBER'] as const)('refuses a %s with 403 and deletes nothing', async (role) => {
    const skill = await orgSkill('notes')
    const { ctx } = await contextWithRole(role)
    await expect(deleteLibrarySkill({ id: skill.id }, ctx)).rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.skill.count()).toBe(1)
    expect(await exists(orgSkillFile('notes'))).toBe(true)
  })

  it('refuses a person with no role and a signed-out caller', async () => {
    const skill = await orgSkill('notes')
    await expect(deleteLibrarySkill({ id: skill.id }, (await contextWithoutRole()).ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(deleteLibrarySkill({ id: skill.id }, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
    expect(await prisma.skill.count()).toBe(1)
  })
})
