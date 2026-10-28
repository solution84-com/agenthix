import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { prisma } from '../../test/db'

// The org's package against the real test DB (ADR-0094), reading hq's real bundled assets.

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { changeOrgPackage, ensureOrgPackage, prepareOrgPackage, renderOrgFile, ORG_FILE } from '../orgPackageService'
import { getCurrentPackage, readCurrentFiles } from '../packageStore'
import { replaceSkill } from '../skillFiles'

const realAssets = path.resolve(__dirname, '../../../assets')
const saved = process.env.HQ_ASSETS_ROOT
beforeEach(() => { process.env.HQ_ASSETS_ROOT = realAssets })
afterEach(() => { if (saved === undefined) delete process.env.HQ_ASSETS_ROOT; else process.env.HQ_ASSETS_ROOT = saved })

const text = (files: Array<{ path: string; content: Buffer }> | null, p: string) => files?.find(f => f.path === p)?.content.toString()
const makeOrg = (data: Record<string, unknown> = {}) => prisma.org.create({ data: { name: 'Acme', vision: 'Ship', mission: 'Daily', ...data } as any })

describe('org package', () => {
  it('writes nothing before an org exists', async () => {
    expect(await changeOrgPackage(f => f, 'u1')).toBeNull()
    expect(await prisma.package.count()).toBe(0)
  })

  it("first content: ORG.md from the org row over the template body, and no skill: a new organisation installs none by itself", async () => {
    const org = await makeOrg()

    await ensureOrgPackage()

    expect(await getCurrentPackage('org', org.id)).toMatchObject({ updatedById: null })
    const files = await readCurrentFiles('org', org.id)
    expect(text(files, ORG_FILE)).toMatch(/^---\nname: Acme\nvision: Ship\nmission: Daily\n---\n\n## About\n\n_Add any additional context about your organisation here. This file/)
    expect(files?.map(f => f.path)).toEqual([ORG_FILE])
    expect(await prisma.asset.count()).toBe(0)
  })

  it('does nothing at boot once the org has content', async () => {
    const org = await makeOrg()
    await ensureOrgPackage()
    const before = await getCurrentPackage('org', org.id)
    expect(await ensureOrgPackage()).toBeNull()
    expect(await getCurrentPackage('org', org.id)).toEqual(before)
  })

  it('a later change keeps the previous body and re-renders the org fields', async () => {
    const org = await makeOrg()
    await changeOrgPackage(() => [{ path: ORG_FILE, content: Buffer.from(renderOrgFile(org, '## About\n\nWe build rockets.\n')) }], null, undefined, [])
    await prisma.org.update({ where: { id: org.id }, data: { name: 'Acme Ltd' } })

    await changeOrgPackage(files => replaceSkill(files, 'review', [{ path: 'SKILL.md', content: Buffer.from('r') }]), 'u1')

    const files = await readCurrentFiles('org', org.id)
    expect(text(files, ORG_FILE)).toBe(renderOrgFile({ ...org, name: 'Acme Ltd' }, '## About\n\nWe build rockets.\n'))
    expect(text(files, 'skills/review/SKILL.md')).toBe('r')
    expect((await getCurrentPackage('org', org.id))?.updatedById).toBe('u1')
  })
})

// A first-ever write's disk reads must happen before a caller opens its transaction (a long interactive
// transaction risks Prisma's timeout). prepareOrgPackage is what a transactional caller calls first;
// changeOrgPackage then takes its result as `initialFiles`.
describe('prepareOrgPackage — disk reads done before a transaction opens', () => {
  it('reads the initial files when the org exists but has no content yet', async () => {
    await makeOrg()
    const files = await prepareOrgPackage()
    expect(files?.map(f => f.path)).toEqual([ORG_FILE])
    expect(text(files, ORG_FILE)).toContain('This file is read by agents')
  })

  it('reads the initial files when the org row does not exist yet (its first-ever creation)', async () => {
    const files = await prepareOrgPackage()
    expect(text(files, ORG_FILE)).toBeDefined()
  })

  it('reads nothing when the org already has content', async () => {
    await makeOrg()
    await ensureOrgPackage()
    expect(await prepareOrgPackage()).toBeNull()
  })

  it('changeOrgPackage given prepareOrgPackage\'s result writes that content without reading the disk again', async () => {
    const org = await makeOrg()
    const initialFiles = await prepareOrgPackage()

    // With the assets gone, only the prepared files can supply the template's body.
    process.env.HQ_ASSETS_ROOT = path.join(os.tmpdir(), 'no-such-hq-assets')
    await changeOrgPackage(files => files, 'u1', undefined, initialFiles ?? undefined)

    const files = await readCurrentFiles('org', org.id)
    expect(text(files, ORG_FILE)).toContain('This file is read by agents')
    expect(files?.map(f => f.path)).toEqual([ORG_FILE])
  })
})
