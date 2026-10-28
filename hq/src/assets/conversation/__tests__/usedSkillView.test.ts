/**
 * Who may open a used skill, checked when it is opened (security review M6), against a small in-memory stand-in for
 * hq's records. The same cases against the real database are in `usedSkill.integration.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {}, HttpError: class extends Error {} }))

import { toolStep, type RunSkillUse, type WorkStep } from '@agenthix/core'
import type { Db } from '../../../packages/packageStore'
import { usedSkillSteps, usedSkillView } from '../usedSkillView'

const FP = (c: string) => c.repeat(64)
const md = (name: string, body = '') => Buffer.from(`---\nname: ${name}\ndescription: d\n---\n\n${body}`)

type File = { contentDigest: string; path: string; bytes: Buffer }
const FILES: File[] = [
  { contentDigest: FP('a'), path: 'SKILL.md', bytes: md('Review code', 'Check errors.') },
  { contentDigest: FP('a'), path: 'checklist.md', bytes: Buffer.from('- one') },
  { contentDigest: FP('b'), path: 'SKILL.md', bytes: md('Review a release') },
  { contentDigest: FP('c'), path: 'SKILL.md', bytes: md('My notes') },
]
const ASSET = { publisher: 'fernhill', name: 'review', builtIn: false, currentVersion: { id: 'av2', version: '1.4.0' } }
const VERSIONS = [{ id: 'av1', version: '1.3.0', digest: FP('a'), asset: ASSET }]
const PROJECTS = [
  { id: 'proj', name: 'Website rebuild', personalOwnerId: null, personalSpace: false },
  { id: 'space-ada', name: 'Your space', personalOwnerId: 'ada', personalSpace: true },
]
const PLACE_SKILLS = [
  { id: 'ps1', placeType: 'project', placeId: 'proj', path: '.agents/skills/release' },
  { id: 'ps2', placeType: 'user', placeId: 'ada', path: '.agents/skills/notes' },
]
const PLACE_VERSIONS = [
  { placeSkillId: 'ps1', number: 3, digest: FP('b') },
  { placeSkillId: 'ps1', number: 4, digest: FP('d') },
  { placeSkillId: 'ps2', number: 1, digest: FP('c') },
]
const PEOPLE: Record<string, { role: string | null; deactivatedAt?: Date }> = {
  ada: { role: 'MEMBER' }, ben: { role: 'MEMBER' }, gone: { role: 'MEMBER', deactivatedAt: new Date() }, outsider: { role: null },
}
const MEMBERS = new Set(['proj:ada', 'space-ada:ada'])

type Where = Record<string, any> // the stand-in reads only the filters this module writes
const db = {
  user: { findUnique: async ({ where }: Where) => (PEOPLE[where.id] ? { deactivatedAt: PEOPLE[where.id].deactivatedAt ?? null } : null) },
  userSettings: { findUnique: async ({ where }: Where) => (PEOPLE[where.userId]?.role ? { role: PEOPLE[where.userId].role } : null) },
  libraryMaintainer: { findUnique: async () => null },
  projectMember: { findFirst: async () => null },
  org: { findFirst: async () => ({ name: 'Fernhill' }) },
  assetVersion: {
    findFirst: async ({ where }: Where) => VERSIONS.find(v => v.digest === where.digest
      && (!where.asset.publisher || (v.asset.publisher === where.asset.publisher && v.asset.name === where.asset.name))) ?? null,
  },
  packageFile: {
    findFirst: async ({ where }: Where) => FILES.find(f => f.contentDigest === where.contentDigest && f.path === where.path) ?? null,
    findMany: async ({ where }: Where) => FILES.filter(f => f.contentDigest === where.contentDigest),
  },
  placeSkill: { findFirst: async ({ where }: Where) => PLACE_SKILLS.find(s => s.placeId === where.placeId && s.path === where.path) ?? null },
  project: {
    findUnique: async ({ where }: Where) => PROJECTS.find(p => p.id === where.id) ?? null,
    findFirst: async ({ where }: Where) => PROJECTS.find(p => p.personalOwnerId === where.personalOwnerId && p.personalSpace) ?? null,
  },
  placeSkillVersion: {
    findFirst: async ({ where }: Where) => {
      const rows = PLACE_VERSIONS.filter(v => (!where.placeSkillId || v.placeSkillId === where.placeSkillId) && (!where.digest || v.digest === where.digest)
        && (!where.placeSkill || PLACE_SKILLS.some(s => s.id === v.placeSkillId && s.placeType === where.placeSkill.placeType && s.placeId === where.placeSkill.placeId)))
      const v = rows.sort((x, y) => y.number - x.number)[0]
      return v ? { ...v, placeSkill: { path: PLACE_SKILLS.find(s => s.id === v.placeSkillId)!.path } } : null
    },
  },
} as unknown as Db
const deps = { db, sees: async (projectId: string, userId: string) => MEMBERS.has(`${projectId}:${userId}`) }

const installed: RunSkillUse = { name: 'org-review', source: 'org', fingerprint: FP('a'), identity: 'fernhill/review', version: '1.3.0' }
const inFiles: RunSkillUse = { name: 'boundary-release', source: 'boundary', fingerprint: FP('b'), placeId: 'proj', path: '.agents/skills/release' }
const own: RunSkillUse = { name: 'person-notes', source: 'person', fingerprint: FP('c'), identity: 'ada/notes', version: '1', personId: 'ada' }

describe('an installed skill @SC-1659', () => {
  it('opens for anyone in the organisation, at the version the run used, with what is newer', async () => {
    const view = await usedSkillView(deps, 'ben', installed)
    expect(view).toMatchObject({ title: 'Review code', where: 'Fernhill', version: '1.3.0', identity: 'fernhill/review', level: 'installed', openHref: '/library' })
    expect(view!.newer).toBe('The agents that have it now get 1.4.0.')
    expect(view!.kept!.files.map(f => [f.path, f.kind])).toEqual([['SKILL.md', 'markdown'], ['checklist.md', 'markdown']])
    expect(Buffer.from(view!.kept!.opened.base64, 'base64').toString()).toContain('Check errors.')
  })

  it('opens another of its files when asked, and nothing for a file it does not have', async () => {
    expect((await usedSkillView(deps, 'ben', installed, 'checklist.md'))!.kept!.opened.path).toBe('checklist.md')
    expect(await usedSkillView(deps, 'ben', installed, '../secrets')).toBeNull()
  })

  it('opens for nobody outside the organisation, or who has left it', async () => {
    expect(await usedSkillView(deps, 'outsider', installed)).toBeNull()
    expect(await usedSkillView(deps, 'gone', installed)).toBeNull()
  })

  it("is not kept when hq holds no version with what the run used, or under another identity", async () => {
    expect((await usedSkillView(deps, 'ben', { ...installed, fingerprint: FP('e') }))!.kept).toBeNull()
    expect((await usedSkillView(deps, 'ben', { ...installed, identity: 'someone/else' }))!.kept).toBeNull()
  })
})

describe("a skill in a place's files @SC-1659", () => {
  it('opens for whoever sees the place, at the version used, saying a newer one was published', async () => {
    const view = await usedSkillView(deps, 'ada', inFiles)
    expect(view).toMatchObject({ title: 'Review a release', where: 'Website rebuild', version: 'Version 3', level: 'place', newer: 'Version 4 has been published since.', openHref: null })
  })

  it('opens for nobody who does not see the place, though they are in the organisation', async () => {
    expect(await usedSkillView(deps, 'ben', inFiles)).toBeNull()
  })

  it("isn't kept when what was used was changed in files and never published, and still checks the place", async () => {
    const changed = { ...inFiles, fingerprint: FP('f') }
    expect(await usedSkillView(deps, 'ada', changed)).toMatchObject({ kept: null, version: null, fingerprint: FP('f'), title: 'release' })
    expect(await usedSkillView(deps, 'ben', changed)).toBeNull()
  })

  it('opens nothing for a place or path hq has no skill at', async () => {
    expect(await usedSkillView(deps, 'ada', { ...inFiles, placeId: 'elsewhere' })).toBeNull()
    expect(await usedSkillView(deps, 'ada', { ...inFiles, path: undefined })).toBeNull()
  })
})

describe("a person's own skill @security-M6 @SC-1659", () => {
  it('opens for that person only', async () => {
    expect(await usedSkillView(deps, 'ada', own)).toMatchObject({ title: 'My notes', where: 'Yours', level: 'yours', version: 'Version 1' })
    expect(await usedSkillView(deps, 'ben', own)).toBeNull()
  })

  it('opens only from their own records, whatever the record names as the person', async () => {
    expect(await usedSkillView(deps, 'ben', { ...own, personId: 'ben' })).toMatchObject({ kept: null })
  })

  it("isn't kept once their content is gone, leaving the identity and fingerprint", async () => {
    expect(await usedSkillView(deps, 'ada', { ...own, fingerprint: FP('9') })).toMatchObject({ kept: null, identity: 'ada/notes', fingerprint: FP('9'), title: 'notes' })
  })
})

const stepsOf = (...calls: [string, unknown][]): WorkStep[] =>
  calls.map(([tool, input]) => ({ ...toolStep(tool, input), at: '', steps: 1, items: [], toolUseIds: [] }))

describe("a run's steps @SC-1658", () => {
  const record = [installed, inFiles, { ...own, refused: 'gone' }]

  it('name each used skill as people read it and point at it, for one who may see it', async () => {
    const steps = await usedSkillSteps(deps, 'ada', stepsOf(['Skill', { skill: 'org-review' }], ['Skill', { skill: 'boundary-release' }], ['Read', { file_path: 'a.ts' }]), record)
    expect(steps).toEqual([
      { text: 'Used the skill Review code · Fernhill · 1.3.0', skill: { name: 'org-review' } },
      { text: 'Used the skill Review a release · Website rebuild · Version 3', skill: { name: 'boundary-release' } },
      { text: 'Read a.ts' },
    ])
  })

  it('stay as they were for one who may not see it, and for a skill refused or never staged', async () => {
    const steps = await usedSkillSteps(deps, 'ben', stepsOf(['Skill', { skill: 'boundary-release' }], ['Skill', { skill: 'person-notes' }], ['Skill', { skill: 'org-nothing' }]), record)
    expect(steps).toEqual([{ text: 'Used the skill boundary-release' }, { text: 'Used the skill person-notes' }, { text: 'Used the skill org-nothing' }])
  })
})
