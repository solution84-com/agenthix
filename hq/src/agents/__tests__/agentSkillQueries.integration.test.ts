/**
 * Integration tests (ADR-0094 — real test DB) for the agent and skill reads: getAgent, getAgentSkills,
 * getSkillLibrary, getInstalledSkillVersions. Agenthix's shelf is read from a temporary assets root; the
 * organisation's skills are assets.
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

import { getAgent, getAgentSkills } from '../queries'
import { getSkillLibrary, getInstalledSkillVersions } from '../librarySkillQueries'
import { storeContent } from '../../assets/content'
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

const shelfSkill = (name: string, front: string, body: string) =>
  writeTextFile(path.join(roots.assets, `library/skills/${name}/SKILL.md`), `---\n${front}\n---\n\n${body}`)

async function asset(publisher: string, name: string, removed = false) {
  const files = [{ path: 'SKILL.md', content: Buffer.from(`---\nname: ${name}\ndescription: d\n---\n\n${name} body\n`) }]
  const row = await prisma.asset.create({ data: { kind: 'SKILL', publisher, name, removedAt: removed ? new Date() : null } })
  const version = await prisma.assetVersion.create({ data: { assetId: row.id, version: '2.1.0', digest: await storeContent(files, prisma), source: 'UPLOAD' } })
  return prisma.asset.update({ where: { id: row.id }, data: { currentVersionId: version.id } })
}

describe('getSkillLibrary', () => {
  it("lists Agenthix's shelf by folder, titled and with the front matter dropped, leaving out a folder with no SKILL.md", async () => {
    await shelfSkill('b-skill', 'name: Bravo\ndescription: d', 'Bravo body\n')
    await shelfSkill('a-skill', 'name: Alpha\ndescription: d', 'Alpha body\n')
    await writeTextFile(path.join(roots.assets, 'library/skills/c-skill/README.md'), 'not a skill')

    const skills = await getSkillLibrary({ scope: 'PLATFORM' }, await signedIn())

    expect(skills.map(s => [s.id, s.slug, s.name, s.content, s.version])).toEqual([
      ['agenthix/a-skill', 'a-skill', 'Alpha', 'Alpha body\n', '1.0.0'],
      ['agenthix/b-skill', 'b-skill', 'Bravo', 'Bravo body\n', '1.0.0'],
    ])
  })

  it("lists the organisation's installed and made skills for the ORG scope, not removed ones nor Agenthix's", async () => {
    const mine = await asset('acme', 'mine')
    await asset('acme', 'gone', true)
    await asset('agenthix', 'shipped')

    const skills = await getSkillLibrary({ scope: 'ORG' }, await signedIn())

    expect(skills.map(s => [s.id, s.slug, s.content, s.publisher, s.version])).toEqual([[mine.id, 'mine', 'mine body\n', 'acme', '2.1.0']])
  })

  it('answers 401 when nobody is signed in', async () => {
    await expect(getSkillLibrary({ scope: 'PLATFORM' }, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('getInstalledSkillVersions', () => {
  it("maps each asked-for shelf skill's slug to its major version", async () => {
    await shelfSkill('one', 'description: d\nversion: 4', 'x')
    await shelfSkill('two', 'description: d', 'x')
    await asset('acme', 'three')

    expect(await getInstalledSkillVersions({ slugs: ['one', 'three', 'ghost'] }, await signedIn())).toEqual({ one: 4 })
  })

  it('is empty for no slugs', async () => {
    expect(await getInstalledSkillVersions({ slugs: [] }, await signedIn())).toEqual({})
  })

  it('answers 401 when nobody is signed in', async () => {
    await expect(getInstalledSkillVersions({ slugs: ['one'] }, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })
})
