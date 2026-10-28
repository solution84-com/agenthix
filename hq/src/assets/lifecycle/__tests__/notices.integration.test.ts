/**
 * Integration tests (ADR-0094, real test DB) for *Skip this version* and dismissing news (board U5, UQ10): each is
 * remembered per asset, hides only what it names and anything older, comes back with a later version, and is for
 * administrators and Library maintainers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import JSZip from 'jszip'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { installAsset, previewAssetInstall } from '../../operations'
import { dismissAssetNews, editLibraryAsset, getAssetCopyNews, skipAssetUpdate } from '../operations'
import { getAssetPage } from '../../pages/asset/pageOperations'
import { contextWithRole, useTempRoots, type TempRoots } from '../../../agents/__tests__/definitionFixtures'

let roots: TempRoots
beforeEach(async () => {
  roots = await useTempRoots()
  await prisma.org.create({ data: { name: 'Fernhill' } })
})
afterEach(async () => { await roots.restore() })

async function upload(version: string, body = '') {
  const z = new JSZip()
  z.file('code-review/package.json', JSON.stringify({ format: 2, kind: 'skill', publisher: 'acme', name: 'code-review', version, description: 'Reviews' }))
  z.file('code-review/SKILL.md', `---\nname: code-review\ndescription: Reviews code\n---\n\n# Code Review\n${body}`)
  return { from: 'upload' as const, zip: (await z.generateAsync({ type: 'nodebuffer' })).toString('base64') }
}

async function install(version: string, ctx: unknown, body = '') {
  const args = await upload(version, body)
  const preview = await previewAssetInstall(args, ctx as never)
  return installAsset({ ...args, confirm: { fingerprint: preview.fingerprint, unsignedRead: true } }, ctx as never)
}

describe('Skip this version', () => {
  it('hides the update offered until a later version is held, and only for those who may update', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const { ctx: member } = await contextWithRole('MEMBER')
    const { assetId } = await install('1.0.0', ctx)
    await install('1.1.0', ctx, 'Two.\n')
    expect((await getAssetPage({ assetId: assetId! }, ctx)).update).toMatchObject({ version: '1.1.0' })

    await expect(skipAssetUpdate({ assetId, version: '1.1.0' }, member)).rejects.toMatchObject({ statusCode: 403 })
    await expect(skipAssetUpdate({ assetId, version: '1.0.0' }, ctx)).rejects.toMatchObject({ statusCode: 409 })
    await expect(skipAssetUpdate({ assetId, version: '1.1.0' }, ctx)).resolves.toMatchObject({ skipped: '1.1.0' })
    expect((await getAssetPage({ assetId: assetId! }, ctx)).update).toBeNull()
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: assetId! }, include: { currentVersion: true } })).currentVersion!.version).toBe('1.0.0')

    await install('1.2.0', ctx, 'Three.\n')
    expect((await getAssetPage({ assetId: assetId! }, ctx)).update).toMatchObject({ version: '1.2.0' })
  })
})

describe('dismissing news on the organisation’s copy', () => {
  it('hides the version named until a later one is out', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const original = await install('1.3.0', ctx)
    const copy = await editLibraryAsset({ assetId: original.assetId }, ctx)
    await install('1.4.0', ctx, 'Upstream.\n')
    expect(await getAssetCopyNews({ assetId: copy.assetId }, ctx)).toMatchObject({ newer: { version: '1.4.0' } })

    await expect(dismissAssetNews({ assetId: copy.assetId, version: '1.3.0' }, ctx)).rejects.toMatchObject({ statusCode: 409 })
    await dismissAssetNews({ assetId: copy.assetId, version: '1.4.0' }, ctx)
    expect(await getAssetCopyNews({ assetId: copy.assetId }, ctx)).toMatchObject({ newer: null })

    await install('1.5.0', ctx, 'Upstream again.\n')
    expect(await getAssetCopyNews({ assetId: copy.assetId }, ctx)).toMatchObject({ newer: { version: '1.5.0' } })
  })
})
