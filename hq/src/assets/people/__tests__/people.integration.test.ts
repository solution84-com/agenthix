/**
 * Integration tests (ADR-0094 — real test DB) for the people side of the Library: trusted publishers (P1), the
 * organisation's settings (P2, P3, C1, D15) and Library maintainers with the reach warning (M1). Administrators only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { addTrustedPublisher, listTrustedPublishers, removeTrustedPublisher, renameTrustedPublisher, trustPublisher } from '../trustedPublishers'
import { getAssetSettings, updateAssetSettings } from '../settings'
import { listLibraryMaintainers, MAINTAINER_REACH, nameLibraryMaintainer, removeLibraryMaintainer } from '../maintainers'
import { contextWithRole } from '../../../agents/__tests__/definitionFixtures'

const ISSUER = 'https://token.actions.githubusercontent.com'
const WORKFLOW = 'https://github.com/acme/skills/.github/workflows/release.yml'
const keyless = (over: Record<string, unknown> = {}) => ({
  kind: 'keyless', name: 'acme', displayName: 'Acme', issuer: ISSUER, identity: WORKFLOW,
  repository: 'https://github.com/acme/skills', allowTags: true, allowedBranch: 'main', ...over,
})

let admin: Awaited<ReturnType<typeof contextWithRole>>
let member: Awaited<ReturnType<typeof contextWithRole>>

beforeEach(async () => {
  await prisma.org.create({ data: { name: 'Fernhill' } })
  admin = await contextWithRole('ADMIN')
  member = await contextWithRole('MEMBER')
})

describe('trusted publishers (P1)', () => {
  it('always lists Agenthix first, which can\'t be removed', async () => {
    const list = await listTrustedPublishers({}, admin.ctx)
    expect(list).toMatchObject([{ name: 'agenthix', kind: 'built-in', removable: false, status: 'trusted' }])
  })

  it('adds a keyless publisher bound exactly, under the canonical signer string', async () => {
    const { publisher } = await addTrustedPublisher(keyless(), admin.ctx)
    expect(publisher).toMatchObject({ name: 'acme', kind: 'keyless', refs: 'tags and branch main', status: 'trusted' })
    expect(await prisma.trustedPublisher.findUniqueOrThrow({ where: { name: 'acme' } })).toMatchObject({
      signerKind: 'KEYLESS', signerIdentity: `keyless:${ISSUER}#${WORKFLOW}`, certificateIdentity: WORKFLOW,
      repository: 'https://github.com/acme/skills', allowTags: true, allowedBranch: 'main', addedById: admin.user.id,
    })
  })

  it('adds a key pair by its key', async () => {
    const pem = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ type: 'spki', format: 'pem' }).toString()
    const { publisher } = await addTrustedPublisher({ kind: 'key', name: 'acme-key', displayName: 'Acme', publicKey: pem }, admin.ctx)
    expect(publisher).toMatchObject({ kind: 'key', keyId: expect.stringMatching(/^[0-9a-f]{64}$/) })
  })

  it('refuses a reserved name, a taken name, and the organisation\'s own name', async () => {
    await expect(addTrustedPublisher(keyless({ name: 'agenthix' }), admin.ctx)).rejects.toMatchObject({ statusCode: 400 })
    await expect(addTrustedPublisher(keyless({ name: 'unsigned' }), admin.ctx)).rejects.toMatchObject({ statusCode: 400 })
    await addTrustedPublisher(keyless(), admin.ctx)
    await expect(addTrustedPublisher(keyless({ identity: 'alice@example.com', repository: null, allowTags: false, allowedBranch: null }), admin.ctx))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('already names') })
    await prisma.org.updateMany({ data: { publisherName: 'fernhill' } })
    await expect(addTrustedPublisher(keyless({ name: 'fernhill', identity: 'bob@example.com', repository: null, allowTags: false, allowedBranch: null }), admin.ctx))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('removes a publisher, keeps its row and name, and restores it under that name when the same signer is added again', async () => {
    const { publisher } = await addTrustedPublisher(keyless(), admin.ctx)
    await removeTrustedPublisher({ id: publisher.id }, admin.ctx)
    expect(await prisma.trustedPublisher.findUniqueOrThrow({ where: { id: publisher.id! } })).toMatchObject({ removedById: admin.user.id })
    const again = await addTrustedPublisher(keyless({ name: 'other-name', allowedBranch: null }), admin.ctx)
    expect(again.publisher).toMatchObject({ id: publisher.id, name: 'acme', status: 'trusted', refs: 'tags' })
    await expect(addTrustedPublisher(keyless(), admin.ctx)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('trusts a publisher remembered from "install this once", under its own name', async () => {
    const once = await prisma.trustedPublisher.create({ data: {
      name: 'acme', displayName: 'acme', signerKind: 'KEYLESS', signerIdentity: `keyless:${ISSUER}#${WORKFLOW}`, issuer: ISSUER,
      certificateIdentity: WORKFLOW, repository: 'https://github.com/acme/skills', allowTags: true, removedAt: new Date(),
    } })
    const { publisher } = await trustPublisher({ id: once.id, displayName: 'Acme Ltd' }, admin.ctx)
    expect(publisher).toMatchObject({ name: 'acme', displayName: 'Acme Ltd', status: 'trusted' })
  })

  it('renames only the name shown, never the name in what it signed, and counts what it signed in the Library', async () => {
    const { publisher } = await addTrustedPublisher(keyless(), admin.ctx)
    await prisma.asset.create({ data: { kind: 'SKILL', publisher: 'acme', name: 'sql-review' } })
    await prisma.asset.create({ data: { kind: 'SKILL', publisher: 'acme', name: 'gone', removedAt: new Date() } })
    const renamed = await renameTrustedPublisher({ id: publisher.id, displayName: '  Acme Corp  ' }, admin.ctx)
    expect(renamed.publisher).toMatchObject({ name: 'acme', displayName: 'Acme Corp', installed: 1 })
    expect((await listTrustedPublishers({}, admin.ctx)).find(p => p.name === 'acme')).toMatchObject({ displayName: 'Acme Corp', installed: 1 })
    await expect(renameTrustedPublisher({ id: publisher.id, displayName: ' ' }, admin.ctx)).rejects.toMatchObject({ statusCode: 400 })
    await expect(renameTrustedPublisher({ id: publisher.id, displayName: 'Acme' }, member.ctx)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses removing a built-in row', async () => {
    const row = await prisma.trustedPublisher.create({ data: { name: 'agenthix', displayName: 'Agenthix', signerKind: 'KEYLESS', signerIdentity: 'keyless:x#y', builtIn: true } })
    await expect(removeTrustedPublisher({ id: row.id }, admin.ctx)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('is for administrators only, Library maintainers included', async () => {
    await prisma.libraryMaintainer.create({ data: { userId: member.user.id } })
    await expect(listTrustedPublishers({}, member.ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(addTrustedPublisher(keyless(), member.ctx)).rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.trustedPublisher.count()).toBe(0)
  })
})

describe('the organisation\'s settings', () => {
  it('ships unsigned allowed, administrators installing from outside, skills in files off, personal skills on', async () => {
    expect(await getAssetSettings({}, admin.ctx)).toEqual({
      unsignedAssets: 'allowed', outsideInstallers: 'ADMINS', fileSkillsDefault: 'OFF', personalSkillsOutsideSpace: true,
    })
  })

  it('changes them, On by default only once its warning is confirmed', async () => {
    await expect(updateAssetSettings({ fileSkillsDefault: 'ON' }, admin.ctx)).rejects.toMatchObject({ statusCode: 400 })
    const after = await updateAssetSettings({ unsignedAssets: 'never', outsideInstallers: 'ADMINS_AND_MAINTAINERS', fileSkillsDefault: 'ON', confirmUnreviewed: true, personalSkillsOutsideSpace: false }, admin.ctx)
    expect(after).toEqual({ unsignedAssets: 'never', outsideInstallers: 'ADMINS_AND_MAINTAINERS', fileSkillsDefault: 'ON', personalSkillsOutsideSpace: false })
    expect(await prisma.org.findFirstOrThrow()).toMatchObject({ unsignedAssetsAllowed: false, fileSkillsDefault: 'ON' })
  })

  it('is for administrators only', async () => {
    await prisma.libraryMaintainer.create({ data: { userId: member.user.id } })
    await expect(getAssetSettings({}, member.ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(updateAssetSettings({ unsignedAssets: 'never' }, member.ctx)).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('Library maintainers (D28, M1)', () => {
  it('shows the reach first and names nobody until it is confirmed', async () => {
    expect(await nameLibraryMaintainer({ userId: member.user.id }, admin.ctx)).toEqual({ named: false, reach: MAINTAINER_REACH })
    expect(await prisma.libraryMaintainer.count()).toBe(0)
    const named = await nameLibraryMaintainer({ userId: member.user.id, reachConfirmed: true }, admin.ctx)
    expect(named).toMatchObject({ named: true, reach: MAINTAINER_REACH, maintainer: { userId: member.user.id, namedById: admin.user.id } })
    expect(await listLibraryMaintainers({}, admin.ctx)).toMatchObject([{ userId: member.user.id }])
  })

  it('refuses an administrator, someone who left, and a maintainer naming others', async () => {
    const other = await contextWithRole('ADMIN')
    await expect(nameLibraryMaintainer({ userId: other.user.id, reachConfirmed: true }, admin.ctx)).rejects.toMatchObject({ statusCode: 409 })
    await prisma.user.update({ where: { id: member.user.id }, data: { deactivatedAt: new Date() } })
    await expect(nameLibraryMaintainer({ userId: member.user.id, reachConfirmed: true }, admin.ctx)).rejects.toMatchObject({ statusCode: 404 })
    const maintainer = await contextWithRole('MEMBER')
    await prisma.libraryMaintainer.create({ data: { userId: maintainer.user.id } })
    const third = await contextWithRole('MEMBER')
    await expect(nameLibraryMaintainer({ userId: third.user.id, reachConfirmed: true }, maintainer.ctx)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('removes the role, leaving the history that names them', async () => {
    await nameLibraryMaintainer({ userId: member.user.id, reachConfirmed: true }, admin.ctx)
    await removeLibraryMaintainer({ userId: member.user.id }, admin.ctx)
    expect(await prisma.libraryMaintainer.count()).toBe(0)
    expect(await prisma.user.findUnique({ where: { id: member.user.id } })).not.toBeNull()
    await expect(removeLibraryMaintainer({ userId: member.user.id }, admin.ctx)).rejects.toMatchObject({ statusCode: 404 })
  })
})
