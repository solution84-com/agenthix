/**
 * Integration tests (ADR-0094, real test DB) for what an older version of a skill changed: with `against: 'previous'`
 * a version is compared with the one just before it by version number, and the first version shows every file as
 * added; without it, against the version in use, as before.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../../../../test/db'
import { storeContent } from '../../../content'
import { versionDiff } from '../assetDiff'

const md = (body: string) => `---\nname: release-notes\ndescription: Write release notes.\n---\n\n${body}\n`

beforeEach(async () => {
  await prisma.org.create({ data: { name: 'Fernhill' } })
})

async function skill() {
  const asset = await prisma.asset.create({ data: { kind: 'SKILL', publisher: 'fernhill', name: 'release-notes' } })
  const publish = async (version: string, files: Record<string, string>) => {
    const digest = await storeContent(Object.entries(files).map(([path, text]) => ({ path, content: Buffer.from(text) })), prisma)
    return prisma.assetVersion.create({ data: { assetId: asset.id, version, digest, source: 'MADE_HERE' } })
  }
  return { asset, publish }
}

describe("an older version's own changes", () => {
  it('compares a version with the one just before it, not with the one in use', async () => {
    const { asset, publish } = await skill()
    await publish('1.0.0', { 'SKILL.md': md('First.') })
    const v2 = await publish('1.2.0', { 'SKILL.md': md('Second.'), 'references/README.md': 'More.' })
    const v3 = await publish('1.10.0', { 'SKILL.md': md('Third.'), 'references/README.md': 'More.' })
    await prisma.asset.update({ where: { id: asset.id }, data: { currentVersionId: v3.id } })

    const own = await versionDiff(prisma, asset.id, v2.id, 'previous')
    expect(own).toMatchObject({ from: '1.0.0', to: '1.2.0' })
    expect(own.files.map(f => [f.path, f.status])).toEqual([['SKILL.md', 'modified'], ['references/README.md', 'added']])

    const againstInUse = await versionDiff(prisma, asset.id, v2.id)
    expect(againstInUse).toMatchObject({ from: '1.10.0', to: '1.2.0' })
    expect(againstInUse.files.map(f => [f.path, f.status])).toEqual([['SKILL.md', 'modified']])
  })

  it('shows every file of the first version as added', async () => {
    const { asset, publish } = await skill()
    const v1 = await publish('1.0.0', { 'SKILL.md': md('First.'), 'scripts/format.py': 'print()' })
    await prisma.asset.update({ where: { id: asset.id }, data: { currentVersionId: v1.id } })
    const own = await versionDiff(prisma, asset.id, v1.id, 'previous')
    expect(own.from).toBeNull()
    expect(own.files.every(f => f.status === 'added')).toBe(true)
    expect(own.files).toHaveLength(2)
  })
})
