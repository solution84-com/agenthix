/**
 * Integration tests (ADR-0094, real test DB) for *Update…* on a skill added from the Library (spec part 4 F3): the
 * origin kept in hq's record across publishes, the offer when the Library pins a newer version, the diff shown first,
 * the update written as the next version with the fingerprint check, who may do it, and the switch following it. The
 * site is the in-memory one in `fakeSite.ts`.
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
  addSkillToPlace, getPlaceSkillLibraryUpdate, getPlaceSkills, publishPlaceSkillFiles, rollBackPlaceSkillVersion,
  getPlaceSkillVersions, scanPlaceSkills, switchPlaceSkill, updatePlaceSkillFromLibrary,
} from '../operations'

const as = (u: { id: string }) => ({ user: { id: u.id } })
const meta = (text: string) => parse(text.split('---\n')[1]).metadata
const DIR = '.agents/skills/pm-sprint-planning'
const md = (body: string) => `---\nname: pm-sprint-planning\ndescription: Plans sprints\n---\n\n${body}\n`

beforeEach(async () => {
  disk.clear()
  site.failWrites = false
  await prisma.org.create({ data: { name: 'Fernhill' } })
})

async function setUp() {
  const project = await createProject()
  const admin = await createUserWithRole('MEMBER')
  const member = await createUserWithRole('MEMBER')
  await joinProjectAs(project.id, admin.id, 'ADMIN')
  await joinProjectAs(project.id, member.id, 'MEMBER')
  const loc = { ownerType: 'project' as const, ownerId: project.id, workspaceId: null, taskId: null }
  const asset = await prisma.asset.create({ data: { kind: 'SKILL', publisher: 'agenthix', name: 'pm-sprint-planning' } })
  const pin = async (version: string, body: string) => {
    const digest = await storeContent([{ path: 'SKILL.md', content: Buffer.from(md(body)) }, { path: 'package.json', content: Buffer.from('{}') }], prisma)
    const v = await prisma.assetVersion.create({ data: { assetId: asset.id, version, digest, source: 'BUILT_IN' } })
    await prisma.asset.update({ where: { id: asset.id }, data: { currentVersionId: v.id } })
  }
  await pin('1.3.0', 'Plan.')
  const added = await addSkillToPlace({ projectId: project.id, assetId: asset.id }, as(member))
  return { project, admin, member, loc, asset, pin, placeSkillId: added.placeSkillId }
}

describe('Update… on a skill added from the Library (F3) @SC-1647', () => {
  it('offers nothing until the Library pins a newer version, then offers it, kept across a publish here', async () => {
    const { project, admin, loc, pin, placeSkillId } = await setUp()
    expect((await getPlaceSkills({ projectId: project.id }, as(admin))).skills[0])
      .toMatchObject({ origin: { identity: 'agenthix/pm-sprint-planning', version: '1.3.0' }, libraryUpdate: null })

    put(loc, DIR, { 'SKILL.md': md('Plan, edited here.') })
    const [found] = (await scanPlaceSkills({ projectId: project.id }, as(admin))).skills
    await publishPlaceSkillFiles({ placeSkillId, fingerprint: found.fingerprint, note: 'Edited here.' }, as(admin))
    await pin('1.4.0', 'Plan better.')
    const [row] = (await getPlaceSkills({ projectId: project.id }, as(admin))).skills
    expect(row).toMatchObject({ version: 2, origin: { identity: 'agenthix/pm-sprint-planning', version: '1.3.0' }, libraryUpdate: '1.4.0' })
  })

  it('never takes an origin from the files: a skill not added from the Library claims none', async () => {
    const { project, admin, loc, pin } = await setUp()
    put(loc, '.agents/skills/sneaky', { 'SKILL.md': '---\nname: sneaky\ndescription: Claims\nmetadata:\n  identity: agenthix/pm-sprint-planning\n  version: "0.1.0"\n---\n\nX\n' })
    await scanPlaceSkills({ projectId: project.id }, as(admin))
    await pin('1.4.0', 'Plan better.')
    const sneaky = (await getPlaceSkills({ projectId: project.id }, as(admin))).skills.find(s => s.path.endsWith('sneaky'))!
    expect(sneaky).toMatchObject({ origin: null, libraryUpdate: null })
    await expect(getPlaceSkillLibraryUpdate({ placeSkillId: sneaky.id }, as(admin))).rejects.toMatchObject({ statusCode: 409 })
  })

  it('shows the change first, then writes the Library version as the next version; the switch follows it', async () => {
    const { project, admin, member, loc, pin, placeSkillId } = await setUp()
    const [before] = (await getPlaceSkills({ projectId: project.id }, as(admin))).skills
    await switchPlaceSkill({ placeSkillId, on: true, fingerprint: before.fingerprint }, as(admin))
    await pin('1.4.0', 'Plan better.')

    await expect(getPlaceSkillLibraryUpdate({ placeSkillId }, as(member))).rejects.toMatchObject({ statusCode: 403 })
    const shown = await getPlaceSkillLibraryUpdate({ placeSkillId }, as(admin))
    expect(shown).toMatchObject({ identity: 'agenthix/pm-sprint-planning', from: '1.3.0', to: '1.4.0', current: true })
    expect(shown.files.map(f => [f.path, f.status])).toEqual([['SKILL.md', 'modified']])
    expect(shown.files[0].after).toContain('Plan better.')

    await expect(updatePlaceSkillFromLibrary({ placeSkillId, version: '1.4.0', fingerprint: shown.fingerprint }, as(member))).rejects.toMatchObject({ statusCode: 403 })
    await expect(updatePlaceSkillFromLibrary({ placeSkillId, version: '1.5.0', fingerprint: shown.fingerprint }, as(admin))).rejects.toMatchObject({ statusCode: 409 })
    const done = await updatePlaceSkillFromLibrary({ placeSkillId, version: '1.4.0', fingerprint: shown.fingerprint }, as(admin))
    expect(done).toEqual({ number: 2, version: '1.4.0' })

    const written = get(loc, DIR)!
    expect(written['SKILL.md']).toContain('Plan better.')
    expect(meta(written['SKILL.md'])).toEqual({ version: '1.4.0', identity: 'agenthix/pm-sprint-planning' })
    const [row] = (await getPlaceSkills({ projectId: project.id }, as(admin))).skills
    expect(row).toMatchObject({ version: 2, state: 'on', switchHolds: true, origin: { version: '1.4.0' }, libraryUpdate: null })
    const { versions } = await getPlaceSkillVersions({ placeSkillId }, as(admin))
    expect(versions[0].note).toBe('Updated from agenthix/pm-sprint-planning 1.4.0')
  })

  it('is refused when the files changed since they were shown, and nothing is written', async () => {
    const { project, admin, loc, pin, placeSkillId } = await setUp()
    await pin('1.4.0', 'Plan better.')
    const shown = await getPlaceSkillLibraryUpdate({ placeSkillId }, as(admin))
    put(loc, DIR, { 'SKILL.md': md('Someone wrote this meanwhile.') })
    await scanPlaceSkills({ projectId: project.id }, as(admin))
    await expect(updatePlaceSkillFromLibrary({ placeSkillId, version: '1.4.0', fingerprint: shown.fingerprint }, as(admin)))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(get(loc, DIR)!['SKILL.md']).toContain('Someone wrote this meanwhile.')
    expect(await prisma.placeSkillVersion.count({ where: { placeSkillId } })).toBe(1)
  })

  it('a roll back to the version added keeps that version as the origin, so the offer returns', async () => {
    const { project, admin, pin, placeSkillId } = await setUp()
    await pin('1.4.0', 'Plan better.')
    const shown = await getPlaceSkillLibraryUpdate({ placeSkillId }, as(admin))
    await updatePlaceSkillFromLibrary({ placeSkillId, version: '1.4.0', fingerprint: shown.fingerprint }, as(admin))
    const { versions } = await getPlaceSkillVersions({ placeSkillId }, as(admin))
    await rollBackPlaceSkillVersion({ placeSkillId, versionId: versions.find(v => v.number === 1)!.id }, as(admin))
    expect((await getPlaceSkills({ projectId: project.id }, as(admin))).skills[0])
      .toMatchObject({ version: 3, origin: { version: '1.3.0' }, libraryUpdate: '1.4.0' })
  })
})
