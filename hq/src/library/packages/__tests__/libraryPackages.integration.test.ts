/**
 * Every library item as one package (every screen reviewed spec §3, Library),
 * against the real test database, with hq's assets and storage in temporary
 * folders: skills and every kind of template are assets, exported as their
 * pinned version and imported through the install check (adr-0157, adr-0158),
 * team templates too, which hold agents only; admins only.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import JSZip from 'jszip'
import { prisma } from '../../../test/db'
import { createUserWithRole } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../../server/dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../../server/dashboard/activity', () => import('../../../test/fakes/activity'))

import { exportLibraryItem, getLibrary } from '../packageActions'
import { agentPackage, boardPackage, seedSkill, seedTemplate, teamPackage } from '../../../assets/templates/__tests__/templateFixtures'

const ctx = (user?: { id: string }) => ({ user }) as any
const COLUMNS = [
  { name: 'todo', label: 'To Do', status: 'TODO', color: '#6b7280', order: 0, description: '' },
  { name: 'doing', label: 'Doing', status: 'IN_PROGRESS', color: '#f59e0b', order: 1, description: '' },
  { name: 'done', label: 'Done', status: 'DONE', color: '#10b981', order: 2, description: '' },
]

let tmp: string
const prev = { assets: process.env.HQ_ASSETS_ROOT, storage: process.env.HQ_STORAGE_ROOT }
beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'library-packages-'))
  process.env.HQ_ASSETS_ROOT = path.join(tmp, 'assets')
  process.env.HQ_STORAGE_ROOT = path.join(tmp, 'storage')
})
afterAll(async () => {
  for (const [key, value] of [['HQ_ASSETS_ROOT', prev.assets], ['HQ_STORAGE_ROOT', prev.storage]] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await fs.rm(tmp, { recursive: true, force: true })
})

const unzip = async (base64: string) => JSZip.loadAsync(Buffer.from(base64, 'base64'))

async function packageOf(root: string, manifest: Record<string, unknown>, files: Record<string, string>): Promise<string> {
  const zip = new JSZip()
  zip.file(`${root}/package.json`, JSON.stringify({ format: 1, version: '1', ...manifest }))
  for (const [name, content] of Object.entries(files)) zip.file(`${root}/${name}`, content)
  return (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64')
}

describe('exporting a built-in item @SC-679', () => {
  it('is its pinned version, its own manifest kept byte for byte', async () => {
    const admin = await createUserWithRole('ADMIN')
    const files = agentPackage('qa', { roleSkills: ['check-work'] })
    const { assetId } = await seedTemplate(prisma, 'AGENT', 'qa', files)

    const { base64, filename } = await exportLibraryItem({ kind: 'agent', id: assetId }, ctx(admin))

    expect(filename).toBe('qa.zip')
    const zip = await unzip(base64)
    expect(await zip.file('qa/package.json')!.async('string')).toBe(files[0].content.toString('utf-8'))
    expect(await zip.file('qa/instructions.md')!.async('string')).toContain('Do the qa work.')
    expect(zip.file('qa/skills/check-work/SKILL.md')).not.toBeNull()
  })
})

describe('a package of the Library @SC-680', () => {
  it('a skill made here exports as an asset package under its publisher and version', async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.org.create({ data: { name: 'Fernhill' } })
    const { createNewSkill } = await import('../../../assets/lifecycle/draftStore')
    const { publishDraft } = await import('../../../assets/lifecycle/publish')
    const { personActor } = await import('../../../assets/policyActors')
    const actor = await personActor(admin.id, prisma)
    const draft = await createNewSkill(prisma as any, actor, { name: 'release-notes', description: 'Writes notes' })
    await publishDraft(prisma as any, actor, { assetId: draft.assetId, revision: draft.revision, note: 'First version' })
    const made = { id: draft.assetId }

    const { base64, filename } = await exportLibraryItem({ kind: 'skill', id: made.id }, ctx(admin))

    expect(filename).toBe('release-notes.zip')
    const zip = await unzip(base64)
    expect(JSON.parse(await zip.file('release-notes/package.json')!.async('string'))).toEqual({
      format: 2, kind: 'skill', publisher: 'fernhill', name: 'release-notes', version: '1.0.0', description: 'Writes notes',
    })
    const library = await getLibrary(undefined, ctx(admin))
    expect(library.skills).toEqual([expect.objectContaining({ id: made.id, source: 'MADE_HERE', version: '1.0.0', publisher: 'fernhill' })])
  })

  it("lists Agenthix's templates as built in, and leaves a template's role skills out of the skills", async () => {
    const admin = await createUserWithRole('ADMIN')
    await seedTemplate(prisma, 'AGENT', 'qa', agentPackage('qa'))
    await seedTemplate(prisma, 'BOARD', 'kanban', boardPackage('kanban'))
    await seedSkill(prisma, 'qa/check-work', 'acme')
    const library = await getLibrary(undefined, ctx(admin))
    expect(library.agents).toEqual([expect.objectContaining({ name: 'The qa', source: 'BUILT_IN', version: '1.0.0', publisher: 'Agenthix' })])
    expect(library.boards).toEqual([expect.objectContaining({ name: 'kanban board', source: 'BUILT_IN' })])
    expect(library.skills.some(s => s.name.includes('check-work'))).toBe(false)
  })

  it('a team template installs from an upload with its skills', async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.org.create({ data: { name: 'Acme' } })
    const files = teamPackage('launch-crew', { agents: [{ handle: 'planner', skills: ['plan', 'dev-code-quality'] }], roleSkills: ['plan'], shared: [{ name: 'dev-code-quality' }], publisher: 'northwind' })
    const zip = new JSZip()
    for (const f of files) zip.file(`launch-crew/${f.path}`, f.content)
    const base64 = (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64')

    const { installAsset, previewAssetInstall } = await import('../../../assets/operations')
    const preview = await previewAssetInstall({ from: 'upload', zip: base64 }, ctx(admin))
    expect(preview).toMatchObject({ kind: 'team', refusal: null, summary: 'This team template brings 2 skills: 1 for its role, 1 new.' })
    await installAsset({ from: 'upload', zip: base64, confirm: { fingerprint: preview.fingerprint, unsignedRead: true } }, ctx(admin))
    const names = (await prisma.asset.findMany({ select: { kind: true, publisher: true, name: true }, orderBy: { name: 'asc' } })).map(a => `${a.kind} ${a.publisher}/${a.name}`)
    expect(names).toEqual(['SKILL unsigned/dev-code-quality', 'TEAM unsigned/launch-crew', 'SKILL unsigned/launch-crew/plan'])
    const library = await getLibrary(undefined, ctx(admin))
    expect(library.teams).toEqual([expect.objectContaining({ name: 'The launch-crew', source: 'MARKETPLACE', publisher: 'unsigned' })])
  })

  it('a team template naming people is refused', async () => {
    const admin = await createUserWithRole('ADMIN')
    const files = teamPackage('crew', { agents: [{ handle: 'a' }] }).map(f => f.path === 'team.json'
      ? { ...f, content: Buffer.from(JSON.stringify({ name: 'Crew', people: ['ana'], teams: [{ name: 'T', agents: ['a'] }] })) }
      : f.path === 'package.json' ? { ...f, content: Buffer.from(f.content.toString().replace('"agenthix"', '"northwind"')) } : f)
    const { previewAssetInstall } = await import('../../../assets/operations')
    const zip = new JSZip()
    for (const f of files) zip.file(`crew/${f.path}`, f.content)
    const preview = await previewAssetInstall({ from: 'upload', zip: (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64') }, ctx(admin))
    expect(preview.refusal).toContain('agents only')
  })

  it('exports a team template as its pinned version, with its skills inside', async () => {
    const admin = await createUserWithRole('ADMIN')
    const files = teamPackage('crew', { agents: [{ handle: 'a', skills: ['dev-code-quality'] }], shared: [{ name: 'dev-code-quality' }] })
    const { assetId } = await seedTemplate(prisma, 'TEAM', 'crew', files)
    const { base64, filename } = await exportLibraryItem({ kind: 'team', id: assetId }, ctx(admin))
    expect(filename).toBe('crew.zip')
    const zip = await unzip(base64)
    expect(Object.keys(zip.files).filter(n => !n.endsWith('/')).sort()).toEqual(files.map(f => `crew/${f.path}`).sort())
  })

  it('exporting is for admins only', async () => {
    const member = await createUserWithRole('MEMBER')
    await expect(exportLibraryItem({ kind: 'board', id: 'x' }, ctx(member))).rejects.toMatchObject({ statusCode: 403 })
    await expect(getLibrary(undefined, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})
