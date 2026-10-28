/**
 * Integration tests (ADR-0094, real test DB) for the built-in skills: installed at boot by identity, a changed file a
 * new version, one no longer shipped removed; the administrators' switch, kept across boots; and what a run is given,
 * `working-with-git` only in a repository.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { installBuiltInSkills, UPDATED_WITH_HQ } from '../install'
import { readPlatformSkills, type PlatformSkill } from '../platformSkills'
import { getBuiltInSkills, setBuiltInSkillSwitch } from '../switch'
import { resolveRunSkills, type RunSkillsInput } from '../../delivery/runSkills'
import type { ScanPlace } from '../../delivery/fileSkills'
import { contextWithRole } from '../../../agents/__tests__/definitionFixtures'
import { createAgent, createProject, createUser } from '../../../test/factories'

const skill = (name: string, body = 'Body'): PlatformSkill => ({
  name, files: [{ path: 'SKILL.md', content: Buffer.from(`---\nname: ${name}\ndescription: ${name} steps.\n---\n\n${body}\n`) }],
})

const assetOf = (name: string) => prisma.asset.findUniqueOrThrow({
  where: { kind_publisher_name: { kind: 'SKILL', publisher: 'agenthix', name } },
  include: { currentVersion: true, versions: true, pinChanges: true },
})

describe('installed at boot @SC-1633', () => {
  it('as agenthix/<name>, built in, for every agent by itself, from what hq\'s image ships', async () => {
    const { skills } = await readPlatformSkills(path.resolve(__dirname, '../../../../assets/platform/skills'))
    const { installed } = await installBuiltInSkills(prisma, skills)
    expect(installed.map(i => [i.name, i.version, i.outcome])).toEqual([['skill-creator', '1.0.0', 'new'], ['working-with-git', '1.0.0', 'new']])
    const git = await assetOf('working-with-git')
    expect(git).toMatchObject({ builtIn: true, switchedOff: false, givenToAll: false, removedAt: null })
    expect(git.currentVersion).toMatchObject({ version: '1.0.0', source: 'BUILT_IN', byId: null })
    expect(git.pinChanges).toEqual([expect.objectContaining({ fromVersionId: null, toVersionId: git.currentVersionId, byId: null, reason: UPDATED_WITH_HQ })])
  })

  it('changes nothing when the image is the same, and makes a new version when a file changed', async () => {
    await installBuiltInSkills(prisma, [skill('skill-creator')])
    const again = await installBuiltInSkills(prisma, [skill('skill-creator')])
    expect(again.installed).toEqual([{ name: 'skill-creator', version: '1.0.0', outcome: 'same' }])

    const changed = await installBuiltInSkills(prisma, [skill('skill-creator', 'New steps')])
    expect(changed.installed).toEqual([{ name: 'skill-creator', version: '2.0.0', outcome: 'changed' }])
    const asset = await assetOf('skill-creator')
    expect(asset.versions.map(v => v.version).sort()).toEqual(['1.0.0', '2.0.0'])
    expect(asset.currentVersion?.version).toBe('2.0.0')
    expect(asset.pinChanges).toHaveLength(2)
  })

  it('goes back to the version it already holds when the image goes back', async () => {
    await installBuiltInSkills(prisma, [skill('skill-creator')])
    await installBuiltInSkills(prisma, [skill('skill-creator', 'New steps')])
    const back = await installBuiltInSkills(prisma, [skill('skill-creator')])
    expect(back.installed).toEqual([{ name: 'skill-creator', version: '1.0.0', outcome: 'changed' }])
    expect((await assetOf('skill-creator')).versions).toHaveLength(2)
  })

  it('removes a built-in the image no longer ships, and brings it back when it does again', async () => {
    await installBuiltInSkills(prisma, [skill('skill-creator'), skill('old-one')])
    const { removed } = await installBuiltInSkills(prisma, [skill('skill-creator')])
    expect(removed).toEqual(['agenthix/old-one'])
    expect((await assetOf('old-one')).removedAt).not.toBeNull()
    await installBuiltInSkills(prisma, [skill('skill-creator'), skill('old-one')])
    expect((await assetOf('old-one')).removedAt).toBeNull()
  })

  it('keeps an administrator\'s switch across boots and new versions', async () => {
    await installBuiltInSkills(prisma, [skill('skill-creator')])
    await prisma.asset.updateMany({ where: { name: 'skill-creator' }, data: { switchedOff: true } })
    await installBuiltInSkills(prisma, [skill('skill-creator', 'New steps')])
    expect((await assetOf('skill-creator')).switchedOff).toBe(true)
  })
})

describe("the organisation's switch @SC-1634", () => {
  beforeEach(async () => {
    await prisma.org.create({ data: { name: 'Fernhill' } })
    await installBuiltInSkills(prisma, [skill('skill-creator'), skill('working-with-git')])
  })

  it('an administrator switches a built-in off and on again; the list says which and that git is for repositories', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const { id } = await assetOf('skill-creator')
    const off = await setBuiltInSkillSwitch({ assetId: id, on: false }, ctx)
    expect(off.map(r => [r.identity, r.on, r.repositoryOnly])).toEqual([['agenthix/skill-creator', false, false], ['agenthix/working-with-git', true, true]])
    expect((await setBuiltInSkillSwitch({ assetId: id, on: true }, ctx))[0]!.on).toBe(true)
  })

  it('a member reads the list but can\'t switch one, and nothing that isn\'t a built-in is switched', async () => {
    const { ctx } = await contextWithRole('MEMBER')
    const { id } = await assetOf('skill-creator')
    expect(await getBuiltInSkills({}, ctx)).toHaveLength(2)
    await expect(setBuiltInSkillSwitch({ assetId: id, on: false }, ctx)).rejects.toMatchObject({ statusCode: 403 })
    expect((await assetOf('skill-creator')).switchedOff).toBe(false)

    const admin = await contextWithRole('ADMIN')
    const other = await prisma.asset.create({ data: { kind: 'SKILL', publisher: 'acme', name: 'review' } })
    await expect(setBuiltInSkillSwitch({ assetId: other.id, on: false }, admin.ctx)).rejects.toMatchObject({ statusCode: 404 })
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: other.id } })).switchedOff).toBe(false)
  })
})

describe('what a run is given @SC-1634', () => {
  const noScan: ScanPlace = async () => ({ skills: [], problems: [], truncated: false })
  let input: RunSkillsInput

  beforeEach(async () => {
    await prisma.org.create({ data: { name: 'Fernhill' } })
    await installBuiltInSkills(prisma, [skill('skill-creator'), skill('working-with-git')])
    input = {
      agentId: (await createAgent()).id, siteId: 'site-1', kind: 'chat', startedBy: 'person', personId: (await createUser()).id,
      ownConversation: true, place: { placeType: 'project', placeId: (await createProject()).id }, workspaceIds: ['w1'],
    }
  })

  const identities = async (inRepository: boolean) =>
    (await resolveRunSkills(input, prisma, noScan, async () => inRepository)).installedSkills.map(e => [e.identity, e.level])

  it('every built-in that is on, working-with-git only in a repository', async () => {
    expect(await identities(true)).toEqual([['agenthix/skill-creator', 'builtin'], ['agenthix/working-with-git', 'builtin']])
    expect(await identities(false)).toEqual([['agenthix/skill-creator', 'builtin']])
  })

  it('none switched off', async () => {
    await prisma.asset.updateMany({ where: { name: 'working-with-git' }, data: { switchedOff: true } })
    expect(await identities(true)).toEqual([['agenthix/skill-creator', 'builtin']])
  })
})
