/**
 * Integration tests (ADR-0094, real test DB) for "last used" (board U3, UQ4): the newest use read from runs' records
 * is kept on the Library skill and the place skill, an older run never overwrites a newer stamp, and the asset's page
 * says it with the place only for a viewer who sees that place.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { createAgent, createProject, createUserWithRole, joinProjectAs } from '../../../test/factories'
import { storeContent } from '../../content'
import { noteSkillUses } from '../lastUsed'
import { getAssetPage } from '../../pages/asset/pageOperations'

const as = (u: { id: string }) => ({ user: { id: u.id } })

async function librarySkill() {
  const digest = await storeContent([{ path: 'SKILL.md', content: Buffer.from('---\nname: code-review\ndescription: Reviews\n---\n\nReview.\n') }], prisma)
  const asset = await prisma.asset.create({ data: { kind: 'SKILL', publisher: 'fernhill', name: 'code-review' } })
  const v = await prisma.assetVersion.create({ data: { assetId: asset.id, version: '1.0.0', digest, source: 'MADE_HERE' } })
  await prisma.asset.update({ where: { id: asset.id }, data: { currentVersionId: v.id } })
  return { asset, digest }
}

describe('last used @SC-1660', () => {
  it('keeps the newest use, and the page says it with the place only to who sees it', async () => {
    await prisma.org.create({ data: { name: 'Fernhill' } })
    const { asset, digest } = await librarySkill()
    const ada = await createAgent({ name: 'Ada' })
    const project = await createProject({ name: 'Website rebuild' })
    const inside = await createUserWithRole('MEMBER')
    const outside = await createUserWithRole('MEMBER')
    await joinProjectAs(project.id, inside.id, 'MEMBER')
    const use = { name: 'org-code-review', source: 'org', fingerprint: digest, identity: 'fernhill/code-review', version: '1.0.0' }

    await noteSkillUses(prisma, [{ agentId: ada.id, createdAt: '2026-10-27T11:05:00Z', skillsUsed: [use] }], { placeType: 'project', placeId: project.id })
    await noteSkillUses(prisma, [{ agentId: 'someone-else', createdAt: '2026-10-20T08:00:00Z', skillsUsed: [use] }], null)
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })).toMatchObject({
      lastUsedAt: new Date('2026-10-27T11:05:00Z'), lastUsedAgentId: ada.id, lastUsedPlaceType: 'project', lastUsedPlaceId: project.id,
    })

    expect((await getAssetPage({ assetId: asset.id }, as(inside))).lastUsed).toEqual({ by: 'Ada', at: '2026-10-27T11:05:00.000Z', where: 'Website rebuild' })
    expect((await getAssetPage({ assetId: asset.id }, as(outside))).lastUsed).toEqual({ by: 'Ada', at: '2026-10-27T11:05:00.000Z', where: null })
  })

  it('stamps a place skill by its place and path', async () => {
    const project = await createProject()
    const ada = await createAgent({ name: 'Ada' })
    const skill = await prisma.placeSkill.create({ data: { placeType: 'project', placeId: project.id, path: '.agents/skills/release', group: 'PLACE' } })
    await noteSkillUses(prisma, [{
      agentId: ada.id, createdAt: '2026-10-27T11:05:00Z',
      skillsUsed: [{ name: 'boundary-release', source: 'boundary', fingerprint: 'b'.repeat(64), placeId: project.id, path: '.agents/skills/release' }],
    }], null)
    expect(await prisma.placeSkill.findUniqueOrThrow({ where: { id: skill.id } })).toMatchObject({ lastUsedAt: new Date('2026-10-27T11:05:00Z'), lastUsedAgentId: ada.id })
  })
})
