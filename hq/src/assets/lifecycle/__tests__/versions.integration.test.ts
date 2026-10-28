/**
 * Integration tests (ADR-0094, real test DB) for pinned versions and who has a skill: update and roll back to versions
 * hq holds, any version on purpose with a reason, the withdrawn-version warning, every pin move recorded, and
 * every agent or chosen agents, with removal asking first.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import JSZip from 'jszip'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { installAsset, previewAssetInstall } from '../../operations'
import {
  acceptAssetUpdate, addAssetToAgents, getAssetHolders, getAssetVersionChanges, getAssetVersions, installAssetVersionOnPurpose,
  removeAssetFromAgent, removeLibraryAsset, rollBackAsset, setAssetEveryAgent,
} from '../operations'
import { contextWithRole, useTempRoots, writeTextFile, type TempRoots } from '../../../agents/__tests__/definitionFixtures'
import { createAgent } from '../../../test/factories'

let roots: TempRoots
beforeEach(async () => { roots = await useTempRoots() })
afterEach(async () => { await roots.restore() })

async function upload(version: string, body = '') {
  const z = new JSZip()
  z.file('code-review/package.json', JSON.stringify({ format: 2, kind: 'skill', publisher: 'acme', name: 'code-review', version, description: 'Reviews' }))
  z.file('code-review/SKILL.md', `---\nname: code-review\ndescription: Reviews code\n---\n\n# Code Review\n${body}`)
  return { from: 'upload' as const, zip: (await z.generateAsync({ type: 'nodebuffer' })).toString('base64') }
}

async function install(args: Awaited<ReturnType<typeof upload>>, ctx: unknown) {
  const preview = await previewAssetInstall(args, ctx as never)
  return installAsset({ ...args, confirm: { fingerprint: preview.fingerprint, unsignedRead: true } }, ctx as never)
}

/** unsigned/code-review at 1.0.0 in use, with 1.1.0 held as an offered update. */
async function withUpdateOffered(ctx: unknown) {
  const { assetId } = await install(await upload('1.0.0'), ctx)
  await install(await upload('1.1.0', 'Step two.\n'), ctx)
  const versions = await prisma.assetVersion.findMany({ where: { assetId: assetId! } })
  return { assetId: assetId!, v100: versions.find(v => v.version === '1.0.0')!.id, v110: versions.find(v => v.version === '1.1.0')!.id }
}

describe('update and roll back', () => {
  it('lists versions in SemVer order with the offered update, shows what changed, and accepts it, recorded', async () => {
    const { user, ctx } = await contextWithRole('ADMIN')
    const { assetId, v110 } = await withUpdateOffered(ctx)

    const listed = await getAssetVersions({ assetId }, ctx)
    expect(listed.versions.map(v => [v.version, v.inUse, v.newer])).toEqual([['1.1.0', false, true], ['1.0.0', true, false]])
    expect(await getAssetVersionChanges({ assetId, versionId: v110 }, ctx)).toMatchObject({ from: '1.0.0', to: '1.1.0', changes: { changed: ['SKILL.md', 'package.json'], added: [], removed: [] } })

    await expect(acceptAssetUpdate({ assetId, versionId: v110 }, ctx)).resolves.toMatchObject({ version: '1.1.0' })
    const history = await prisma.assetPinChange.findMany({ where: { assetId }, orderBy: { at: 'desc' } })
    expect(history[0]).toMatchObject({ toVersionId: v110, byId: user.id, reason: 'Updated' })
  })

  it('rolls back to an earlier version with a reason, and refuses an update backwards or a roll back forwards', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const { assetId, v100, v110 } = await withUpdateOffered(ctx)
    await expect(rollBackAsset({ assetId, versionId: v110 }, ctx)).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('newer') })
    await acceptAssetUpdate({ assetId, versionId: v110 }, ctx)
    await expect(acceptAssetUpdate({ assetId, versionId: v100 }, ctx)).rejects.toMatchObject({ statusCode: 409 })
    await rollBackAsset({ assetId, versionId: v100, reason: 'Step two broke the build' }, ctx)
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })).currentVersionId).toBe(v100)
    expect((await prisma.assetPinChange.findFirstOrThrow({ where: { assetId, toVersionId: v100, fromVersionId: v110 } })).reason).toBe('Step two broke the build')
  })

  it('lets a Library maintainer update and roll back, and refuses a member', async () => {
    const admin = await contextWithRole('ADMIN')
    const { assetId, v110 } = await withUpdateOffered(admin.ctx)
    const m = await contextWithRole('MEMBER')
    await expect(acceptAssetUpdate({ assetId, versionId: v110 }, m.ctx)).rejects.toMatchObject({ statusCode: 403 })
    await prisma.libraryMaintainer.create({ data: { userId: m.user.id } })
    await expect(acceptAssetUpdate({ assetId, versionId: v110 }, m.ctx)).resolves.toMatchObject({ version: '1.1.0' })
  })

  it("warns before going to a version in Agenthix's withdrawn list, naming why", async () => {
    const { ctx } = await contextWithRole('ADMIN')
    await writeTextFile(path.join(roots.assets, 'library/skills/code-review/SKILL.md'), '---\nname: code-review\ndescription: Reviews\nversion: 1.1.0\n---\n\n# Code Review\n')
    const shelf = { from: 'shelf' as const, name: 'code-review' }
    const { assetId } = await installAsset({ ...shelf, confirm: { fingerprint: (await previewAssetInstall(shelf, ctx)).fingerprint } }, ctx)
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId! } })
    const old = await prisma.assetVersion.create({ data: { assetId: asset.id, version: '1.0.0', digest: (await prisma.assetVersion.findFirstOrThrow()).digest, source: 'BUILT_IN' } })
    await writeTextFile(path.join(roots.assets, 'library/withdrawn.json'), JSON.stringify({ format: 1, withdrawn: [{ asset: 'agenthix/code-review', version: '1.0.0', reason: 'It pushed to main.' }] }))

    expect((await getAssetVersions({ assetId }, ctx)).versions.find(v => v.version === '1.0.0')!.withdrawn).toBe('It pushed to main.')
    await expect(rollBackAsset({ assetId, versionId: old.id }, ctx)).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('It pushed to main.') })
    await expect(rollBackAsset({ assetId, versionId: old.id, withdrawnAccepted: true }, ctx)).resolves.toMatchObject({ version: '1.0.0' })
  })
})

describe('any version on purpose', () => {
  it('installs an older version from an upload with a reason, says it went back, and records why', async () => {
    const { user, ctx } = await contextWithRole('ADMIN')
    const { assetId } = await install(await upload('1.3.0'), ctx)
    const older = await upload('1.2.0', 'Older.\n')
    const shown = await previewAssetInstall(older, ctx)
    await expect(installAssetVersionOnPurpose({ ...older, confirm: { fingerprint: shown.fingerprint, reason: '', unsignedRead: true } }, ctx))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('why') })

    const result = await installAssetVersionOnPurpose({ ...older, confirm: { fingerprint: shown.fingerprint, reason: 'The new one is slow', unsignedRead: true } }, ctx)
    expect(result).toMatchObject({ version: '1.2.0', back: true, message: expect.stringContaining('older') })
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId! }, include: { currentVersion: true } })
    expect(asset.currentVersion).toMatchObject({ version: '1.2.0', source: 'UPLOAD', note: 'The new one is slow', byId: user.id })
    expect(await prisma.assetPinChange.findFirstOrThrow({ where: { assetId: assetId!, toVersionId: asset.currentVersionId! } })).toMatchObject({ reason: expect.stringContaining('Went back to 1.2.0 on purpose: The new one is slow') })
  })

  it('is for administrators and Library maintainers, and only for a skill already installed', async () => {
    const admin = await contextWithRole('ADMIN')
    const m = await contextWithRole('MEMBER')
    const pkg = await upload('1.0.0')
    const confirm = { fingerprint: (await previewAssetInstall(pkg, admin.ctx)).fingerprint, reason: 'r', unsignedRead: true }
    await expect(installAssetVersionOnPurpose({ ...pkg, confirm }, admin.ctx)).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("isn't installed") })
    await expect(installAssetVersionOnPurpose({ ...pkg, confirm }, m.ctx)).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('which agents have it', () => {
  it('gives it to chosen agents, takes it from one, and to every agent, with no per-agent exceptions', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const { assetId } = await install(await upload('1.0.0'), ctx)
    const ada = await createAgent({ name: 'Ada' })
    const bo = await createAgent({ name: 'Bo' })

    await addAssetToAgents({ assetId, agentIds: [ada.id, bo.id] }, ctx)
    expect(await getAssetHolders({ assetId }, ctx)).toMatchObject({ everyAgent: false, agents: [{ name: 'Ada' }, { name: 'Bo' }] })
    await removeAssetFromAgent({ assetId, agentId: bo.id }, ctx)
    expect((await getAssetHolders({ assetId }, ctx)).agents.map(a => a.name)).toEqual(['Ada'])

    await setAssetEveryAgent({ assetId, everyAgent: true }, ctx)
    await expect(removeAssetFromAgent({ assetId, agentId: ada.id }, ctx)).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('no exceptions') })
  })

  it('is for administrators only', async () => {
    const admin = await contextWithRole('ADMIN')
    const { assetId } = await install(await upload('1.0.0'), admin.ctx)
    const m = await contextWithRole('MEMBER')
    await prisma.libraryMaintainer.create({ data: { userId: m.user.id } })
    await expect(setAssetEveryAgent({ assetId, everyAgent: true }, m.ctx)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('names the agents that have it before removing, then marks it removed and keeps its grants', async () => {
    const { user, ctx } = await contextWithRole('ADMIN')
    const { assetId } = await install(await upload('1.0.0'), ctx)
    const ada = await createAgent({ name: 'Ada' })
    await addAssetToAgents({ assetId, agentIds: [ada.id] }, ctx)

    expect(await removeLibraryAsset({ assetId }, ctx)).toMatchObject({ removed: false, confirm: expect.stringContaining('Ada has it') })
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: assetId! } })).removedAt).toBeNull()
    expect(await removeLibraryAsset({ assetId, confirmed: true }, ctx)).toEqual({ removed: true })
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: assetId! } })).toMatchObject({ removedAt: expect.any(Date), removedById: user.id })
    expect(await prisma.assetGrant.count({ where: { assetId: assetId! } })).toBe(1)
  })
})
