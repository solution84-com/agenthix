/**
 * Integration tests (ADR-0094 — real test DB) for agent, team and task templates through the one install pipeline
 * (adr-0157, adr-0158): Agenthix's installed from hq's image at boot, built from their sources and versioned by the
 * build, without the skills they carry until first used (D14); and an upload installed as confirmed, each template's
 * skills de-duplicated by identity (I3) and said up front (I6), role skills under the template's name.
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
import { installImageTemplates } from '../imageTemplates'
import { contextWithRole, useTempRoots, writeTextFile, type TempRoots } from '../../../agents/__tests__/definitionFixtures'
import { SEVERITY, STORY, agentPackage, taskTemplatePackage, teamPackage } from './templateFixtures'
import { moveToVersion } from '../../lifecycle/pinnedVersions'
import { personActor } from '../../policyActors'

let roots: TempRoots
beforeEach(async () => { roots = await useTempRoots() })
afterEach(async () => { await roots.restore() })

const SKILL = (name: string, extra = '') => `---\nname: ${name}\ndescription: Does ${name}\n---\n\n# ${name}\n${extra}`

async function writeImage(folder: string, files: Array<{ path: string; content: Buffer }>) {
  for (const f of files) await writeTextFile(path.join(roots.assets, 'library', folder, f.path), f.content.toString('utf-8'))
}

/** An agent template from Acme, unsigned: two role skills and one shared skill with its own manifest. */
async function acmeTemplate(opts: { version?: string; shared?: string; sharedText?: string } = {}) {
  const z = new JSZip()
  const files = agentPackage('support', { roleSkills: ['triage', 'reply'], version: opts.version })
  for (const f of files) {
    z.file(`support/${f.path}`, f.path === 'package.json' ? f.content.toString().replace('"agenthix"', '"acme"') : f.content)
  }
  z.file('support/skills/faq/package.json', JSON.stringify({ format: 2, kind: 'skill', publisher: 'acme', name: 'faq', version: opts.shared ?? '1.0.0', description: 'Answers' }))
  z.file('support/skills/faq/SKILL.md', SKILL('faq', opts.sharedText))
  return { from: 'upload' as const, zip: (await z.generateAsync({ type: 'nodebuffer' })).toString('base64') }
}

async function install(args: Awaited<ReturnType<typeof acmeTemplate>>, ctx: unknown) {
  const preview = await previewAssetInstall(args, ctx as never)
  const result = await installAsset({ ...args, confirm: { fingerprint: preview.fingerprint, unsignedRead: true } }, ctx as never)
  return { preview, result }
}

describe("Agenthix's templates from hq's image, at boot @SC-1635", () => {
  it('installs each as agenthix/<name> without what it carries, and a second boot changes nothing (D14)', async () => {
    await writeImage('agents/qa', agentPackage('qa', { roleSkills: ['check-work'] }))
    await writeImage('task-templates/kanban', taskTemplatePackage('kanban'))
    await writeImage('agents/kernel', agentPackage('kernel'))

    const first = await installImageTemplates(prisma)
    expect(first.map(t => [t.identity, t.outcome, t.problem])).toEqual([['agenthix/qa', 'new', null], ['agenthix/kanban', 'new', null]])
    const assets = await prisma.asset.findMany({ select: { kind: true, publisher: true, name: true, currentVersionId: true, builtIn: true, givenToAll: true }, orderBy: { name: 'asc' } })
    expect(assets.map(a => [a.kind, `${a.publisher}/${a.name}`, a.builtIn, a.givenToAll])).toEqual([
      ['TASK_TEMPLATE', 'agenthix/kanban', false, false], ['AGENT', 'agenthix/qa', false, false],
    ])
    expect(assets.every(a => a.currentVersionId !== null)).toBe(true)
    expect(await prisma.assetVersion.findFirstOrThrow({ where: { asset: { name: 'qa' } } })).toMatchObject({ source: 'BUILT_IN', byId: null, version: '1.0.0' })

    const second = await installImageTemplates(prisma)
    expect(second.map(t => t.outcome)).toEqual(['same', 'same'])
    expect(await prisma.assetVersion.count()).toBe(2)
  })

  it("builds a team template's shared skills from the shelf, and installs none of them at boot", async () => {
    await writeImage('skills/dev-code-review', [{ path: 'SKILL.md', content: Buffer.from(SKILL('dev-code-review')) }])
    await writeImage('teams/crew', teamPackage('crew', { agents: [{ handle: 'lead', skills: ['dev-code-review'] }] }))

    expect((await installImageTemplates(prisma)).map(t => [t.identity, t.outcome, t.problem])).toEqual([['agenthix/crew', 'new', null]])
    expect(await prisma.asset.findMany({ select: { kind: true, name: true } })).toEqual([{ kind: 'TEAM', name: 'crew' }])
    const version = await prisma.assetVersion.findFirstOrThrow({ where: { asset: { name: 'crew' } } })
    const { readContent } = await import('../../content')
    expect((await readContent(version.digest, prisma)).map(f => f.path)).toContain('skills/dev-code-review/package.json')
  })

  it('reports a template that names a skill no source has, and installs nothing of it', async () => {
    await writeImage('teams/crew', teamPackage('crew', { agents: [{ handle: 'lead', skills: ['made-up'] }] }))
    const [outcome] = await installImageTemplates(prisma)
    expect(outcome).toMatchObject({ root: 'crew', outcome: 'refused', problem: expect.stringMatching(/made-up, which no source has/) })
    expect(await prisma.asset.count()).toBe(0)
  })

  it('offers a template whose content changed in a new image as an update, never pinning it, and numbers it itself', async () => {
    await writeImage('task-templates/kanban', taskTemplatePackage('kanban'))
    await installImageTemplates(prisma)
    // New content under the same hand-written version: the build gives it the next major version.
    await writeImage('task-templates/kanban', taskTemplatePackage('kanban', { types: [STORY], fields: [SEVERITY] }))
    expect((await installImageTemplates(prisma)).map(t => t.outcome)).toEqual(['update'])
    const asset = await prisma.asset.findFirstOrThrow({ where: { name: 'kanban' }, include: { currentVersion: true, versions: true } })
    expect(asset.currentVersion?.version).toBe('1.0.0')
    expect(asset.versions.map(v => v.version).sort()).toEqual(['1.0.0', '2.0.0'])
    // The same content again is the version that holds it: nothing new.
    expect((await installImageTemplates(prisma)).map(t => t.outcome)).toEqual(['update'])
    expect(await prisma.assetVersion.count({ where: { assetId: asset.id } })).toBe(2)
  })

  it('takes the offered version when someone accepts it, and rolls back the same way a skill does (V2)', async () => {
    await writeImage('task-templates/kanban', taskTemplatePackage('kanban'))
    await installImageTemplates(prisma)
    // New content with a version written by hand: the build keeps it, since it is newer.
    await writeImage('task-templates/kanban', taskTemplatePackage('kanban', { types: [STORY], fields: [SEVERITY] }, '1.1.0'))
    await installImageTemplates(prisma)
    const { user } = await contextWithRole('ADMIN')
    const actor = await personActor(user.id, prisma)
    const asset = await prisma.asset.findFirstOrThrow({ where: { name: 'kanban' }, include: { versions: true } })
    const newer = asset.versions.find(v => v.version === '1.1.0')!
    await expect(moveToVersion(prisma, actor, 'update', { assetId: asset.id, versionId: newer.id })).resolves.toMatchObject({ version: '1.1.0' })
    const older = asset.versions.find(v => v.version === '1.0.0')!
    await expect(moveToVersion(prisma, actor, 'rollBack', { assetId: asset.id, versionId: older.id })).resolves.toMatchObject({ version: '1.0.0' })
  })

  it('reports an image package that fails its checks, and installs nothing of it', async () => {
    await writeImage('task-templates/broken', taskTemplatePackage('broken', { types: [{ ...STORY, columns: STORY.columns.slice(0, 2) }] }))
    const [outcome] = await installImageTemplates(prisma)
    expect(outcome).toMatchObject({ identity: 'agenthix/broken', outcome: 'refused', problem: expect.stringMatching(/In progress needs at least one column/) })
    expect(await prisma.asset.count()).toBe(0)
  })
})

describe('an uploaded template @SC-1636', () => {
  it('says what comes with it, then installs it with its skills under the signer, role skills under its name', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const { preview, result } = await install(await acmeTemplate(), ctx)
    expect(preview.summary).toBe('This agent template brings 3 skills: 2 for its role, 1 new.')
    expect(result).toMatchObject({ identity: 'unsigned/support', outcome: 'new' })
    const names = (await prisma.asset.findMany({ select: { kind: true, publisher: true, name: true } })).map(a => `${a.kind} ${a.publisher}/${a.name}`).sort()
    expect(names).toEqual(['AGENT unsigned/support', 'SKILL unsigned/faq', 'SKILL unsigned/support/reply', 'SKILL unsigned/support/triage'])
  })

  it('reuses a shared skill already here at its version, and offers a newer one as an update without pinning it', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    await install(await acmeTemplate(), ctx)
    const faq = await prisma.asset.findFirstOrThrow({ where: { name: 'faq' } })

    const newer = await install(await acmeTemplate({ version: '1.1.0', shared: '1.2.0', sharedText: 'More.\n' }), ctx)
    expect(newer.preview.summary).toBe('This agent template brings 3 skills: 2 for its role, 1 newer than yours, update offered.')
    expect(newer.result.outcome).toBe('update')
    const after = await prisma.asset.findUniqueOrThrow({ where: { id: faq.id }, include: { currentVersion: true, versions: true } })
    expect(after.currentVersion?.version).toBe('1.0.0')
    expect(after.versions.map(v => v.version).sort()).toEqual(['1.0.0', '1.2.0'])
  })

  it('refuses a task template that carries skills, and installs nothing', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const z = new JSZip()
    for (const f of taskTemplatePackage('release')) z.file(`release/${f.path}`, f.path === 'package.json' ? f.content.toString().replace('"agenthix"', '"acme"') : f.content)
    z.file('release/skills/x/SKILL.md', SKILL('x'))
    const args = { from: 'upload' as const, zip: (await z.generateAsync({ type: 'nodebuffer' })).toString('base64') }
    const preview = await previewAssetInstall(args, ctx)
    expect(preview.refusal).toMatch(/carries no skills/)
    await expect(installAsset({ ...args, confirm: { fingerprint: preview.fingerprint, unsignedRead: true } }, ctx)).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.asset.count()).toBe(0)
  })

  it('refuses a template claiming Agenthix without its signature', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const z = new JSZip()
    for (const f of agentPackage('qa')) z.file(`qa/${f.path}`, f.content)
    const preview = await previewAssetInstall({ from: 'upload', zip: (await z.generateAsync({ type: 'nodebuffer' })).toString('base64') }, ctx)
    expect(preview.refusal).toMatch(/Agenthix didn't sign it/)
  })
})
