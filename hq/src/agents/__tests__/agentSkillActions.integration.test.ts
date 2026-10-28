/**
 * Integration tests (ADR-0094 — real test DB) for the actions that put skills into an
 * agent's package: saveAgentSkill, deleteAgentSkill, installSkill, uninstallSkill. A Library skill is an
 * asset; Agenthix's shelf is read from a temporary assets root.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))

import { saveAgentSkill, deleteAgentSkill } from '../actions'
import { installSkill, uninstallSkill } from '../librarySkillActions'
import { storeContent } from '../../assets/content'
import { readAgentContent, writeAgentContent } from '../../packages/agentPackageService'
import { contextWithRole, contextWithoutRole, opContext, useTempRoots, writeTextFile, type TempRoots } from './definitionFixtures'
import path from 'node:path'

let roots: TempRoots
beforeEach(async () => { roots = await useTempRoots() })
afterEach(async () => { await roots.restore() })

const skillFile = (slug: string, body: string) => ({ path: `skills/${slug}/SKILL.md`, content: Buffer.from(body) })

async function agentWithContent(skills: { slug: string; body: string }[] = []) {
  const agent = await createAgent()
  await writeAgentContent(agent.id, { instructions: '# Agent', skillFiles: skills.map(s => skillFile(s.slug, s.body)) }, null)
  return agent
}

async function agentSkillPaths(agentId: string) {
  return (await readAgentContent(agentId))!.skillFiles.map(f => f.path)
}

/** An installed Library skill: an asset pinned to one version whose content is stored. */
async function librarySkill(slug = 'notes') {
  const files = [{ path: 'SKILL.md', content: Buffer.from(`---\nname: ${slug}\ndescription: Takes notes\n---\n\n# Notes\n\nTake notes.\n`) }]
  const asset = await prisma.asset.create({ data: { kind: 'SKILL', publisher: 'acme', name: slug } })
  const version = await prisma.assetVersion.create({ data: { assetId: asset.id, version: '1.2.0', digest: await storeContent(files, prisma), source: 'UPLOAD' } })
  await prisma.asset.update({ where: { id: asset.id }, data: { currentVersionId: version.id } })
  return asset
}

describe('saveAgentSkill', () => {
  it('adds the skill to the agent\'s content, keeping its other files', async () => {
    const agent = await agentWithContent([{ slug: 'other', body: 'o' }])
    const { user, ctx } = await contextWithRole('ADMIN')

    await saveAgentSkill({ agentId: agent.id, slug: 'notes', content: 'Take notes.' }, ctx)

    const content = (await readAgentContent(agent.id))!
    expect(content.instructions).toBe('# Agent')
    expect(content.skillFiles.map(f => [f.path, f.content.toString()])).toEqual([
      ['skills/notes/SKILL.md', 'Take notes.'],
      ['skills/other/SKILL.md', 'o'],
    ])
    const current = await prisma.package.findFirst({ where: { key: agent.id } })
    expect(current?.updatedById).toBe(user.id)
  })

  it('replaces a skill saved before', async () => {
    const agent = await agentWithContent([{ slug: 'notes', body: 'old' }])
    const { ctx } = await contextWithRole('ADMIN')

    await saveAgentSkill({ agentId: agent.id, slug: 'notes', content: 'new' }, ctx)

    expect((await readAgentContent(agent.id))!.skillFiles.map(f => f.content.toString())).toEqual(['new'])
  })

  it('answers 400 for a slug no site could stage, and changes nothing', async () => {
    const agent = await agentWithContent()
    const { ctx } = await contextWithRole('ADMIN')

    await expect(saveAgentSkill({ agentId: agent.id, slug: '../evil', content: 'x' }, ctx)).rejects.toMatchObject({ statusCode: 400 })

    expect(await agentSkillPaths(agent.id)).toEqual([])
  })

  it('answers 409 for an agent that has no content yet', async () => {
    const agent = await createAgent()
    const { ctx } = await contextWithRole('ADMIN')
    await expect(saveAgentSkill({ agentId: agent.id, slug: 'notes', content: 'x' }, ctx)).rejects.toMatchObject({ statusCode: 409 })
  })

  it.each(['MEMBER'] as const)('refuses a %s with 403 naming ADMIN, and changes nothing', async (role) => {
    const agent = await agentWithContent()
    const { ctx } = await contextWithRole(role)
    await expect(saveAgentSkill({ agentId: agent.id, slug: 'notes', content: 'x' }, ctx))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('ADMIN') })
    expect(await agentSkillPaths(agent.id)).toEqual([])
  })

  it('refuses a person with no role, and a caller who is not signed in', async () => {
    const agent = await agentWithContent()
    const { ctx } = await contextWithoutRole()
    await expect(saveAgentSkill({ agentId: agent.id, slug: 'notes', content: 'x' }, ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(saveAgentSkill({ agentId: agent.id, slug: 'notes', content: 'x' }, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
    expect(await agentSkillPaths(agent.id)).toEqual([])
  })
})

describe('deleteAgentSkill', () => {
  it('removes the skill and leaves the others', async () => {
    const agent = await agentWithContent([{ slug: 'notes', body: 'n' }, { slug: 'other', body: 'o' }])
    const { ctx } = await contextWithRole('ADMIN')

    await deleteAgentSkill({ agentId: agent.id, slug: 'notes' }, ctx)

    expect(await agentSkillPaths(agent.id)).toEqual(['skills/other/SKILL.md'])
  })

  it('does nothing for a skill the agent does not have', async () => {
    const agent = await agentWithContent([{ slug: 'other', body: 'o' }])
    const { ctx } = await contextWithRole('ADMIN')
    await deleteAgentSkill({ agentId: agent.id, slug: 'ghost' }, ctx)
    expect(await agentSkillPaths(agent.id)).toEqual(['skills/other/SKILL.md'])
  })

  it('answers 409 for an agent that has no content yet', async () => {
    const agent = await createAgent()
    const { ctx } = await contextWithRole('ADMIN')
    await expect(deleteAgentSkill({ agentId: agent.id, slug: 'notes' }, ctx)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('refuses a Member, a person with no role and a signed-out caller, and removes nothing', async () => {
    const agent = await agentWithContent([{ slug: 'notes', body: 'n' }])
    await expect(deleteAgentSkill({ agentId: agent.id, slug: 'notes' }, (await contextWithRole('MEMBER')).ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(deleteAgentSkill({ agentId: agent.id, slug: 'notes' }, (await contextWithoutRole()).ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(deleteAgentSkill({ agentId: agent.id, slug: 'notes' }, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
    expect(await agentSkillPaths(agent.id)).toEqual(['skills/notes/SKILL.md'])
  })
})

describe('installSkill', () => {
  it('copies an org library skill into an agent, stamped with where it came from', async () => {
    const agent = await agentWithContent()
    const skill = await librarySkill()
    const { ctx } = await contextWithRole('ADMIN')

    await installSkill({ skillId: skill.id, target: { scope: 'AGENT', agentId: agent.id } }, ctx)

    const installed = (await readAgentContent(agent.id))!.skillFiles
    expect(installed.map(f => f.path)).toEqual(['skills/notes/SKILL.md'])
    const text = installed[0].content.toString()
    expect(text).toContain('installed_from: acme/notes')
    expect(text).toContain('version: 1')
    expect(text).toContain('Take notes.')
    expect(await prisma.assetGrant.findMany({ select: { assetId: true, agentId: true } })).toEqual([{ assetId: skill.id, agentId: agent.id }])
  })

  it('installs an Agenthix skill from the shelf first, then copies it with its companion files', async () => {
    const agent = await agentWithContent()
    await writeTextFile(path.join(roots.assets, 'library/skills/bundled/SKILL.md'), '---\nname: Bundled\ndescription: d\n---\n\nBody\n')
    await writeTextFile(path.join(roots.assets, 'library/skills/bundled/reference.md'), 'ref')
    const { ctx } = await contextWithRole('ADMIN')

    await installSkill({ skillId: 'agenthix/bundled', target: { scope: 'AGENT', agentId: agent.id } }, ctx)

    expect(await agentSkillPaths(agent.id)).toEqual(['skills/bundled/SKILL.md', 'skills/bundled/reference.md'])
    const asset = await prisma.asset.findUniqueOrThrow({ where: { kind_publisher_name: { kind: 'SKILL', publisher: 'agenthix', name: 'bundled' } }, include: { currentVersion: true } })
    expect(asset.currentVersion).toMatchObject({ version: '1.0.0', source: 'BUILT_IN', signerKind: 'NONE' })
  })

  it("sends giving a skill to every agent to the skill's page in the Library, and changes nothing", async () => {
    const skill = await librarySkill()
    const { ctx } = await contextWithRole('ADMIN')
    await expect(installSkill({ skillId: skill.id, target: { scope: 'ORG', orgId: 'x' } } as any, ctx))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("skill's page in the Library") })
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: skill.id } })).givenToAll).toBe(false)
  })

  it('answers 404 for a skill that does not exist, and installs nothing', async () => {
    const agent = await agentWithContent()
    const { ctx } = await contextWithRole('ADMIN')
    await expect(installSkill({ skillId: 'ghost', target: { scope: 'AGENT', agentId: agent.id } }, ctx))
      .rejects.toMatchObject({ statusCode: 404 })
    expect(await agentSkillPaths(agent.id)).toEqual([])
  })

  it('answers 409 when the agent has no content yet', async () => {
    const agent = await createAgent()
    const skill = await librarySkill()
    const { ctx } = await contextWithRole('ADMIN')
    await expect(installSkill({ skillId: skill.id, target: { scope: 'AGENT', agentId: agent.id } }, ctx))
      .rejects.toMatchObject({ statusCode: 409 })
  })

  it.each([
    ['an unrecognised scope', { scope: 'PROJECT', projectId: 'p1' }],
    ['a missing target', undefined],
  ])('answers 400 for %s, not a TypeError', async (_name, target) => {
    const skill = await librarySkill()
    const { ctx } = await contextWithRole('ADMIN')
    await expect(installSkill({ skillId: skill.id, target } as any, ctx)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('refuses a Library maintainer, a Member, a person with no role and a signed-out caller, and installs nothing', async () => {
    const agent = await agentWithContent()
    const skill = await librarySkill()
    const args = { skillId: skill.id, target: { scope: 'AGENT' as const, agentId: agent.id } }
    const maintainer = await contextWithRole('MEMBER')
    await prisma.libraryMaintainer.create({ data: { userId: maintainer.user.id } })
    await expect(installSkill(args, maintainer.ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(installSkill(args, (await contextWithRole('MEMBER')).ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(installSkill(args, (await contextWithoutRole()).ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(installSkill(args, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
    expect(await agentSkillPaths(agent.id)).toEqual([])
  })
})

describe('uninstallSkill', () => {
  it('removes a skill from an agent', async () => {
    const agent = await agentWithContent([{ slug: 'notes', body: 'n' }, { slug: 'other', body: 'o' }])
    const { ctx } = await contextWithRole('ADMIN')

    await uninstallSkill({ slug: 'notes', target: { scope: 'AGENT', agentId: agent.id } }, ctx)

    expect(await agentSkillPaths(agent.id)).toEqual(['skills/other/SKILL.md'])
  })

  it('takes the grant away when it removes an installed copy from an agent', async () => {
    const agent = await agentWithContent()
    const skill = await librarySkill()
    const { ctx } = await contextWithRole('ADMIN')
    await installSkill({ skillId: skill.id, target: { scope: 'AGENT', agentId: agent.id } }, ctx)

    await uninstallSkill({ slug: 'notes', target: { scope: 'AGENT', agentId: agent.id } }, ctx)

    expect(await agentSkillPaths(agent.id)).toEqual([])
    expect(await prisma.assetGrant.count()).toBe(0)
  })

  it.each([
    ['an unrecognised scope', { scope: 'PROJECT', projectId: 'p1' }],
    ['a missing target', undefined],
  ])('answers 400 for %s', async (_name, target) => {
    const { ctx } = await contextWithRole('ADMIN')
    await expect(uninstallSkill({ slug: 'notes', target } as any, ctx)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('refuses a Member, a person with no role and a signed-out caller, and removes nothing', async () => {
    const agent = await agentWithContent([{ slug: 'notes', body: 'n' }])
    const args = { slug: 'notes', target: { scope: 'AGENT' as const, agentId: agent.id } }
    await expect(uninstallSkill(args, (await contextWithRole('MEMBER')).ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(uninstallSkill(args, (await contextWithoutRole()).ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(uninstallSkill(args, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
    expect(await agentSkillPaths(agent.id)).toEqual(['skills/notes/SKILL.md'])
  })
})
