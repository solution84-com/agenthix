/**
 * Integration tests (ADR-0094, real test database): an agent exported as an agent template package (adr-0157, 5.7),
 * with every skill it has inside, under the organisation's publisher, so the Library installs it through the pipeline
 * and the agent made from it has the same skills.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import JSZip from 'jszip'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))

import { createAgent } from '../agentService'
import { exportAgentPackage, exportVersion, packageName } from '../agentPackageExport'
import { exportAgent, importAgent } from '../agentZipActions'
import { previewAssetInstall } from '../../assets/operations'
import { seedSkill } from '../../assets/templates/__tests__/templateFixtures'
import { contextWithRole, useTempRoots, type TempRoots } from './definitionFixtures'

let roots: TempRoots
beforeEach(async () => { roots = await useTempRoots() })
afterEach(async () => { await roots.restore() })

async function agentWithSkills() {
  await prisma.org.create({ data: { name: 'Fernhill' } })
  const shared = await seedSkill(prisma, 'dev-code-review', 'agenthix', '2.0.0')
  const role = await seedSkill(prisma, 'project-manager/read-context')
  const everyone = await seedSkill(prisma, 'house-style', 'fernhill')
  await prisma.asset.update({ where: { id: everyone }, data: { givenToAll: true } })
  const builtIn = await seedSkill(prisma, 'working-with-git')
  await prisma.asset.update({ where: { id: builtIn }, data: { builtIn: true } })
  await seedSkill(prisma, 'not-mine')
  return createAgent({
    name: 'Ada', handle: 'ada_pm', role: 'Plans the work',
    initialContent: { instructions: '# Ada\n', skillFiles: [{ path: 'skills/notes/SKILL.md', content: Buffer.from('---\nname: notes\ndescription: Keeps notes\n---\n') }] },
    madeFrom: { versionId: (await prisma.assetVersion.findFirstOrThrow({ where: { assetId: shared } })).id, skillAssetIds: [shared, role] },
  })
}

describe("an agent's export @SC-1639", () => {
  it('is an agent template package carrying every skill it has but the built-ins, under the organisation', async () => {
    const agent = await agentWithSkills()
    const { root, files } = await exportAgentPackage(agent.id, new Date('2026-10-28T09:30:15Z'))

    expect(root).toBe('ada-pm')
    expect(files.map(f => f.path)).toEqual([
      'agent.json', 'instructions.md', 'package.json',
      'skills/dev-code-review/SKILL.md', 'skills/dev-code-review/package.json',
      'skills/house-style/SKILL.md', 'skills/house-style/package.json',
      'skills/notes/SKILL.md', 'skills/read-context/SKILL.md',
    ])
    const json = (path: string) => JSON.parse(files.find(f => f.path === path)!.content.toString())
    expect(json('package.json')).toEqual({ format: 2, kind: 'agent', publisher: 'fernhill', name: 'ada-pm', version: '1.20261028.93015', description: 'Plans the work' })
    expect(json('skills/dev-code-review/package.json')).toMatchObject({ kind: 'skill', publisher: 'fernhill', name: 'dev-code-review', version: '2.0.0' })
    expect(json('agent.json')).toMatchObject({ name: 'Ada', handle: 'ada_pm', role: 'Plans the work' })
  })

  it('installs in the Library through the pipeline, its role skills under its name and its shared ones by their own', async () => {
    const agent = await agentWithSkills()
    const { ctx } = await contextWithRole('ADMIN')
    const { base64 } = await exportAgent({ agentId: agent.id }, ctx as never)
    const preview = await previewAssetInstall({ from: 'upload', zip: base64 }, ctx as never)
    expect(preview).toMatchObject({ kind: 'agent', refusal: null, state: 'unsigned' })
    expect(preview.embedded.map(e => e.identity).sort()).toEqual(['unsigned/ada-pm/notes', 'unsigned/ada-pm/read-context', 'unsigned/dev-code-review', 'unsigned/house-style'])
  })

  it("is refused by the agent page's import, which sends it to the Library", async () => {
    const agent = await agentWithSkills()
    const { ctx } = await contextWithRole('ADMIN')
    const { base64 } = await exportAgent({ agentId: agent.id }, ctx as never)
    await expect(importAgent({ base64 }, ctx as never)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('install it in the Library') })
    expect((await JSZip.loadAsync(Buffer.from(base64, 'base64'))).file('ada-pm/package.json')).not.toBeNull()
  })
})

describe('the numbers an export takes @SC-1639', () => {
  it('is a version that grows with each export, and a name every handle can take', () => {
    expect(exportVersion(new Date('2026-01-02T00:00:05Z'))).toBe('1.20260102.5')
    expect(packageName('ada_pm')).toBe('ada-pm')
    expect(packageName('__')).toBe('agent')
  })
})
