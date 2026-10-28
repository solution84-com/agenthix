import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { prisma } from '../../test/db'

// The org's package against the real test DB (ADR-0094), reading hq's real bundled assets (or an empty temp
// root where a test needs the library skills directory missing).

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

  it("first content: ORG.md from the org row over the template body, and every skill on Agenthix's shelf copied in", async () => {
    const org = await makeOrg()

    await ensureOrgPackage()

    expect(await getCurrentPackage('org', org.id)).toMatchObject({ updatedById: null })
    const files = await readCurrentFiles('org', org.id)
    expect(text(files, ORG_FILE)).toMatch(/^---\nname: Acme\nvision: Ship\nmission: Daily\n---\n\n## About/)
    expect(text(files, 'skills/qa-test-planning/SKILL.md')).toContain('slug: qa-test-planning')
    expect(text(files, 'skills/qa-test-planning/SKILL.md')).toContain('installed_from: agenthix/qa-test-planning')
    expect(await prisma.asset.count()).toBe(0)
  })

  it('refuses a first write when hq\'s library skills directory is missing, naming the path and HQ_ASSETS_ROOT', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-assets-'))
    process.env.HQ_ASSETS_ROOT = root
    try {
      const org = await makeOrg()
      const err = await ensureOrgPackage().catch(e => e)
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toContain(path.join(root, 'library', 'skills'))
      expect(err.message).toContain('HQ_ASSETS_ROOT')
      expect(await getCurrentPackage('org', org.id)).toBeNull()

      await fs.mkdir(path.join(root, 'library', 'skills'), { recursive: true })
      await ensureOrgPackage()
      expect(await getCurrentPackage('org', org.id)).not.toBeNull()
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('copies no shelf folder that is not a skill, and still writes the org file', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-assets-'))
    process.env.HQ_ASSETS_ROOT = root
    try {
      await fs.mkdir(path.join(root, 'library', 'skills', 'ghost'), { recursive: true })
      const org = await makeOrg()
      await ensureOrgPackage()
      expect((await readCurrentFiles('org', org.id))?.map(f => f.path)).toEqual([ORG_FILE])
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
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
    expect(files).not.toBeNull()
    expect(text(files, 'skills/qa-test-planning/SKILL.md')).toContain('slug: qa-test-planning')
    expect(text(files, 'skills/qa-test-planning/SKILL.md')).toContain('installed_from: agenthix/qa-test-planning')
    expect(await prisma.asset.count()).toBe(0)
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

    // With the assets gone, only the prepared files can supply the skill.
    process.env.HQ_ASSETS_ROOT = path.join(os.tmpdir(), 'no-such-hq-assets')
    await changeOrgPackage(files => files, 'u1', undefined, initialFiles ?? undefined)

    const files = await readCurrentFiles('org', org.id)
    expect(text(files, 'skills/qa-test-planning/SKILL.md')).toContain('slug: qa-test-planning')
    expect(text(files, 'skills/qa-test-planning/SKILL.md')).toContain('installed_from: agenthix/qa-test-planning')
    expect(await prisma.asset.count()).toBe(0)
  })
})
