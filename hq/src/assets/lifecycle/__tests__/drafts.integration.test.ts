/**
 * Integration tests (ADR-0094, real test DB) for editing: New skill, the shared draft and each revision's author,
 * publishing only the revision seen, the organisation's own copy of another publisher's skill taking its place, and
 * provenance written once with *verified* only for lines hq wrote (security review H5, M5).
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
import {
  addAssetCredit, addAssetToAgents, createSkillDraft, discardAssetDraft, editLibraryAsset, getAssetCopyNews, getAssetCredit,
  getAssetDraft, publishAssetDraft, removeLibraryAsset, saveAssetDraft, switchToOriginalAsset, switchToOwnCopy,
} from '../operations'
import { contextWithRole, useTempRoots, type TempRoots } from '../../../agents/__tests__/definitionFixtures'
import { createAgent } from '../../../test/factories'
import { fingerprintOf, readContent } from '../../content'
import { skillMdOf, skillMdVersion } from '../../skillFile'

let roots: TempRoots
beforeEach(async () => {
  roots = await useTempRoots()
  await prisma.org.create({ data: { name: 'Fernhill' } })
})
afterEach(async () => { await roots.restore() })

const md = (name: string, body: string) => `---\nname: ${name}\ndescription: "Writes release notes"\n---\n\n${body}\n`
const files = (name: string, body: string) => [{ path: 'SKILL.md', text: md(name, body) }]

async function upload(version: string, body = '', basedOn: unknown[] = []) {
  const z = new JSZip()
  z.file('code-review/package.json', JSON.stringify({ format: 2, kind: 'skill', publisher: 'acme', name: 'code-review', version, description: 'Reviews', licence: 'MIT', basedOn }))
  z.file('code-review/SKILL.md', `---\nname: code-review\ndescription: Reviews code\n---\n\n# Code Review\n${body}`)
  const args = { from: 'upload' as const, zip: (await z.generateAsync({ type: 'nodebuffer' })).toString('base64') }
  return args
}

async function install(args: Awaited<ReturnType<typeof upload>>, ctx: unknown) {
  const preview = await previewAssetInstall(args, ctx as never)
  return installAsset({ ...args, confirm: { fingerprint: preview.fingerprint, unsignedRead: true } }, ctx as never)
}

describe('New skill, drafts and publishing @SC-1624 @SC-1625', () => {
  it('makes an asset with a draft and no version, then publishes 1.0.0 with a note', async () => {
    const { user, ctx } = await contextWithRole('ADMIN')
    const made = await createSkillDraft({ name: 'release-notes', description: 'Writes release notes', shape: 'scripts' }, ctx)
    expect(made).toMatchObject({ identity: 'fernhill/release-notes', revision: 1 })
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: made.assetId } })).toMatchObject({ currentVersionId: null })

    await expect(publishAssetDraft({ assetId: made.assetId, revision: 1, note: '' }, ctx)).rejects.toMatchObject({ statusCode: 400 })
    await expect(publishAssetDraft({ assetId: made.assetId, revision: 1, note: 'First' }, ctx)).resolves.toMatchObject({ version: '1.0.0' })
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: made.assetId }, include: { currentVersion: true, draft: true } })
    expect(asset.currentVersion).toMatchObject({ version: '1.0.0', source: 'MADE_HERE', note: 'First', byId: user.id })
    expect(asset.draft).toBeNull()
  })

  it('writes the version it makes into SKILL.md before the fingerprint, so the stored files say what the record says', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const { assetId } = await createSkillDraft({ name: 'release-notes', description: 'Writes release notes' }, ctx)
    await publishAssetDraft({ assetId, revision: 1, note: 'First' }, ctx)
    await saveAssetDraft({ assetId, files: [{ path: 'SKILL.md', text: '---\nname: release-notes\ndescription: Notes\nversion: 2\n---\nBody\n' }], revision: null }, ctx)
    await publishAssetDraft({ assetId, revision: 1, note: 'Second', bump: 'major' }, ctx)

    for (const row of await prisma.assetVersion.findMany({ where: { assetId } })) {
      const stored = await readContent(row.digest, prisma)
      expect(fingerprintOf(stored)).toBe(row.digest)
      expect(skillMdVersion(skillMdOf(stored))).toBe(row.version)
    }
    const newest = await prisma.asset.findUniqueOrThrow({ where: { id: assetId }, include: { currentVersion: true } })
    expect(newest.currentVersion!.version).toBe('2.0.0')
    const md = (await readContent(newest.currentVersion!.digest, prisma)).find(f => f.path === 'SKILL.md')!.content.toString()
    expect(md).toContain('version: 2.0.0')
    expect(await prisma.packageContent.count({ where: { digest: newest.currentVersion!.digest, releasedAt: null } })).toBe(1)
  })

  it('keeps one shared draft, each revision with its author, and publishes only the revision the publisher saw @security-H5', async () => {
    const a = await contextWithRole('ADMIN')
    const b = await contextWithRole('MEMBER')
    await prisma.libraryMaintainer.create({ data: { userId: b.user.id } })
    const { assetId } = await createSkillDraft({ name: 'release-notes', description: 'Writes release notes' }, a.ctx)
    await publishAssetDraft({ assetId, revision: 1, note: 'First' }, a.ctx)

    expect(await saveAssetDraft({ assetId, files: files('release-notes', 'A'), revision: null }, a.ctx)).toMatchObject({ revision: 1 })
    await expect(saveAssetDraft({ assetId, files: files('release-notes', 'B'), revision: null }, b.ctx)).rejects.toMatchObject({ statusCode: 409 })
    await saveAssetDraft({ assetId, files: files('release-notes', 'B'), revision: 1 }, b.ctx)
    const draft = await getAssetDraft({ assetId }, a.ctx)
    expect(draft.revisions.map(r => [r.number, r.authorId])).toEqual([[1, a.user.id], [2, b.user.id]])
    expect(draft.changes.changed).toEqual(['SKILL.md'])

    await expect(publishAssetDraft({ assetId, revision: 1, note: 'Saw A' }, a.ctx)).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('revision 2') })
    await expect(publishAssetDraft({ assetId, revision: 2, note: 'Saw B', bump: 'patch' }, a.ctx)).resolves.toMatchObject({ version: '1.0.1' })
  })

  it('refuses package.json and a skill that fails validation, and refuses a member who is not a maintainer', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const { assetId } = await createSkillDraft({ name: 'release-notes', description: 'Writes release notes' }, ctx)
    await expect(saveAssetDraft({ assetId, files: [...files('release-notes', 'x'), { path: 'package.json', text: '{}' }] }, ctx)).rejects.toMatchObject({ statusCode: 400 })
    await expect(saveAssetDraft({ assetId, files: [{ path: 'SKILL.md', text: '# no front matter' }] }, ctx)).rejects.toMatchObject({ statusCode: 400 })
    const m = await contextWithRole('MEMBER')
    await expect(saveAssetDraft({ assetId, files: files('release-notes', 'x') }, m.ctx)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('discarding the draft of a skill never published removes it, and releases the content', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const { assetId } = await createSkillDraft({ name: 'release-notes', description: 'Writes release notes' }, ctx)
    await expect(discardAssetDraft({ assetId, revision: 1 }, ctx)).resolves.toEqual({ assetRemoved: true })
    expect(await prisma.asset.count()).toBe(0)
    expect(await prisma.packageContent.count({ where: { releasedAt: null } })).toBe(0)
  })
})

describe("editing another publisher's skill @SC-1628", () => {
  it('makes the organisation copy with its provenance, which takes the place on first publish, and switches back', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const original = await install(await upload('1.3.0', '', [{ skill: 'agenthix/x', version: '1.0.0', fingerprint: 'c'.repeat(64), copied: '2026-01-01', recorded: 'hq' }]), ctx)
    const ada = await createAgent({ name: 'Ada' })
    await addAssetToAgents({ assetId: original.assetId, agentIds: [ada.id] }, ctx)

    const copy = await editLibraryAsset({ assetId: original.assetId }, ctx)
    expect(copy).toMatchObject({ identity: 'fernhill/code-review', copied: true })
    expect(await editLibraryAsset({ assetId: original.assetId }, ctx)).toMatchObject({ assetId: copy.assetId, copied: false })
    const first = await prisma.assetVersion.findFirstOrThrow({ where: { assetId: copy.assetId } })
    expect(first).toMatchObject({ version: '1.3.0', source: 'MADE_HERE', licence: 'MIT' })
    expect((await prisma.packageFile.findMany({ where: { contentDigest: first.digest } })).map(f => f.path)).toEqual(['SKILL.md'])

    const credit = await getAssetCredit({ assetId: copy.assetId }, ctx)
    expect(credit.lines.map(l => [l.skill, l.recorded, l.shown])).toEqual([['agenthix/x', 'stated', 'stated'], ['unsigned/code-review', 'hq', 'verified']])
    expect(credit.lines[0]).toMatchObject({ statedBy: 'unsigned' })

    expect(await prisma.assetGrant.count({ where: { assetId: copy.assetId } })).toBe(0)
    await saveAssetDraft({ assetId: copy.assetId, files: files('code-review', 'Our way.'), revision: null }, ctx)
    await expect(publishAssetDraft({ assetId: copy.assetId, revision: 1, note: 'Our way' }, ctx)).resolves.toMatchObject({ version: '1.4.0', tookPlaceOf: 'unsigned/code-review' })
    expect(await prisma.assetGrant.findMany({ where: { agentId: ada.id } })).toMatchObject([{ assetId: copy.assetId }])
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: original.assetId! } })).toMatchObject({ setAsideById: copy.assetId, removedAt: null })

    await switchToOriginalAsset({ assetId: copy.assetId }, ctx)
    expect(await prisma.assetGrant.findMany({ where: { agentId: ada.id } })).toMatchObject([{ assetId: original.assetId }])
    await switchToOwnCopy({ assetId: copy.assetId }, ctx)
    expect(await prisma.assetGrant.findMany({ where: { agentId: ada.id } })).toMatchObject([{ assetId: copy.assetId }])
  })

  it('removing the copy in use gives its agents the original back, never leaving the original set aside', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const original = await install(await upload('1.3.0'), ctx)
    const ada = await createAgent({ name: 'Ada' })
    await addAssetToAgents({ assetId: original.assetId, agentIds: [ada.id] }, ctx)
    const copy = await editLibraryAsset({ assetId: original.assetId }, ctx)
    await saveAssetDraft({ assetId: copy.assetId, files: files('code-review', 'Our way.'), revision: null }, ctx)
    await publishAssetDraft({ assetId: copy.assetId, revision: 1, note: 'Our way' }, ctx)

    const asked = await removeLibraryAsset({ assetId: copy.assetId }, ctx)
    expect(asked).toMatchObject({ removed: false })
    expect((asked as { confirm: string }).confirm).toContain('unsigned/code-review goes back to them')
    await expect(removeLibraryAsset({ assetId: copy.assetId, confirmed: true }, ctx)).resolves.toEqual({ removed: true })
    expect(await prisma.assetGrant.findMany({ where: { agentId: ada.id } })).toMatchObject([{ assetId: original.assetId }])
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: original.assetId! } })).toMatchObject({ setAsideById: null, removedAt: null })
  })

  it('shows a newer original as news with what changed, never merged', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const original = await install(await upload('1.3.0'), ctx)
    const copy = await editLibraryAsset({ assetId: original.assetId }, ctx)
    expect(await getAssetCopyNews({ assetId: copy.assetId }, ctx)).toMatchObject({ copiedFrom: '1.3.0', newer: null })
    await install(await upload('1.4.0', 'Upstream.\n'), ctx)
    expect(await getAssetCopyNews({ assetId: copy.assetId }, ctx)).toMatchObject({ newer: { version: '1.4.0', changes: { changed: ['SKILL.md', 'package.json'] } } })
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: copy.assetId }, include: { currentVersion: true } })).currentVersion!.version).toBe('1.3.0')
  })

  it('carries provenance into every version, adds stated credit, and shows the line stated once hq no longer holds the original', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const original = await install(await upload('1.3.0'), ctx)
    const copy = await editLibraryAsset({ assetId: original.assetId }, ctx)
    await addAssetCredit({ assetId: copy.assetId, skill: 'blog.example.com/review-checklist' }, ctx)
    await saveAssetDraft({ assetId: copy.assetId, files: files('code-review', 'Ours.'), revision: null }, ctx)
    await publishAssetDraft({ assetId: copy.assetId, revision: 1, note: 'Ours' }, ctx)
    const credit = await getAssetCredit({ assetId: copy.assetId }, ctx)
    expect(credit.lines.map(l => [l.skill, l.shown])).toEqual([['unsigned/code-review', 'verified'], ['blog.example.com/review-checklist', 'stated']])

    await prisma.assetVersion.updateMany({ where: { assetId: original.assetId!, version: '1.3.0' }, data: { version: '1.3.1' } })
    expect((await getAssetCredit({ assetId: copy.assetId }, ctx)).lines[0].shown).toBe('stated')
  })
})
