/**
 * Integration tests (ADR-0094 — real test DB) for the agent and skill reads: getAgent, getAgentSkills,
 * getSkillLibrary, getInstalledSkillVersions. Library skill sources are read from temporary roots.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import { prisma } from '../../test/db'
import { createAgent } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { getAgent, getAgentSkills, getSkillLibrary, getInstalledSkillVersions } from '../queries'
import { writeAgentContent } from '../../packages/agentPackageService'
import { opContext, useTempRoots, writeTextFile, type TempRoots } from './definitionFixtures'

let roots: TempRoots
beforeEach(async () => { roots = await useTempRoots() })
afterEach(async () => { await roots.restore() })

const signedIn = async () => opContext(await prisma.user.create({ data: {} }))

describe('getAgent', () => {
  it('returns the agent', async () => {
    const agent = await createAgent({ name: 'Scout', handle: 'scout-1', role: 'Researcher' })
    expect(await getAgent({ id: agent.id }, await signedIn())).toMatchObject({ id: agent.id, name: 'Scout', handle: 'scout-1', role: 'Researcher' })
  })

  it('answers 404 for an agent that does not exist', async () => {
    await expect(getAgent({ id: 'ghost' }, await signedIn())).rejects.toMatchObject({ statusCode: 404 })
  })

  it('answers 401 when nobody is signed in', async () => {
    const agent = await createAgent()
    await expect(getAgent({ id: agent.id }, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('getAgentSkills', () => {
  it('lists the skills in the agent\'s content, by slug, with their frontmatter read', async () => {
    const agent = await createAgent()
    await writeAgentContent(agent.id, {
      instructions: 'i',
      skillFiles: [
        { path: 'skills/zeta/SKILL.md', content: Buffer.from('---\nname: Zeta\ndescription: Last one\nversion: 3\ninstalled_from: lib-1\n---\n\nbody') },
        { path: 'skills/alpha/SKILL.md', content: Buffer.from('no frontmatter') },
        { path: 'skills/alpha/notes.md', content: Buffer.from('companion') },
      ],
    }, null)

    const skills = await getAgentSkills({ agentId: agent.id }, await signedIn())

    expect(skills).toEqual([
      { slug: 'alpha', name: 'Unnamed', description: '', content: 'no frontmatter', version: 1, installedFrom: null },
      expect.objectContaining({ slug: 'zeta', name: 'Zeta', description: 'Last one', version: 3, installedFrom: 'lib-1' }),
    ])
  })

  it('is empty for an agent with no content, or one that does not exist', async () => {
    const agent = await createAgent()
    const ctx = await signedIn()
    expect(await getAgentSkills({ agentId: agent.id }, ctx)).toEqual([])
    expect(await getAgentSkills({ agentId: 'ghost' }, ctx)).toEqual([])
  })

  it('answers 401 when nobody is signed in', async () => {
    const agent = await createAgent()
    await expect(getAgentSkills({ agentId: agent.id }, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('getSkillLibrary', () => {
  it('lists the platform skills by name, with their body read from hq\'s assets and the frontmatter dropped', async () => {
    await prisma.skill.create({ data: { slug: 'b-skill', name: 'Bravo', description: 'd', assetPath: 'library/skills/b-skill', scope: 'PLATFORM' } })
    await prisma.skill.create({ data: { slug: 'a-skill', name: 'Alpha', description: 'd', assetPath: 'library/skills/a-skill', scope: 'PLATFORM' } })
    await writeTextFile(path.join(roots.assets, 'library/skills/a-skill/SKILL.md'), '---\nname: Alpha\n---\n\nAlpha body\n')
    // b-skill has no source file: it is listed with an empty body.

    const skills = await getSkillLibrary({ scope: 'PLATFORM' }, await signedIn())

    expect(skills.map(s => [s.name, s.content])).toEqual([['Alpha', 'Alpha body\n'], ['Bravo', '']])
  })

  it('lists only the organisation\'s own skills for the ORG scope, read from hq\'s storage', async () => {
    const org = await prisma.org.create({ data: { name: 'Acme' } })
    const other = await prisma.org.create({ data: { name: 'Other' } })
    await prisma.skill.create({ data: { slug: 'mine', name: 'Mine', description: 'd', assetPath: 'org/skills/mine', scope: 'ORG', orgId: org.id } })
    await prisma.skill.create({ data: { slug: 'theirs', name: 'Theirs', description: 'd', assetPath: 'org/skills/theirs', scope: 'ORG', orgId: other.id } })
    await prisma.skill.create({ data: { slug: 'shipped', name: 'Shipped', description: 'd', assetPath: 'library/skills/shipped', scope: 'PLATFORM' } })
    await writeTextFile(path.join(roots.storage, 'org/skills/mine/SKILL.md'), 'my body')

    const skills = await getSkillLibrary({ scope: 'ORG', orgId: org.id }, await signedIn())

    expect(skills.map(s => [s.slug, s.content])).toEqual([['mine', 'my body']])
  })

  it('answers 401 when nobody is signed in', async () => {
    await expect(getSkillLibrary({ scope: 'PLATFORM' }, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('getInstalledSkillVersions', () => {
  it('maps each asked-for platform skill\'s slug to its library version', async () => {
    const org = await prisma.org.create({ data: { name: 'Acme' } })
    await prisma.skill.create({ data: { slug: 'one', name: 'One', description: 'd', assetPath: 'library/skills/one', scope: 'PLATFORM', version: 4 } })
    await prisma.skill.create({ data: { slug: 'two', name: 'Two', description: 'd', assetPath: 'library/skills/two', scope: 'PLATFORM', version: 2 } })
    await prisma.skill.create({ data: { slug: 'three', name: 'Three', description: 'd', assetPath: 'org/skills/three', scope: 'ORG', orgId: org.id, version: 9 } })

    expect(await getInstalledSkillVersions({ slugs: ['one', 'three', 'ghost'] }, await signedIn())).toEqual({ one: 4 })
  })

  it('is empty for no slugs', async () => {
    expect(await getInstalledSkillVersions({ slugs: [] }, await signedIn())).toEqual({})
  })

  it('answers 401 when nobody is signed in', async () => {
    await expect(getInstalledSkillVersions({ slugs: ['one'] }, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })
})
