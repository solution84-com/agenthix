import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent } from '../../test/factories'

// An agent's content and settings against the real test DB (ADR-0094): content is the agent's package, settings
// are the Agent row's own columns, and neither write touches the other.

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import {
  updateAgentSettings, writeAgentContent, readAgentContent, changeAgentContent, AgentContentMissingError,
} from '../agentPackageService'
import { getCurrentPackage } from '../packageStore'

describe('agent settings', () => {
  it('a settings edit updates the Agent row in place and writes no package', async () => {
    const agent = await createAgent({ approval: 'deferred' })
    await updateAgentSettings(agent.id, { approval: 'immediate' })
    const row = await prisma.agent.findUnique({ where: { id: agent.id } })
    expect(row).toMatchObject({ approval: 'immediate' })
    expect(await prisma.package.count()).toBe(0)
  })

  it('refuses an invalid settings edit before writing anything', async () => {
    const agent = await createAgent({ approval: 'deferred' })
    await expect(updateAgentSettings(agent.id, { approval: 'yolo' })).rejects.toThrow(/approval/)
    expect((await prisma.agent.findUnique({ where: { id: agent.id } }))?.approval).toBe('deferred')
  })
})

describe('agent content', () => {
  it('writes content as the agent package, and never touches the Agent row', async () => {
    const agent = await createAgent({ approval: 'immediate' })
    const before = await prisma.agent.findUnique({ where: { id: agent.id } })
    const { changed } = await writeAgentContent(agent.id, { instructions: 'I', skillFiles: [] }, 'u1')
    expect(changed).toBe(true)
    expect(await getCurrentPackage('agent', agent.id)).toMatchObject({ updatedById: 'u1' })
    expect(await readAgentContent(agent.id)).toEqual({ instructions: 'I', skillFiles: [] })
    expect(await prisma.agent.findUnique({ where: { id: agent.id } })).toEqual(before)
  })

  it('reads no content for an agent that has none', async () => {
    expect(await readAgentContent('nobody')).toBeNull()
  })

  it('applies a change to the current content, and refuses an agent with none', async () => {
    const agent = await createAgent()
    await writeAgentContent(agent.id, { instructions: 'old', skillFiles: [{ path: 'skills/a/SKILL.md', content: Buffer.from('s') }] }, 'u1')
    await changeAgentContent(agent.id, c => ({ ...c, instructions: 'new' }), 'u2')
    const content = await readAgentContent(agent.id)
    expect(content?.instructions).toBe('new')
    expect(content?.skillFiles.map(f => f.path)).toEqual(['skills/a/SKILL.md'])
    expect((await getCurrentPackage('agent', agent.id))?.updatedById).toBe('u2')

    await expect(changeAgentContent('nobody', c => c, 'u1')).rejects.toBeInstanceOf(AgentContentMissingError)
    expect(await getCurrentPackage('agent', 'nobody')).toBeNull()
    const bare = await createAgent({ name: 'Scout' })
    await expect(changeAgentContent(bare.id, c => c, 'u1')).rejects.toThrow(/^"Scout" has no instructions yet/)
  })

  it('refuses a skill file outside skills/ and stores nothing', async () => {
    const agent = await createAgent()
    await expect(writeAgentContent(agent.id, { instructions: 'I', skillFiles: [{ path: 'evil.md', content: Buffer.from('') }] }, null))
      .rejects.toThrow(/skills\//)
    expect(await getCurrentPackage('agent', agent.id)).toBeNull()
  })
})
