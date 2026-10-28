/**
 * Integration tests (ADR-0094, real test DB) for a copy and its original as one Library entry (spec part 2 *Editing
 * makes your own copy*, part 6 *The Library*; D18): the entry is whichever serves the agents, the other is shown under
 * it, each page shows the other, and who has which is exactly what the lifecycle left.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import JSZip from 'jszip'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { installAsset, previewAssetInstall } from '../../assets/operations'
import {
  addAssetToAgents, editLibraryAsset, publishAssetDraft, saveAssetDraft, switchToOriginalAsset, switchToOwnCopy,
} from '../../assets/lifecycle/operations'
import { getAssetPage } from '../../assets/pages/asset/pageOperations'
import { getLibraryAssets } from '../assetList/operations'
import { contextWithRole, useTempRoots, type TempRoots } from '../../agents/__tests__/definitionFixtures'
import { createAgent } from '../../test/factories'

let roots: TempRoots
beforeEach(async () => {
  roots = await useTempRoots()
  await prisma.org.create({ data: { name: 'Fernhill' } })
})
afterEach(async () => { await roots.restore() })

async function upload(version: string) {
  const z = new JSZip()
  z.file('code-review/package.json', JSON.stringify({ format: 2, kind: 'skill', publisher: 'acme', name: 'code-review', version, description: 'Reviews' }))
  z.file('code-review/SKILL.md', '---\nname: code-review\ndescription: Reviews code\n---\n\n# Code Review\n')
  return { from: 'upload' as const, zip: (await z.generateAsync({ type: 'nodebuffer' })).toString('base64') }
}

async function install(version: string, ctx: unknown) {
  const args = await upload(version)
  const preview = await previewAssetInstall(args, ctx as never)
  return installAsset({ ...args, confirm: { fingerprint: preview.fingerprint, unsignedRead: true } }, ctx as never)
}

const skillMd = (body: string) => [{ path: 'SKILL.md', text: `---\nname: code-review\ndescription: "Reviews code"\n---\n\n${body}\n` }]

async function entries(ctx: unknown) {
  return (await getLibraryAssets(undefined, ctx as never)).rows.filter(r => r.kind === 'skill' && !r.builtIn && !r.proposalId)
}

describe('a copy and its original as one Library entry', () => {
  it('is one entry from the copy being made, through its first publish, to switching back and again', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const original = await install('1.3.0', ctx)
    const ada = await createAgent({ name: 'Ada' })
    await addAssetToAgents({ assetId: original.assetId, agentIds: [ada.id] }, ctx)

    const copy = await editLibraryAsset({ assetId: original.assetId }, ctx)
    let rows = await entries(ctx)
    expect(rows.map(r => r.assetId)).toEqual([original.assetId])
    expect(rows[0]!.partners).toMatchObject([{ assetId: copy.assetId, relation: 'copy', statuses: [] }])

    await saveAssetDraft({ assetId: copy.assetId, files: skillMd('Our way.'), revision: null }, ctx)
    expect((await entries(ctx))[0]!.partners[0]!.statuses).toEqual(['draft'])
    await publishAssetDraft({ assetId: copy.assetId, revision: 1, note: 'Our way' }, ctx)

    rows = await entries(ctx)
    expect(rows.map(r => r.assetId)).toEqual([copy.assetId])
    expect(rows[0]).toMatchObject({ identity: 'fernhill/code-review', has: 'Ada has it', setAsideFor: null })
    expect(rows[0]!.partners).toMatchObject([{ assetId: original.assetId, relation: 'original', identity: 'unsigned/code-review', words: 'unsigned/code-review 1.3.0', statuses: ['setAside'] }])
    expect(await prisma.assetGrant.findMany({ where: { agentId: ada.id } })).toMatchObject([{ assetId: copy.assetId }])

    const copyPage = await getAssetPage({ assetId: copy.assetId }, ctx as never)
    expect(copyPage.original).toMatchObject({ assetId: original.assetId, identity: 'unsigned/code-review', version: '1.3.0', copiedFrom: '1.3.0', inUse: false, copyPublished: true })
    const originalPage = await getAssetPage({ assetId: original.assetId! }, ctx as never)
    expect(originalPage.setAsideFor).toEqual({ assetId: copy.assetId, identity: 'fernhill/code-review' })
    expect(originalPage.copies).toMatchObject([{ assetId: copy.assetId, inUse: true, published: true }])

    await switchToOriginalAsset({ assetId: copy.assetId }, ctx)
    rows = await entries(ctx)
    expect(rows.map(r => r.assetId)).toEqual([original.assetId])
    expect(rows[0]).toMatchObject({ has: 'Ada has it', statuses: ['unsigned'] })
    expect(rows[0]!.partners).toMatchObject([{ assetId: copy.assetId, relation: 'copy', statuses: ['setAside'] }])
    expect(await prisma.assetGrant.findMany({ where: { agentId: ada.id } })).toMatchObject([{ assetId: original.assetId }])
    expect((await getAssetPage({ assetId: copy.assetId }, ctx as never)).original).toMatchObject({ inUse: true })

    await switchToOwnCopy({ assetId: copy.assetId }, ctx)
    expect((await entries(ctx)).map(r => r.assetId)).toEqual([copy.assetId])
  })

  it('counts the pair once in the type chips and finds it under Set aside', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const original = await install('1.3.0', ctx)
    const copy = await editLibraryAsset({ assetId: original.assetId }, ctx)
    await saveAssetDraft({ assetId: copy.assetId, files: skillMd('Ours.'), revision: null }, ctx)
    await publishAssetDraft({ assetId: copy.assetId, revision: 1, note: 'Ours' }, ctx)
    const rows = await entries(ctx)
    expect(rows).toHaveLength(1)
    expect(rows.filter(r => r.statuses.includes('setAside') || r.partners.some(p => p.statuses.includes('setAside')))).toHaveLength(1)
  })
})
