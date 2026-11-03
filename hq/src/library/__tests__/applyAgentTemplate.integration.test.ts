/**
 * SC-065 — "User can browse and apply agent templates (creating a fully configured agent)." An agent template is a
 * Library asset (adr-0157): the agent made from it takes the pinned version's instructions and settings, keeps a
 * read-only link to that version (adr-0072), and has the skills the template carries granted to it rather than copied
 * into its own content (D23). Real test database (ADR-0094); the activity side effects are the shared fakes.
 */
import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))

import { applyAgentTemplate, listAgentTemplates } from '../agentTemplateService'
import { readAgentContent } from '../../packages/agentPackageService'
import { agentPackage, seedSkill, seedTemplate } from '../../assets/templates/__tests__/templateFixtures'
import { installImageTemplates } from '../../assets/templates/imageTemplates'
import { carriedSkillNames, listTemplates, templateFiles } from '../../assets/templates/templateAssets'

async function seedDeveloper(opts: { approval?: string; source?: 'BUILT_IN' | 'UPLOAD' } = {}) {
  return seedTemplate(prisma, 'AGENT', 'wasp-developer',
    agentPackage('wasp-developer', { handle: 'wasp-dev', roleSkills: ['run-tests', 'write-code'], approval: opts.approval }),
    { source: opts.source })
}

describe('applyAgentTemplate @SC-065', () => {
  it('makes an agent from the pinned version, linked to it, with the role skills granted', async () => {
    const { versionId } = await seedDeveloper()
    const runTests = await seedSkill(prisma, 'wasp-developer/run-tests')
    const writeCode = await seedSkill(prisma, 'wasp-developer/write-code')

    const result = await applyAgentTemplate('wasp-developer', 'wasp-dev', null)

    expect(result).toMatchObject({ handle: 'wasp-dev', missingSkills: [] })
    const agent = await prisma.agent.findUniqueOrThrow({ where: { id: result.id }, include: { assetGrants: true } })
    expect(agent).toMatchObject({ name: 'The wasp-developer', role: 'wasp-developer role', approval: 'deferred', madeFromVersionId: versionId })
    expect(agent.assetGrants.map(g => g.assetId).sort()).toEqual([runTests, writeCode].sort())
    const content = await readAgentContent(result.id)
    expect(content?.instructions).toContain('Do the wasp-developer work.')
    expect(content?.skillFiles).toEqual([])
  })

  it('makes it without a carried skill the Library no longer holds, and names it', async () => {
    await seedDeveloper()
    const kept = await seedSkill(prisma, 'wasp-developer/run-tests')
    const removed = await seedSkill(prisma, 'wasp-developer/write-code')
    await prisma.asset.update({ where: { id: removed }, data: { removedAt: new Date() } })

    const result = await applyAgentTemplate('agenthix/wasp-developer', 'wasp-dev', null)
    expect(result.missingSkills).toEqual(['wasp-developer/write-code'])
    expect((await prisma.assetGrant.findMany({ where: { agentId: result.id } })).map(g => g.assetId)).toEqual([kept])
  })

  it("gives an agent made from each of Agenthix's agent templates every skill it carries, installed on that first use (D14)", async () => {
    const saved = process.env.HQ_ASSETS_ROOT
    process.env.HQ_ASSETS_ROOT = path.resolve(__dirname, '../../../assets')
    try {
      await installImageTemplates(prisma)
      expect(await prisma.asset.count({ where: { kind: 'SKILL' } })).toBe(0)
      const templates = await listTemplates(prisma, 'AGENT')
      expect(templates.length).toBeGreaterThan(0)
      for (const template of templates) {
        const carried = carriedSkillNames(template, await templateFiles(prisma, template))
        const result = await applyAgentTemplate(template.id, `${template.name}-agent`, null)
        const granted = await prisma.assetGrant.findMany({ where: { agentId: result.id }, select: { asset: { select: { publisher: true, name: true } } } })
        expect({ template: template.name, missing: result.missingSkills, granted: granted.map(g => g.asset.name).sort() })
          .toEqual({ template: template.name, missing: [], granted: [...carried].sort() })
        expect(granted.every(g => g.asset.publisher === 'agenthix')).toBe(true)
        expect(carried.length).toBeGreaterThan(0)
      }
    } finally {
      if (saved === undefined) delete process.env.HQ_ASSETS_ROOT
      else process.env.HQ_ASSETS_ROOT = saved
    }
  })

  it('never follows the template: a later version leaves the agent as it was made', async () => {
    const { assetId, versionId } = await seedDeveloper()
    const { id } = await applyAgentTemplate(assetId, 'wasp-dev', null)
    const next = await prisma.assetVersion.create({ data: { assetId, version: '1.1.0', digest: (await prisma.assetVersion.findUniqueOrThrow({ where: { id: versionId } })).digest, source: 'BUILT_IN' } })
    await prisma.asset.update({ where: { id: assetId }, data: { currentVersionId: next.id } })
    expect((await prisma.agent.findUniqueOrThrow({ where: { id } })).madeFromVersionId).toBe(versionId)
  })

  it("starts an agent from a template not from hq's image on Deferred, whatever it asks (R10)", async () => {
    await seedDeveloper({ approval: 'bypassed', source: 'UPLOAD' })
    const { id } = await applyAgentTemplate('wasp-developer', 'wasp-dev', null)
    expect((await prisma.agent.findUniqueOrThrow({ where: { id } })).approval).toBe('deferred')
  })

  it("ignores the tool permissions of a template not from hq's image: the agent gets the defaults (R10)", async () => {
    await seedDeveloper({ source: 'UPLOAD' })
    const { id } = await applyAgentTemplate('wasp-developer', 'wasp-dev', null)
    expect(await prisma.agent.findUniqueOrThrow({ where: { id } })).toMatchObject({ allowedTools: null, allowedBashPatterns: null })
  })

  it("keeps the tool permissions of a template from hq's image", async () => {
    await seedDeveloper()
    const { id } = await applyAgentTemplate('wasp-developer', 'wasp-dev', null)
    expect((await prisma.agent.findUniqueOrThrow({ where: { id } })).allowedTools).toEqual([{ name: 'read_file', state: 'always' }])
  })

  it('lists the templates by their agent name', async () => {
    const { assetId } = await seedDeveloper()
    expect(await listAgentTemplates()).toEqual([expect.objectContaining({ id: assetId, slug: 'wasp-developer', name: 'The wasp-developer', handle: 'wasp-dev', identity: 'agenthix/wasp-developer' })])
  })

  it('is refused for a template that is not in the Library', async () => {
    await expect(applyAgentTemplate('no-such-slug', 'x', null)).rejects.toThrow(/not found/)
  })
})

describe('applyAgentTemplate @SC-186', () => {
  it('fails when the chosen handle already exists, creating no second agent', async () => {
    await seedDeveloper()
    await prisma.agent.create({ data: { name: 'Existing', handle: 'wasp-dev' } })
    await expect(applyAgentTemplate('wasp-developer', 'wasp-dev', null)).rejects.toThrow(/already exists/)
    const agents = await prisma.agent.findMany({ where: { handle: 'wasp-dev' } })
    expect(agents).toHaveLength(1)
    expect(agents[0].name).toBe('Existing')
  })
})
