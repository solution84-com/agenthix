/**
 * Integration tests (ADR-0094 — real test DB) for the actions that put skills into an agent's or the
 * organisation's package: saveAgentSkill, deleteAgentSkill, installSkill, uninstallSkill. Library skill
 * sources are read from temporary storage and assets roots.
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

import { saveAgentSkill, deleteAgentSkill, installSkill, uninstallSkill } from '../actions'
import { readAgentContent, writeAgentContent } from '../../packages/agentPackageService'
import { readCurrentFiles } from '../../packages/packageStore'
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

async function orgWithPackage() {
  return prisma.org.create({ data: { name: 'Acme' } })
}

async function librarySkill(over: Record<string, unknown> = {}) {
  const slug = (over.slug as string) ?? 'notes'
  const skill = await prisma.skill.create({
    data: { slug, name: 'Notes', description: 'Takes notes', assetPath: `org/skills/${slug}`, scope: 'ORG', ...over },
  })
  const source = skill.scope === 'PLATFORM' ? path.join(roots.assets, skill.assetPath) : path.join(roots.storage, skill.assetPath)
  await writeTextFile(path.join(source, 'SKILL.md'), '---\nname: Notes\n---\n\nTake notes.\n')
  return skill
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
    expect(text).toContain(`installed_from: ${skill.id}`)
    expect(text).toContain('scope: ORG')
    expect(text).toContain('Take notes.')
  })

  it('copies a platform library skill from hq\'s assets, with its companion files', async () => {
    const agent = await agentWithContent()
    const skill = await librarySkill({ slug: 'bundled', scope: 'PLATFORM', assetPath: 'library/skills/bundled' })
    await writeTextFile(path.join(roots.assets, 'library/skills/bundled/reference.md'), 'ref')
    const { ctx } = await contextWithRole('ADMIN')

    await installSkill({ skillId: skill.id, target: { scope: 'AGENT', agentId: agent.id } }, ctx)

    expect(await agentSkillPaths(agent.id)).toEqual(['skills/bundled/SKILL.md', 'skills/bundled/reference.md'])
  })

  it('puts an org skill into the organisation\'s package', async () => {
    const org = await orgWithPackage()
    const skill = await librarySkill()
    const { ctx } = await contextWithRole('ADMIN')

    await installSkill({ skillId: skill.id, target: { scope: 'ORG', orgId: org.id } }, ctx)

    const files = (await readCurrentFiles('org', org.id))!
    expect(files.map(f => f.path)).toContain('skills/notes/SKILL.md')
    expect(files.map(f => f.path)).toContain('ORG.md')
  })

  it('answers 409 when there is no organisation to install into', async () => {
    const skill = await librarySkill()
    const { ctx } = await contextWithRole('ADMIN')
    await expect(installSkill({ skillId: skill.id, target: { scope: 'ORG', orgId: 'none' } }, ctx))
      .rejects.toMatchObject({ statusCode: 409 })
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

  it('refuses a Member, a person with no role and a signed-out caller, and installs nothing', async () => {
    const agent = await agentWithContent()
    const skill = await librarySkill()
    const args = { skillId: skill.id, target: { scope: 'AGENT' as const, agentId: agent.id } }
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

  it('removes a skill from the organisation\'s package', async () => {
    const org = await orgWithPackage()
    const skill = await librarySkill()
    const { ctx } = await contextWithRole('ADMIN')
    await installSkill({ skillId: skill.id, target: { scope: 'ORG', orgId: org.id } }, ctx)

    await uninstallSkill({ slug: 'notes', target: { scope: 'ORG', orgId: org.id } }, ctx)

    expect((await readCurrentFiles('org', org.id))!.map(f => f.path)).not.toContain('skills/notes/SKILL.md')
  })

  it('answers 409 when there is no organisation', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    await expect(uninstallSkill({ slug: 'notes', target: { scope: 'ORG', orgId: 'none' } }, ctx))
      .rejects.toMatchObject({ statusCode: 409 })
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
