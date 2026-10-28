/**
 * Integration tests (ADR-0094, real test DB) for what a run is told about skills: installed skills at their pinned
 * versions and only those this agent has; the place's switched-on skills in files, recorded from a scan; the person's
 * published skills on their own conversation only; and the clash order, installed, project, person.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import type { LocationScanSkillsResult, ScannedSkill } from '@agenthix/core'
import { storeContent } from '../../content'
import { resolveRunSkills, type RunSkillsInput } from '../runSkills'
import type { ScanPlace } from '../fileSkills'
import { createAgent, createProject, createUser } from '../../../test/factories'

const skillMd = (name: string, extra = '') => Buffer.from(`---\nname: ${name}\ndescription: ${name} skill\n${extra}---\n\nBody of ${name}`)

async function content(name: string, extra = '') {
  return storeContent([{ path: 'SKILL.md', content: skillMd(name, extra) }], prisma)
}

async function installed(publisher: string, name: string, data: { givenToAll?: boolean; removedAt?: Date; grantTo?: string } = {}) {
  const asset = await prisma.asset.create({ data: { kind: 'SKILL', publisher, name, givenToAll: data.givenToAll ?? false, removedAt: data.removedAt ?? null } })
  const digest = await content(name)
  const version = await prisma.assetVersion.create({ data: { assetId: asset.id, version: '1.2.0', digest, source: 'UPLOAD' } })
  await prisma.asset.update({ where: { id: asset.id }, data: { currentVersionId: version.id } })
  if (data.grantTo) await prisma.assetGrant.create({ data: { assetId: asset.id, agentId: data.grantTo } })
  return { asset, version }
}

const scanOf = (skills: ScannedSkill[]): ScanPlace => async () => ({ skills, problems: [], truncated: false }) satisfies LocationScanSkillsResult
const noScan: ScanPlace = scanOf([])
const F = 'f'.repeat(64)

let agentId: string
let projectId: string
let personId: string

beforeEach(async () => {
  await prisma.org.create({ data: { name: 'Fernhill' } })
  agentId = (await createAgent()).id
  projectId = (await createProject()).id
  personId = (await createUser()).id
})

const run = (over: Partial<RunSkillsInput> = {}): RunSkillsInput => ({
  agentId, siteId: 'site-1', kind: 'chat', startedBy: 'person', personId, ownConversation: true,
  place: { placeType: 'project', placeId: projectId }, workspaceIds: [], ...over,
})

describe('installed skills @SC-1650', () => {
  it('every agent\'s and this agent\'s, at the pinned version, with the content to deliver; never another agent\'s, a removed or a set-aside one', async () => {
    const every = await installed('acme', 'every', { givenToAll: true })
    const mine = await installed('acme', 'mine', { grantTo: agentId })
    const other = await createAgent()
    await installed('acme', 'theirs', { grantTo: other.id })
    await installed('acme', 'removed', { givenToAll: true, removedAt: new Date() })
    const original = await installed('acme', 'original', { givenToAll: true })
    await prisma.asset.update({ where: { id: original.asset.id }, data: { setAsideById: mine.asset.id } })

    const skills = await resolveRunSkills(run(), prisma, noScan)
    expect(skills.installedSkills).toEqual([
      { identity: 'acme/every', version: '1.2.0', digest: every.version.digest, level: 'org', ref: { kind: 'skill', key: every.version.id, digest: every.version.digest } },
      { identity: 'acme/mine', version: '1.2.0', digest: mine.version.digest, level: 'agent', ref: { kind: 'skill', key: mine.version.id, digest: mine.version.digest } },
    ])
  })
})

describe('skills in the place\'s files @SC-1651', () => {
  const found: ScannedSkill = { group: 'place', path: 'release', fingerprint: F, name: 'release', description: 'd' }

  it('records what the scan found, off under Off by default, and named once switched on for that fingerprint', async () => {
    expect((await resolveRunSkills(run(), prisma, scanOf([found]))).fileSkills).toEqual([])
    const row = await prisma.placeSkill.findFirstOrThrow({ where: { placeId: projectId } })
    expect(row).toMatchObject({ path: '.agents/skills/release', lastFingerprint: F, switch: null })

    await prisma.placeSkill.update({ where: { id: row.id }, data: { switch: 'ON', switchFingerprint: F } })
    expect((await resolveRunSkills(run(), prisma, scanOf([found]))).fileSkills)
      .toEqual([{ placeId: projectId, path: '.agents/skills/release', fingerprint: F, group: 'place' }])

    const changed = { ...found, fingerprint: 'e'.repeat(64) }
    expect((await resolveRunSkills(run(), prisma, scanOf([changed]))).fileSkills).toEqual([])
  })

  it('none, said why, when the site can\'t scan', async () => {
    const failing: ScanPlace = async () => { throw new Error('unsupported: this site does not scan for skills yet') }
    const skills = await resolveRunSkills(run(), prisma, failing)
    expect(skills.fileSkills).toEqual([])
    expect(skills.notes[0]).toMatch(/not read this turn/)
  })

  it('no scan at all when the organisation says Never', async () => {
    await prisma.org.updateMany({ data: { fileSkillsDefault: 'NEVER' } })
    const scan = vi.fn(scanOf([found]))
    await resolveRunSkills(run(), prisma, scan)
    expect(scan).not.toHaveBeenCalled()
  })
})

async function personSkill(name: string, data: { published?: boolean; switchOn?: boolean } = {}) {
  const row = await prisma.placeSkill.create({
    data: { placeType: 'user', placeId: personId, path: `.agents/skills/${name}`, group: 'PLACE', lastFingerprint: F },
  })
  if (data.published === false) return { row, version: null }
  const digest = await content(name)
  const version = await prisma.placeSkillVersion.create({ data: { placeSkillId: row.id, number: 1, digest } })
  if (data.switchOn !== false) await prisma.placeSkill.update({ where: { id: row.id }, data: { switch: 'ON', switchFingerprint: digest } })
  return { row, version }
}

describe('the person\'s skills @SC-1649', () => {
  it('their published, switched-on skills follow them into their own conversation in a project', async () => {
    const { version } = await personSkill('notes')
    await personSkill('draft-only', { published: false })
    const skills = await resolveRunSkills(run(), prisma, noScan)
    expect(skills.personSkills).toEqual([{ identity: `${personId}/notes`, version: '1', digest: version!.digest, ref: { kind: 'skill', key: version!.id, digest: version!.digest } }])
  })

  it('never a scheduled run, a task, or a run not of their own conversation @security-L5', async () => {
    await personSkill('notes')
    for (const over of [{ startedBy: 'schedule' as const }, { kind: 'task' as const }, { ownConversation: false }]) {
      expect((await resolveRunSkills(run(over), prisma, noScan)).personSkills).toEqual([])
    }
  })

  it('never when the organisation has turned Personal skills outside Your space off', async () => {
    await personSkill('notes')
    await prisma.org.updateMany({ data: { personalSkillsOutsideSpace: false } })
    expect((await resolveRunSkills(run(), prisma, noScan)).personSkills).toEqual([])
  })
})

describe('the clash order @SC-1652', () => {
  it('installed before the project, the project before the person, each set aside with why', async () => {
    await installed('acme', 'code-review', { givenToAll: true })
    await personSkill('notes')
    const scan = scanOf([
      { group: 'place', path: 'code-review', fingerprint: F, name: 'code-review', description: 'd', identity: 'acme/code-review' },
      { group: 'place', path: 'notes', fingerprint: F, name: 'notes', description: 'd' },
    ])
    await prisma.org.updateMany({ data: { fileSkillsDefault: 'ON' } })

    const skills = await resolveRunSkills(run(), prisma, scan)
    expect(skills.installedSkills.map(s => s.identity)).toEqual(['acme/code-review'])
    expect(skills.fileSkills.map(s => s.path)).toEqual(['.agents/skills/notes'])
    expect(skills.personSkills).toEqual([])
    expect(skills.setAside.map(s => [s.label, s.level, s.by])).toEqual([['code-review', 'project', 'installed'], ['notes', 'person', 'project']])
    const reviewRow = await prisma.placeSkill.findFirstOrThrow({ where: { placeId: projectId, path: '.agents/skills/code-review' } })
    expect(reviewRow.setAsideReason).toMatch(/installed acme\/code-review/)
  })
})

describe('two skills that would stage under one name @SC-1653', () => {
  it('sends only the one installed first, and says why the other was set aside', async () => {
    const first = await installed('acme', 'review', { givenToAll: true })
    const later = await installed('other', 'review', { givenToAll: true })
    await prisma.asset.update({ where: { id: later.asset.id }, data: { createdAt: new Date(first.asset.createdAt.getTime() + 1000) } })
    const skills = await resolveRunSkills(run(), prisma, noScan)
    expect(skills.installedSkills.map(s => s.identity)).toEqual(['acme/review'])
    expect(skills.installedSkills[0].ref?.key).toBe(first.version.id)
    expect(skills.setAside.map(s => [s.label, s.reason])).toEqual([['other/review', 'Set aside: another skill has the same name here.']])
    expect(skills.notes).toEqual(['other/review: Set aside: another skill has the same name here.'])
  })
})
