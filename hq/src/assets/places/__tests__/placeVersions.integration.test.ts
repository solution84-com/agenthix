/**
 * Integration tests (ADR-0094, real test DB) for a place skill's versions by publishing, *changed in files, not
 * published*, roll back and put back, and *Add to this place* and *Remove* (spec part 4 F3, FV1–FV6; D25; security
 * review H5). The site is the in-memory one in `fakeSite.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parse } from 'yaml'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../siteSkills', () => import('./fakeSite'))

import { createProject, createUserWithRole, joinProjectAs } from '../../../test/factories'
import { storeContent } from '../../content'
import { disk, get, put, site } from './fakeSite'
import {
  addSkillToPlace, createPlaceSkillDraft, getPlaceSkillDraft, getPlaceSkills, getPlaceSkillVersions, publishPlaceSkillDraft,
  publishPlaceSkillFiles, putBackPlaceSkillVersion, removePlaceSkill, rollBackPlaceSkillVersion, savePlaceSkillDraft,
  scanPlaceSkills, switchPlaceSkill,
} from '../operations'

const as = (u: { id: string }) => ({ user: { id: u.id } })
const SKILL = (body: string) => `---\nname: review\ndescription: Reviews code\n---\n\n# Review\n${body}\n`
const meta = (text: string) => parse(text.split('---\n')[1]).metadata

beforeEach(async () => {
  disk.clear()
  site.failWrites = false
  await prisma.org.create({ data: { name: 'Fernhill' } })
})

async function aPlace() {
  const project = await createProject()
  const admin = await createUserWithRole('MEMBER')
  const member = await createUserWithRole('MEMBER')
  await joinProjectAs(project.id, admin.id, 'ADMIN')
  await joinProjectAs(project.id, member.id, 'MEMBER')
  const loc = { ownerType: 'project' as const, ownerId: project.id, workspaceId: null, taskId: null }
  return { project, admin, member, loc }
}

async function foundSkill(projectId: string, userId: string) {
  const [skill] = (await scanPlaceSkills({ projectId }, as({ id: userId }))).skills
  return skill
}

describe('versions by publishing (FV1–FV3)', () => {
  it('lets a member draft, only an administrator publish the revision seen, and writes the version into metadata', async () => {
    const { project, admin, member, loc } = await aPlace()
    const made = await createPlaceSkillDraft({ projectId: project.id, name: 'review', description: 'Reviews code' }, as(member))
    expect(get(loc, '.agents/skills/review')).toBeUndefined()
    const saved = await savePlaceSkillDraft({ placeSkillId: made.placeSkillId, revision: 1, files: [{ path: 'SKILL.md', text: SKILL('One.') }] }, as(member))
    expect(saved.revision).toBe(2)

    await expect(publishPlaceSkillDraft({ placeSkillId: made.placeSkillId, revision: 2, note: 'First' }, as(member))).rejects.toMatchObject({ statusCode: 403 })
    await expect(publishPlaceSkillDraft({ placeSkillId: made.placeSkillId, revision: 1, note: 'First' }, as(admin))).rejects.toMatchObject({ statusCode: 409 })
    const published = await publishPlaceSkillDraft({ placeSkillId: made.placeSkillId, revision: 2, note: 'First' }, as(admin))
    expect(published.number).toBe(1)

    const written = get(loc, '.agents/skills/review')!
    expect(meta(written['SKILL.md'])).toEqual({ version: '1' })
    expect(await prisma.draft.count({ where: { placeSkillId: made.placeSkillId } })).toBe(0)
    const [skill] = (await scanPlaceSkills({ projectId: project.id }, as(admin))).skills
    expect(skill).toMatchObject({ status: 'published', version: 1, fingerprint: published.fingerprint, state: 'off' })
  })

  it('rolls back by publishing the older files as the next version, and carries the switch to what it wrote', async () => {
    const { project, admin, loc } = await aPlace()
    const made = await createPlaceSkillDraft({ projectId: project.id, name: 'review', description: 'Reviews code' }, as(admin))
    const v1 = await publishPlaceSkillDraft({ placeSkillId: made.placeSkillId, revision: 1, note: 'First' }, as(admin))
    await switchPlaceSkill({ placeSkillId: made.placeSkillId, on: true, fingerprint: v1.fingerprint }, as(admin))
    await savePlaceSkillDraft({ placeSkillId: made.placeSkillId, revision: null, files: [{ path: 'SKILL.md', text: SKILL('Two.') }] }, as(admin))
    await publishPlaceSkillDraft({ placeSkillId: made.placeSkillId, revision: 1, note: 'Second' }, as(admin))
    expect((await getPlaceSkills({ projectId: project.id }, as(admin))).skills[0]).toMatchObject({ version: 2, state: 'on' })

    const { versions } = await getPlaceSkillVersions({ placeSkillId: made.placeSkillId }, as(admin))
    const first = versions.find(v => v.number === 1)!
    const back = await rollBackPlaceSkillVersion({ placeSkillId: made.placeSkillId, versionId: first.id, reason: 'Two broke it' }, as(admin))
    expect(back.number).toBe(3)
    const files = get(loc, '.agents/skills/review')!
    expect(files['SKILL.md']).not.toContain('Two.')
    expect(meta(files['SKILL.md'])).toEqual({ version: '3' })
    const history = (await getPlaceSkillVersions({ placeSkillId: made.placeSkillId }, as(admin))).versions
    expect(history.map(v => [v.number, v.note, v.inFiles])).toEqual([[3, 'Rolled back to version 1: Two broke it', true], [2, 'Second', false], [1, 'First', false]])
  })

  it('records nothing when the site cannot write the files', async () => {
    const { project, admin } = await aPlace()
    const made = await createPlaceSkillDraft({ projectId: project.id, name: 'review', description: 'Reviews code' }, as(admin))
    site.failWrites = true
    await expect(publishPlaceSkillDraft({ placeSkillId: made.placeSkillId, revision: 1, note: 'First' }, as(admin))).rejects.toMatchObject({ statusCode: 409 })
    expect(await prisma.placeSkillVersion.count()).toBe(0)
    expect(await prisma.draft.count({ where: { placeSkillId: made.placeSkillId } })).toBe(1)
  })
})

describe('changed in files, not published (FV4)', () => {
  async function changedSkill() {
    const p = await aPlace()
    const made = await createPlaceSkillDraft({ projectId: p.project.id, name: 'review', description: 'Reviews code' }, as(p.admin))
    await publishPlaceSkillDraft({ placeSkillId: made.placeSkillId, revision: 1, note: 'First' }, as(p.admin))
    // Someone writes the folder outside the editor.
    put(p.loc, '.agents/skills/review', { 'SKILL.md': SKILL('Edited by an agent.'), 'scripts/x.sh': 'curl example.org' })
    const skill = await foundSkill(p.project.id, p.admin.id)
    return { ...p, skill }
  }

  it('shows the change, with every file, and publishes it as the next version from the files the publisher saw', async () => {
    const { admin, member, loc, skill } = await changedSkill()
    expect(skill).toMatchObject({ status: 'changed', version: null, newestVersion: 1, state: 'off' })
    await expect(publishPlaceSkillFiles({ placeSkillId: skill.id, fingerprint: skill.fingerprint, note: 'Kept' }, as(member))).rejects.toMatchObject({ statusCode: 403 })
    await expect(publishPlaceSkillFiles({ placeSkillId: skill.id, fingerprint: 'a'.repeat(64), note: 'Kept' }, as(admin))).rejects.toMatchObject({ statusCode: 409 })
    const v2 = await publishPlaceSkillFiles({ placeSkillId: skill.id, fingerprint: skill.fingerprint, note: 'Kept' }, as(admin))
    expect(v2.number).toBe(2)
    expect(meta(get(loc, '.agents/skills/review')!['SKILL.md'])).toEqual({ version: '2' })
    expect(Object.keys(get(loc, '.agents/skills/review')!).sort()).toEqual(['SKILL.md', 'scripts/x.sh'])
  })

  it('puts the newest version back over the change', async () => {
    const { admin, loc, skill } = await changedSkill()
    await expect(putBackPlaceSkillVersion({ placeSkillId: skill.id, fingerprint: 'b'.repeat(64) }, as(admin))).rejects.toMatchObject({ statusCode: 409 })
    expect(await putBackPlaceSkillVersion({ placeSkillId: skill.id, fingerprint: skill.fingerprint }, as(admin))).toEqual({ number: 1 })
    expect(Object.keys(get(loc, '.agents/skills/review')!)).toEqual(['SKILL.md'])
    expect(await prisma.placeSkillVersion.count({ where: { placeSkillId: skill.id } })).toBe(1)
  })

  it("refuses publishing files that changed again since they were shown", async () => {
    const { admin, loc, skill } = await changedSkill()
    put(loc, '.agents/skills/review', { 'SKILL.md': SKILL('Changed once more.') })
    await expect(publishPlaceSkillFiles({ placeSkillId: skill.id, fingerprint: skill.fingerprint, note: 'Kept' }, as(admin))).rejects.toMatchObject({ statusCode: 409 })
    expect(await prisma.placeSkillVersion.count({ where: { placeSkillId: skill.id } })).toBe(1)
  })
})

describe('a repository skill is read-only in HQ (FV6)', () => {
  it('refuses drafting, publishing and removing it, and still lets it be switched', async () => {
    const { project, admin } = await aPlace()
    const content = await storeContent([{ path: 'SKILL.md', content: Buffer.from(SKILL('Repo.')) }], prisma)
    const row = await prisma.placeSkill.create({
      data: { placeType: 'project', placeId: project.id, path: 'workspace/w1/.claude/skills/review', group: 'WORKSPACE', workspaceId: 'w1', lastFingerprint: content },
    })
    await expect(getPlaceSkillDraft({ placeSkillId: row.id }, as(admin))).rejects.toMatchObject({ statusCode: 409 })
    await expect(publishPlaceSkillFiles({ placeSkillId: row.id, fingerprint: content, note: 'x' }, as(admin))).rejects.toMatchObject({ statusCode: 409 })
    await expect(removePlaceSkill({ placeSkillId: row.id }, as(admin))).rejects.toMatchObject({ statusCode: 409 })
    expect((await switchPlaceSkill({ placeSkillId: row.id, on: false, fingerprint: content }, as(admin))).state).toBe('off')
  })
})

describe('Add to this place, and Remove (F3)', () => {
  async function librarySkill() {
    const digest = await storeContent([
      { path: 'SKILL.md', content: Buffer.from('---\nname: pm-sprint-planning\ndescription: Plans sprints\n---\n\nPlan.\n') },
      { path: 'package.json', content: Buffer.from('{}') },
    ], prisma)
    const asset = await prisma.asset.create({ data: { kind: 'SKILL', publisher: 'agenthix', name: 'pm-sprint-planning' } })
    const version = await prisma.assetVersion.create({ data: { assetId: asset.id, version: '1.3.0', digest, source: 'BUILT_IN' } })
    return prisma.asset.update({ where: { id: asset.id }, data: { currentVersionId: version.id } })
  }

  it("copies the pinned version in with its identity and version, off until switched on; members add, administrators remove", async () => {
    const { project, admin, member, loc } = await aPlace()
    const asset = await librarySkill()
    const added = await addSkillToPlace({ projectId: project.id, assetId: asset.id }, as(member))
    const files = get(loc, '.agents/skills/pm-sprint-planning')!
    expect(Object.keys(files)).toEqual(['SKILL.md'])
    expect(meta(files['SKILL.md'])).toEqual({ version: '1.3.0', identity: 'agenthix/pm-sprint-planning' })
    const versions = (await getPlaceSkillVersions({ placeSkillId: added.placeSkillId }, as(member))).versions
    expect(versions.map(v => v.note)).toEqual(['Added from agenthix/pm-sprint-planning 1.3.0'])
    expect((await getPlaceSkills({ projectId: project.id }, as(member))).skills[0]).toMatchObject({ state: 'off', status: 'published' })
    await expect(addSkillToPlace({ projectId: project.id, assetId: asset.id }, as(member))).rejects.toMatchObject({ statusCode: 409 })

    await expect(removePlaceSkill({ placeSkillId: added.placeSkillId }, as(member))).rejects.toMatchObject({ statusCode: 403 })
    await removePlaceSkill({ placeSkillId: added.placeSkillId }, as(admin))
    expect(get(loc, '.agents/skills/pm-sprint-planning')).toBeUndefined()
    expect((await getPlaceSkills({ projectId: project.id }, as(admin))).skills).toHaveLength(0)
    expect(await prisma.placeSkillVersion.count({ where: { placeSkillId: added.placeSkillId } })).toBe(1)
  })

  it('never writes over a folder HQ has not looked at, whether adding or publishing a new skill', async () => {
    const { project, admin, loc } = await aPlace()
    const asset = await librarySkill()
    put(loc, '.agents/skills/pm-sprint-planning', { 'SKILL.md': 'Written by an agent before any scan.' })
    put(loc, '.agents/skills/review', { 'SKILL.md': 'Also unseen.' })
    await expect(addSkillToPlace({ projectId: project.id, assetId: asset.id }, as(admin))).rejects.toMatchObject({ statusCode: 409 })
    const made = await createPlaceSkillDraft({ projectId: project.id, name: 'review', description: 'Reviews code' }, as(admin))
    await expect(publishPlaceSkillDraft({ placeSkillId: made.placeSkillId, revision: 1, note: 'First' }, as(admin))).rejects.toMatchObject({ statusCode: 409 })
    expect(get(loc, '.agents/skills/review')).toEqual({ 'SKILL.md': 'Also unseen.' })
    expect(await prisma.placeSkillVersion.count()).toBe(0)
  })
})
