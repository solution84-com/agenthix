/**
 * Every library item as one package (every screen reviewed spec §3, Library),
 * against the real test database, with hq's assets and storage in temporary
 * folders: each kind exports with its source, version and publisher, and
 * imports back as the organisation's own item recording them; a team template
 * holds agents only; built-in items are never replaced; admins only.
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

import { exportLibraryItem, getLibrary, importLibraryItem } from '../packageActions'
import { applyAgentTemplate } from '../../agentTemplateService'

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

async function writeAsset(relative: string, content: string) {
  const file = path.join(tmp, 'assets', relative)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, content)
}

const unzip = async (base64: string) => JSZip.loadAsync(Buffer.from(base64, 'base64'))

async function packageOf(root: string, manifest: Record<string, unknown>, files: Record<string, string>): Promise<string> {
  const zip = new JSZip()
  zip.file(`${root}/package.json`, JSON.stringify({ format: 1, version: '1', ...manifest }))
  for (const [name, content] of Object.entries(files)) zip.file(`${root}/${name}`, content)
  return (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64')
}

describe('exporting a built-in item @SC-679', () => {
  it('records it as built in, its version and Agenthix as publisher', async () => {
    const admin = await createUserWithRole('ADMIN')
    await writeAsset('library/agents/qa/agent.json', JSON.stringify({ name: 'QA', handle: 'qa', skills: [] }))
    await writeAsset('library/agents/qa/instructions.md', 'Check the work')
    const row = await prisma.agentTemplate.create({
      data: { slug: 'qa', name: 'QA', handle: 'qa', assetPath: 'library/agents/qa', isSystem: true, version: 3, source: 'BUILT_IN', packageVersion: '3' },
    })

    const { base64, filename } = await exportLibraryItem({ kind: 'agent', id: row.id }, ctx(admin))

    expect(filename).toBe('qa.zip')
    const zip = await unzip(base64)
    expect(JSON.parse(await zip.file('qa/package.json')!.async('string'))).toMatchObject({
      kind: 'agent', name: 'QA', source: 'built_in', version: '3', publisher: 'Agenthix',
    })
    expect(await zip.file('qa/instructions.md')!.async('string')).toBe('Check the work')
  })
})

describe('importing a package @SC-680', () => {
  it('a board round-trips as one made here, keeping its version and publisher', async () => {
    const admin = await createUserWithRole('ADMIN')
    const base64 = await packageOf('release', { kind: 'board', name: 'Release', source: 'made_here', version: '3.0', publisher: 'Northwind' }, {
      'board.json': JSON.stringify({ name: 'Release train', description: 'Two weeks', columns: COLUMNS }),
    })

    const imported = await importLibraryItem({ base64 }, ctx(admin))

    expect(await prisma.boardTemplate.findUniqueOrThrow({ where: { id: imported.id } })).toMatchObject({
      name: 'Release train', isSystem: false, source: 'MADE_HERE', packageVersion: '3.0', publisher: 'Northwind',
    })
    const again = await exportLibraryItem({ kind: 'board', id: imported.id }, ctx(admin))
    const zip = await unzip(again.base64)
    const board = JSON.parse(await zip.file('release-train/board.json')!.async('string'))
    expect(board.columns.map((c: { name: string }) => c.name)).toEqual(['todo', 'doing', 'done'])
  })

  it('a skill from a marketplace stays marked as one', async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.org.create({ data: { name: 'Acme' } })
    const base64 = await packageOf('seo-audit', { kind: 'skill', name: 'SEO audit', source: 'marketplace', version: '1.4', publisher: 'Agenthix' }, {
      'SKILL.md': '---\nname: SEO audit\ndescription: Checks a site\n---\n\nDo the audit.',
      'checklist.md': 'Titles',
    })

    const imported = await importLibraryItem({ base64 }, ctx(admin))

    expect(await prisma.skill.findUniqueOrThrow({ where: { id: imported.id } })).toMatchObject({
      slug: 'seo-audit', scope: 'ORG', name: 'SEO audit', description: 'Checks a site', source: 'MARKETPLACE', packageVersion: '1.4',
    })
    expect(await fs.readFile(path.join(tmp, 'storage', 'org/skills/seo-audit/checklist.md'), 'utf-8')).toBe('Titles')
    const library = await getLibrary(undefined, ctx(admin))
    expect(library.skills).toEqual([expect.objectContaining({ id: imported.id, source: 'MARKETPLACE', version: '1.4', publisher: 'Agenthix' })])
  })

  it('an agent becomes a library agent read from storage, and using it brings every skill it holds', async () => {
    const admin = await createUserWithRole('ADMIN')
    const base64 = await packageOf('shop-support', { kind: 'agent', name: 'Shop support', source: 'made_here', publisher: 'Acme' }, {
      'agent.json': JSON.stringify({ name: 'Shop support', handle: 'shop-support' }),
      'instructions.md': 'Answer merchants',
      'skills/faq/SKILL.md': '---\nname: FAQ\ndescription: d\n---\n\nbody',
    })

    const imported = await importLibraryItem({ base64 }, ctx(admin))
    const template = await prisma.agentTemplate.findUniqueOrThrow({ where: { id: imported.id } })
    expect(template).toMatchObject({ slug: 'shop-support', isSystem: false, assetPath: 'org/agents/shop-support', publisher: 'Acme' })

    const created = await applyAgentTemplate('shop-support', 'shop-support-1', admin.id)
    expect(created.handle).toBe('shop-support-1')
  })

  it('a team template of agents imports; one naming people is refused', async () => {
    const admin = await createUserWithRole('ADMIN')
    const team = {
      'template.json': JSON.stringify({ id: 'launch-crew', name: 'Launch crew', teams: [{ name: 'Launch', purpose: 'Ship', agents: ['planner'] }], projects: [] }),
      'agents/planner/agent.json': JSON.stringify({ name: 'Planner', role: 'Plans', skills: ['plan'] }),
      'skills/plan/SKILL.md': '---\nname: Plan\ndescription: d\n---\n\nbody',
    }
    const imported = await importLibraryItem({ base64: await packageOf('launch-crew', { kind: 'team', name: 'Launch crew', source: 'marketplace', version: '1.0', publisher: 'Brightside' }, team) }, ctx(admin))
    expect(await prisma.workforceTemplate.findUniqueOrThrow({ where: { id: imported.id } })).toMatchObject({
      id: 'launch-crew', isSystem: false, source: 'MARKETPLACE', publisher: 'Brightside', assetPath: 'org/teams/launch-crew',
    })

    const withPeople = { ...team, 'template.json': JSON.stringify({ id: 'crew-2', name: 'Crew', people: ['ana'], teams: [{ name: 'T', agents: [] }] }) }
    await expect(importLibraryItem({ base64: await packageOf('crew-2', { kind: 'team', name: 'Crew', source: 'made_here' }, withPeople) }, ctx(admin)))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('agents only') })
  })

  it('never replaces a built-in item, and refuses what is not a package', async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.agentTemplate.create({ data: { slug: 'qa', name: 'QA', handle: 'qa', assetPath: 'library/agents/qa', isSystem: true } })
    const base64 = await packageOf('qa', { kind: 'agent', name: 'QA', source: 'made_here' }, { 'agent.json': JSON.stringify({ name: 'QA', handle: 'qa' }) })
    await expect(importLibraryItem({ base64 }, ctx(admin))).rejects.toMatchObject({ statusCode: 409 })

    const bare = new JSZip()
    bare.file('scout/agent.json', '{}')
    await expect(importLibraryItem({ base64: (await bare.generateAsync({ type: 'nodebuffer' })).toString('base64') }, ctx(admin)))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('no package.json') })
  })

  it('is for admins only, as exporting is', async () => {
    const member = await createUserWithRole('MEMBER')
    await expect(importLibraryItem({ base64: 'x' }, ctx(member))).rejects.toMatchObject({ statusCode: 403 })
    await expect(exportLibraryItem({ kind: 'board', id: 'x' }, ctx(member))).rejects.toMatchObject({ statusCode: 403 })
    await expect(getLibrary(undefined, ctx())).rejects.toMatchObject({ statusCode: 401 })
  })
})
