/**
 * Integration tests (ADR-0094, real test DB) for *Remove* on a template (board U3, UQ5): it names what was made from
 * it and asks first, never changes what was made, stays removed when hq starts again until an administrator puts it
 * back, and is left out of the pickers that make agents from templates.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { installImageTemplates } from '../imageTemplates'
import { getAssetHolders, removeLibraryAsset, restoreLibraryAsset } from '../../lifecycle/operations'
import { listAgentTemplates } from '../../../library/agentTemplateService'
import { listTemplates } from '../templateAssets'
import { contextWithRole, useTempRoots, writeTextFile, type TempRoots } from '../../../agents/__tests__/definitionFixtures'
import { createAgent } from '../../../test/factories'
import { agentPackage } from './templateFixtures'

let roots: TempRoots
beforeEach(async () => { roots = await useTempRoots() })
afterEach(async () => { await roots.restore() })

async function bootWithQa() {
  for (const f of agentPackage('qa', { roleSkills: ['check-work'] })) {
    await writeTextFile(path.join(roots.assets, 'library', 'agents/qa', f.path), f.content.toString('utf-8'))
  }
  await installImageTemplates(prisma)
  return prisma.asset.findFirstOrThrow({ where: { kind: 'AGENT', name: 'qa' } })
}

describe('removing a template', () => {
  it('names what was made from it, asks first, and leaves it as it was', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const { ctx: member } = await contextWithRole('MEMBER')
    const qa = await bootWithQa()
    const priya = await createAgent({ name: 'Priya' })
    await prisma.agent.update({ where: { id: priya.id }, data: { madeFromVersionId: qa.currentVersionId } })

    expect(await getAssetHolders({ assetId: qa.id }, ctx)).toEqual({ everyAgent: false, agents: [], made: [{ name: 'Priya', version: '1.0.0' }] })
    await expect(removeLibraryAsset({ assetId: qa.id }, member)).rejects.toMatchObject({ statusCode: 403 })
    const asked = await removeLibraryAsset({ assetId: qa.id }, ctx)
    expect(asked).toMatchObject({ removed: false, confirm: expect.stringContaining("Priya was made from agenthix/qa. Removing it doesn't change them.") })
    expect(await removeLibraryAsset({ assetId: qa.id, confirmed: true }, ctx)).toEqual({ removed: true })

    expect((await prisma.agent.findUniqueOrThrow({ where: { id: priya.id } })).madeFromVersionId).toBe(qa.currentVersionId)
    expect(await listTemplates(prisma, 'AGENT')).toEqual([])
    expect(await listAgentTemplates()).toEqual([])
  })

  it("isn't installed again at boot until an administrator puts it back", async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const { ctx: member } = await contextWithRole('MEMBER')
    const qa = await bootWithQa()
    await removeLibraryAsset({ assetId: qa.id, confirmed: true }, ctx)

    expect((await installImageTemplates(prisma)).map(t => [t.identity, t.outcome])).toEqual([['agenthix/qa', 'removed']])
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: qa.id } })).removedAt).not.toBeNull()

    await expect(restoreLibraryAsset({ assetId: qa.id }, member)).rejects.toMatchObject({ statusCode: 403 })
    await expect(restoreLibraryAsset({ assetId: qa.id }, ctx)).resolves.toEqual({ identity: 'agenthix/qa' })
    await expect(restoreLibraryAsset({ assetId: qa.id }, ctx)).rejects.toMatchObject({ statusCode: 404 })
    expect((await installImageTemplates(prisma)).map(t => t.outcome)).toEqual(['same'])
    expect((await listTemplates(prisma, 'AGENT')).map(t => t.name)).toEqual(['qa'])
  })
})
