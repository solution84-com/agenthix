/**
 * Integration test for importAgentZip (ADR-0035 — real test DB).
 *
 * Scope (F-025, 5b.13 — SC-180 restated): importing an agent archive creates or
 * updates the agent's identity, settings and content in place (ADR-0072). The
 * handle is the upsert key.
 *
 * The dashboard notifier and feed are the shared fakes; everything package-related
 * (Package/PackageFile) runs for real against the test database via the
 * wasp/server prisma re-export, exercising the same write path
 * createAgent/writeAgentContent use elsewhere.
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

import { importAgentZip } from '../agentZipService'
import { readAgentContent, writeAgentContent } from '../../packages/agentPackageService'
import * as dashboardPush from '../../test/fakes/debouncedPush'
import { useTempRoots, type TempRoots } from './definitionFixtures'

let roots: TempRoots
beforeEach(async () => { roots = await useTempRoots() })
afterEach(async () => { await roots.restore() })

async function makeAgentZip(record: Record<string, unknown>, files: Record<string, string> = {}): Promise<Buffer> {
  const zip = new JSZip()
  const folder = zip.folder(record.handle as string)!
  folder.file('agent.json', JSON.stringify(record))
  for (const [name, content] of Object.entries(files)) folder.file(name, content)
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('importAgentZip @SC-180', () => {
  it('creates a new handle with the archive\'s content', async () => {
    const buf = await makeAgentZip(
      { name: 'Imported', handle: 'imported-x', defaultModel: 'claude-sonnet-4-6' },
      { 'instructions.md': '# Imported' },
    )
    const result = await importAgentZip(buf, 'admin-1')

    expect(result.agentId).toEqual(expect.any(String))
    expect(result.handle).toBe('imported-x')
    expect(result.created).toBe(true)

    const persisted = await prisma.agent.findUnique({ where: { handle: 'imported-x' } })
    expect(persisted).not.toBeNull()
    expect(persisted?.defaultModel).toBe('claude-sonnet-4-6')

    const content = await readAgentContent(result.agentId)
    expect(content?.instructions).toBe('# Imported')
  })

  it('keeps every skill file from the archive in the agent\'s content', async () => {
    const buf = await makeAgentZip(
      { name: 'Skilled', handle: 'with-skills', defaultModel: 'claude-sonnet-4-6' },
      { 'skills/research/SKILL.md': '# Research skill' },
    )

    const result = await importAgentZip(buf, 'admin-1')

    const content = await readAgentContent(result.agentId)
    expect(content?.skillFiles).toEqual([{ path: 'skills/research/SKILL.md', content: Buffer.from('# Research skill') }])
  })

  it('an existing handle is updated in place', async () => {
    const existing = await createAgent({ handle: 'existing-x', name: 'Old Name' })
    const buf = await makeAgentZip(
      { name: 'New Name', handle: 'existing-x', defaultModel: 'claude-sonnet-4-6', approval: 'immediate' },
      { 'instructions.md': '# New Name' },
    )

    const result = await importAgentZip(buf, 'admin-1')
    expect(result.created).toBe(false)
    expect(result.agentId).toBe(existing.id)

    const updated = await prisma.agent.findUnique({ where: { id: existing.id } })
    expect(updated?.name).toBe('New Name')
    expect(updated?.approval).toBe('immediate')

    const content = await readAgentContent(existing.id)
    expect(content?.instructions).toBe('# New Name')
  })

  // importAgentZip validates settings before writing anything, so a validation
  // failure cannot leave the name/role update or the content applied alone.
  it('an invalid setting rejects the import and changes nothing on an existing agent (atomicity)', async () => {
    const existing = await createAgent({ handle: 'atomic-x', name: 'Old Name', role: 'Old Role' })
    const buf = await makeAgentZip({ name: 'New Name', handle: 'atomic-x', role: 'New Role', approval: 'bogus' })

    await expect(importAgentZip(buf, 'admin-1')).rejects.toThrow(/approval/i)

    const unchanged = await prisma.agent.findUnique({ where: { id: existing.id } })
    expect(unchanged?.name).toBe('Old Name')
    expect(unchanged?.role).toBe('Old Role')

    // This freshly test-seeded agent never had content written.
    expect(await readAgentContent(existing.id)).toBeNull()
  })

  // R-051: the content, settings and identity ride one transaction, so a refused rename leaves neither the
  // content write nor a dashboard push behind. A name that is not text is refused by the database layer
  // only once the transaction has already written the content.
  it('a refused rename rolls back the content written in the same import, and pushes nothing (R-051)', async () => {
    const existing = await createAgent({ handle: 'rename-x', name: 'Old Name' })
    await writeAgentContent(existing.id, { instructions: 'before', skillFiles: [] }, null)
    const buf = await makeAgentZip({ name: 42, handle: 'rename-x' }, { 'instructions.md': 'after' })

    await expect(importAgentZip(buf, 'admin-1')).rejects.toThrow()

    expect((await readAgentContent(existing.id))!.instructions).toBe('before')
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: existing.id } })).name).toBe('Old Name')
    expect(dashboardPush.triggerSnapshotPush).not.toHaveBeenCalled()
  })

  it('a new handle starts on the default runtime with the archive\'s own settings', async () => {
    const buf = await makeAgentZip({ name: 'N', handle: 'defaults-x', approval: 'immediate', allowedTools: ['Read'] })

    const result = await importAgentZip(buf, 'admin-1')

    const agent = await prisma.agent.findUniqueOrThrow({ where: { id: result.agentId } })
    expect(agent).toMatchObject({ runtime: 'claude-sdk', approval: 'immediate' })
    // An archive from before tool states carries plain names; they are read as a tool state.
    expect(agent.allowedTools).toEqual([{ name: 'Read', state: expect.any(String) }])
  })
})
