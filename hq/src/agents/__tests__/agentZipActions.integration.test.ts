/**
 * Integration tests (ADR-0094 — real test DB) for the archive actions: exportAgent and importAgent, an
 * organisation admin's (R-195). The archive's parsing and size limits are in agentZipParse.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import JSZip from 'jszip'
import { prisma } from '../../test/db'
import { createAgent } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))

import * as dashboardPush from '../../test/fakes/debouncedPush'
import { exportAgent, importAgent } from '../agentZipActions'
import { readAgentContent, writeAgentContent } from '../../packages/agentPackageService'
import { contextWithRole, contextWithoutRole, opContext, useTempRoots, type TempRoots } from './definitionFixtures'

let roots: TempRoots
beforeEach(async () => { roots = await useTempRoots() })
afterEach(async () => { await roots.restore() })

async function archive(record: Record<string, unknown>, files: Record<string, string> = {}): Promise<string> {
  const zip = new JSZip()
  const folder = zip.folder(record.handle as string)!
  folder.file('agent.json', JSON.stringify(record))
  for (const [name, content] of Object.entries(files)) folder.file(name, content)
  return (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64')
}

describe('exportAgent @SC-679', () => {
  it('exports the current definition: settings from the record, content from the package', async () => {
    await prisma.org.create({ data: { name: 'Acme' } })
    const agent = await createAgent({ name: 'Scout', handle: 'scout-x', role: 'Researcher', approval: 'immediate' })
    await writeAgentContent(agent.id, { instructions: 'I', skillFiles: [{ path: 'skills/x/SKILL.md', content: Buffer.from('x') }] }, null)
    const { ctx } = await contextWithRole('ADMIN')

    const { base64, filename } = await exportAgent({ agentId: agent.id }, ctx)

    expect(filename).toBe('scout-x.zip')
    const zip = await JSZip.loadAsync(Buffer.from(base64, 'base64'))
    const record = JSON.parse(await zip.file('scout-x/agent.json')!.async('string'))
    expect(record).toMatchObject({ name: 'Scout', handle: 'scout-x', role: 'Researcher', approval: 'immediate' })
    expect(record.defaultModel).toBeUndefined()
    expect(await zip.file('scout-x/instructions.md')!.async('string')).toBe('I')
    expect(await zip.file('scout-x/skills/x/SKILL.md')!.async('string')).toBe('x')
  })

  it('is refused by the import here, which sends it to the Library, and changes nothing', async () => {
    await prisma.org.create({ data: { name: 'Acme' } })
    const agent = await createAgent({ name: 'Round', handle: 'round-trip', approval: 'immediate' })
    await writeAgentContent(agent.id, { instructions: 'keep', skillFiles: [] }, null)
    const { ctx } = await contextWithRole('ADMIN')
    const { base64 } = await exportAgent({ agentId: agent.id }, ctx)
    await writeAgentContent(agent.id, { instructions: 'edited since', skillFiles: [] }, null)

    await expect(importAgent({ base64 }, ctx)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('install it in the Library') })
    expect((await readAgentContent(agent.id))!.instructions).toBe('edited since')
  })

  it('needs the organisation, whose name it is published under', async () => {
    const agent = await createAgent({ name: 'Early', handle: 'early' })
    await writeAgentContent(agent.id, { instructions: 'I', skillFiles: [] }, null)
    const { ctx } = await contextWithRole('ADMIN')
    await expect(exportAgent({ agentId: agent.id }, ctx)).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('Create the organisation first') })
  })

  it.each([
    ['an agent that does not exist', async () => 'ghost', /not found/],
    ['an agent with no instructions yet', async () => (await createAgent()).id, /no instructions/],
  ])('fails for %s', async (_name, agentId, message) => {
    const { ctx } = await contextWithRole('ADMIN')
    await expect(exportAgent({ agentId: await agentId() }, ctx)).rejects.toThrow(message)
  })

  it.each(['MEMBER'] as const)('refuses a %s with 403 naming ADMIN', async (role) => {
    const agent = await createAgent()
    await writeAgentContent(agent.id, { instructions: 'I', skillFiles: [] }, null)
    const { ctx } = await contextWithRole(role)
    await expect(exportAgent({ agentId: agent.id }, ctx)).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('ADMIN') })
  })

  it('refuses a person with no role, and a signed-out caller', async () => {
    const agent = await createAgent()
    await expect(exportAgent({ agentId: agent.id }, (await contextWithoutRole()).ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(exportAgent({ agentId: agent.id }, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('importAgent @SC-680', () => {
  it('creates an agent from a new handle, writing as the caller', async () => {
    const { user, ctx } = await contextWithRole('ADMIN')
    const base64 = await archive(
      { name: 'Imported', handle: 'imported-x', role: 'Tester', defaultModel: 'claude-sonnet-4-6', approval: 'immediate' },
      { 'instructions.md': '# Imported', 'skills/research/SKILL.md': '# Research' },
    )

    const result = await importAgent({ base64 }, ctx)

    expect(result).toEqual({ agentId: expect.any(String), handle: 'imported-x', created: true })
    expect(await prisma.agent.findUniqueOrThrow({ where: { id: result.agentId } })).toMatchObject({
      name: 'Imported', role: 'Tester', approval: 'immediate',
    })
    const content = (await readAgentContent(result.agentId))!
    expect(content.instructions).toBe('# Imported')
    expect(content.skillFiles.map(f => f.path)).toEqual(['skills/research/SKILL.md'])
    expect((await prisma.package.findFirst({ where: { key: result.agentId } }))?.updatedById).toBe(user.id)
  })

  it('replaces an existing handle\'s identity, settings and content in place, and tells the dashboard', async () => {
    const existing = await createAgent({ handle: 'existing-x', name: 'Old Name', approval: 'deferred' })
    await writeAgentContent(existing.id, { instructions: 'old', skillFiles: [{ path: 'skills/gone/SKILL.md', content: Buffer.from('g') }] }, null)
    const { ctx } = await contextWithRole('ADMIN')
    const base64 = await archive({ name: 'New Name', handle: 'existing-x', approval: 'immediate' }, { 'instructions.md': '# New' })

    const result = await importAgent({ base64 }, ctx)

    expect(result).toEqual({ agentId: existing.id, handle: 'existing-x', created: false })
    expect(await prisma.agent.count()).toBe(1)
    expect(await prisma.agent.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({ name: 'New Name', approval: 'immediate' })
    expect(await readAgentContent(existing.id)).toEqual({ instructions: '# New', skillFiles: [] })
    expect(dashboardPush.triggerSnapshotPush).toHaveBeenCalled()
  })

  it('reads an older archive that carries PROFILE.md and RESPONSIBILITIES.md as merged instructions', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    const base64 = await archive({ name: 'Old', handle: 'old-format' }, { 'PROFILE.md': '---\nname: x\n---\nProfile body', 'RESPONSIBILITIES.md': 'Duties' })

    const { agentId } = await importAgent({ base64 }, ctx)

    expect((await readAgentContent(agentId))!.instructions).toBe('Profile body\n\nDuties\n')
  })

  it.each([
    ['an invalid setting', { name: 'N', handle: 'bad-setting', approval: 'bogus' }, /approval/i],
  ])('answers 400 for %s, and creates nothing', async (_name, record, message) => {
    const { ctx } = await contextWithRole('ADMIN')
    await expect(importAgent({ base64: await archive(record) }, ctx))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(message) })
    expect(await prisma.agent.count()).toBe(0)
  })

  it('answers 400 for an invalid setting on an existing handle, and changes nothing of it', async () => {
    const existing = await createAgent({ handle: 'atomic-x', name: 'Old Name', role: 'Old Role' })
    const { ctx } = await contextWithRole('ADMIN')
    const base64 = await archive({ name: 'New Name', handle: 'atomic-x', role: 'New Role', approval: 'bogus' }, { 'instructions.md': 'new' })

    await expect(importAgent({ base64 }, ctx)).rejects.toMatchObject({ statusCode: 400 })

    expect(await prisma.agent.findUniqueOrThrow({ where: { id: existing.id } })).toMatchObject({ name: 'Old Name', role: 'Old Role' })
    expect(await readAgentContent(existing.id)).toBeNull()
  })

  it.each([
    ['a handle that is not valid', { name: 'N', handle: 'Bad Handle!' }],
    ['a handle that climbs out of its folder', { name: 'N', handle: '../escape' }],
  ])('answers 400 for %s, and creates nothing', async (_name, record) => {
    const { ctx } = await contextWithRole('ADMIN')
    const zip = new JSZip()
    zip.file('root/agent.json', JSON.stringify(record))
    const base64 = (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64')
    await expect(importAgent({ base64 }, ctx)).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.agent.count()).toBe(0)
  })

  it.each([
    ['an archive with no agent.json', { 'scout/instructions.md': 'x' }, /agent\.json not found/],
    ['a skill path that escapes the archive', { 'scout/agent.json': '{"name":"S","handle":"scout"}', 'scout/skills/../../evil.md': 'x' }, /unsafe path/],
  ])('answers 400 for %s, and creates nothing', async (_name, files, message) => {
    const { ctx } = await contextWithRole('ADMIN')
    const zip = new JSZip()
    for (const [name, content] of Object.entries(files)) zip.file(name, content)
    const base64 = (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64')
    await expect(importAgent({ base64 }, ctx)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(message) })
    expect(await prisma.agent.count()).toBe(0)
  })

  it('fails for bytes that are not an archive, and creates nothing', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    await expect(importAgent({ base64: Buffer.from('not a zip').toString('base64') }, ctx)).rejects.toThrow()
    expect(await prisma.agent.count()).toBe(0)
  })

  it.each(['MEMBER'] as const)('refuses a %s with 403 naming ADMIN, and imports nothing', async (role) => {
    const { ctx } = await contextWithRole(role)
    await expect(importAgent({ base64: await archive({ name: 'N', handle: 'nope' }) }, ctx))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('ADMIN') })
    expect(await prisma.agent.count()).toBe(0)
  })

  it('refuses a person with no role, and a signed-out caller', async () => {
    const base64 = await archive({ name: 'N', handle: 'nope' })
    await expect(importAgent({ base64 }, (await contextWithoutRole()).ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(importAgent({ base64 }, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
    expect(await prisma.agent.count()).toBe(0)
  })
})

describe('an agent export is an agent template package @SC-679', () => {
  it('carries package.json (format 2) beside agent.json: the organisation as publisher, a version from when it was made', async () => {
    await prisma.org.create({ data: { name: 'Acme' } })
    const agent = await createAgent({ name: 'Scout', handle: 'scout-pkg', role: 'Researcher' })
    await writeAgentContent(agent.id, { instructions: 'I', skillFiles: [] }, null)
    const { ctx } = await contextWithRole('ADMIN')

    const { base64 } = await exportAgent({ agentId: agent.id }, ctx)

    const zip = await JSZip.loadAsync(Buffer.from(base64, 'base64'))
    expect(JSON.parse(await zip.file('scout-pkg/package.json')!.async('string'))).toEqual({
      format: 2, kind: 'agent', publisher: 'acme', name: 'scout-pkg', version: expect.stringMatching(/^1\.\d{8}\.\d+$/), description: 'Researcher',
    })
  })

  it('refuses a package of another kind, which belongs in the Library', async () => {
    const zip = new JSZip()
    zip.folder('kanban')!.file('package.json', JSON.stringify({ format: 1, kind: 'board', name: 'Kanban', source: 'made_here', version: '1' }))
    zip.folder('kanban')!.file('board.json', '{}')
    const base64 = (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64')
    const { ctx } = await contextWithRole('ADMIN')

    await expect(importAgent({ base64 }, ctx)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('install it in the Library') })
  })
})
