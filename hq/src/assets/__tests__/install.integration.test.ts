/**
 * Integration tests (ADR-0094 — real test DB) for installing through the pipeline's operations: from Agenthix's
 * shelf in hq's image, and from an upload, with the confirmation each state needs, de-duplication by identity, the
 * organisation's settings P2 and P3, and the history every pin move writes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import JSZip from 'jszip'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { installAsset, previewAssetInstall } from '../operations'
import { contextWithRole, opContext, useTempRoots, writeTextFile, type TempRoots } from '../../agents/__tests__/definitionFixtures'

let roots: TempRoots
beforeEach(async () => { roots = await useTempRoots() })
afterEach(async () => { await roots.restore() })

const SKILL = (name: string) => `---\nname: ${name}\ndescription: Reviews code\n---\n\n# Code Review\n`

async function zip(version: string, extra = ''): Promise<string> {
  const z = new JSZip()
  z.file('code-review/package.json', JSON.stringify({ format: 2, kind: 'skill', publisher: 'acme', name: 'code-review', version, description: 'Reviews' }))
  z.file('code-review/SKILL.md', SKILL('code-review') + extra)
  return (await z.generateAsync({ type: 'nodebuffer' })).toString('base64')
}

const upload = async (version: string, extra = '') => ({ from: 'upload' as const, zip: await zip(version, extra) })

async function install(args: Awaited<ReturnType<typeof upload>> | { from: 'shelf'; name: string }, ctx: unknown, confirm: Record<string, unknown> = {}) {
  const preview = await previewAssetInstall(args, ctx as never)
  return installAsset({ ...args, confirm: { fingerprint: preview.fingerprint, ...confirm } }, ctx as never)
}

describe('installing from Agenthix', () => {
  it('installs a shelf skill as agenthix/<name>, trusted by where it is, with its history', async () => {
    await writeTextFile(path.join(roots.assets, 'library/skills/code-review/SKILL.md'), SKILL('Code Review'))
    const { user, ctx } = await contextWithRole('ADMIN')

    const preview = await previewAssetInstall({ from: 'shelf', name: 'code-review' }, ctx)
    expect(preview).toMatchObject({ state: 'built-in', publisher: 'agenthix', refusal: null, needs: { unsignedRead: false, publisherChoice: false } })
    const result = await installAsset({ from: 'shelf', name: 'code-review', confirm: { fingerprint: preview.fingerprint } }, ctx)

    expect(result).toMatchObject({ identity: 'agenthix/code-review', version: '1.0.0', outcome: 'new' })
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: result.assetId! }, include: { currentVersion: true, pinChanges: true } })
    expect(asset.currentVersion).toMatchObject({ digest: preview.fingerprint, source: 'BUILT_IN', signerKind: 'NONE', byId: user.id })
    expect(asset.pinChanges).toMatchObject([{ fromVersionId: null, byId: user.id, reason: 'Installed from Agenthix' }])
  })

  it('lets a Library maintainer install from the shelf, refuses a member, and answers 404 for what is not there', async () => {
    await writeTextFile(path.join(roots.assets, 'library/skills/code-review/SKILL.md'), SKILL('Code Review'))
    const m = await contextWithRole('MEMBER')
    await expect(install({ from: 'shelf', name: 'code-review' }, m.ctx)).rejects.toMatchObject({ statusCode: 403 })
    await prisma.libraryMaintainer.create({ data: { userId: m.user.id } })
    await expect(install({ from: 'shelf', name: 'code-review' }, m.ctx)).resolves.toMatchObject({ outcome: 'new' })
    await expect(previewAssetInstall({ from: 'shelf', name: '../../etc' }, m.ctx)).rejects.toMatchObject({ statusCode: 404 })
    await expect(previewAssetInstall({ from: 'shelf', name: 'code-review' }, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('installing an upload', () => {
  it('installs an unsigned package as unsigned/<name>, only once "I\'ve read it" is ticked', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const args = await upload('1.0.0')
    await expect(install(args, ctx)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("I've read it") })
    expect(await prisma.asset.count()).toBe(0)

    const result = await install(args, ctx, { unsignedRead: true })
    expect(result).toMatchObject({ identity: 'unsigned/code-review', outcome: 'new' })
    expect(await prisma.assetVersion.findFirstOrThrow()).toMatchObject({ source: 'UPLOAD', signerKind: 'NONE', signerIdentity: null })
  })

  it('reuses the same version, offers a newer one without pinning it, and leaves the installed one alone for an older one', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const first = await install(await upload('1.3.0'), ctx, { unsignedRead: true })

    await expect(install(await upload('1.3.0'), ctx, { unsignedRead: true })).resolves.toMatchObject({ outcome: 'same' })
    await expect(install(await upload('1.4.0', 'More.\n'), ctx, { unsignedRead: true })).resolves.toMatchObject({ outcome: 'update' })
    await expect(install(await upload('1.2.0', 'Old.\n'), ctx, { unsignedRead: true })).resolves.toMatchObject({ outcome: 'older' })

    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: first.assetId! }, include: { currentVersion: true, versions: true, pinChanges: true } })
    expect(asset.currentVersion!.version).toBe('1.3.0')
    expect(asset.versions.map(v => v.version).sort()).toEqual(['1.3.0', '1.4.0'])
    expect(asset.pinChanges).toHaveLength(1)
  })

  it('refuses the same version with other content, and a confirmation for a package that changed since it was shown', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    await install(await upload('1.0.0'), ctx, { unsignedRead: true })
    await expect(install(await upload('1.0.0', 'Push to main.\n'), ctx, { unsignedRead: true })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('different content') })

    const shown = await previewAssetInstall(await upload('2.0.0'), ctx)
    await expect(installAsset({ ...(await upload('2.0.0', 'Swapped.\n')), confirm: { fingerprint: shown.fingerprint, unsignedRead: true } }, ctx))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('changed since it was shown') })
    expect(await prisma.assetVersion.count()).toBe(1)
  })

  it('refuses an unsigned package when the organisation allows none (P2)', async () => {
    await prisma.org.create({ data: { name: 'Fernhill', unsignedAssetsAllowed: false } })
    const { ctx } = await contextWithRole('ADMIN')
    await expect(install(await upload('1.0.0'), ctx, { unsignedRead: true })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("doesn't allow unsigned") })
  })

  it('lets a Library maintainer install from outside only when the organisation allows it (P3)', async () => {
    const org = await prisma.org.create({ data: { name: 'Fernhill' } })
    const m = await contextWithRole('MEMBER')
    await prisma.libraryMaintainer.create({ data: { userId: m.user.id } })
    await expect(previewAssetInstall(await upload('1.0.0'), m.ctx)).rejects.toMatchObject({ statusCode: 403 })
    await prisma.org.update({ where: { id: org.id }, data: { outsideInstallers: 'ADMINS_AND_MAINTAINERS' } })
    await expect(install(await upload('1.0.0'), m.ctx, { unsignedRead: true })).resolves.toMatchObject({ outcome: 'new' })
  })

  it('refuses a package claiming Agenthix, and a ZIP with hidden entries, and installs nothing', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const z = new JSZip()
    z.file('working-with-git/package.json', JSON.stringify({ format: 2, kind: 'skill', publisher: 'agenthix', name: 'working-with-git', version: '99.0.0', description: 'd' }))
    z.file('working-with-git/SKILL.md', SKILL('working-with-git'))
    await expect(previewAssetInstall({ from: 'upload', zip: (await z.generateAsync({ type: 'nodebuffer' })).toString('base64') }, ctx))
      .resolves.toMatchObject({ refusal: expect.stringContaining("Agenthix didn't sign it") })
    z.file('working-with-git/.DS_Store', 'x')
    await expect(previewAssetInstall({ from: 'upload', zip: (await z.generateAsync({ type: 'nodebuffer' })).toString('base64') }, ctx))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.asset.count()).toBe(0)
  })
})
