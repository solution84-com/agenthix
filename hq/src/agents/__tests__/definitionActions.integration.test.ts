/**
 * Integration tests (ADR-0094 — real test DB) for editing an agent's definition in place: updateAgentFile
 * (its instructions, package content) and updateAgentSettings (the Agent row's own columns). ADR-0072.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { updateAgentFile, updateAgentSettings } from '../definitionActions'
import { readAgentContent, writeAgentContent } from '../../packages/agentPackageService'
import { contextWithRole, contextWithoutRole, opContext } from './definitionFixtures'

async function agentWithContent(instructions = 'old') {
  const agent = await createAgent()
  const { ref } = await writeAgentContent(agent.id, {
    instructions,
    skillFiles: [{ path: 'skills/keep/SKILL.md', content: Buffer.from('k') }],
  }, null)
  return { agent, digest: ref.digest }
}

describe('updateAgentFile @SC-045 @SC-445', () => {
  it('saves the instructions in place, keeps the skills, and reports the new digest', async () => {
    const { agent, digest } = await agentWithContent()
    const { user, ctx } = await contextWithRole('ADMIN')

    const result = await updateAgentFile({ agentId: agent.id, filename: 'instructions.md', content: 'new' }, ctx)

    expect(result.changed).toBe(true)
    expect(result.digest).toMatch(/^[0-9a-f]{64}$/)
    expect(result.digest).not.toBe(digest)
    const content = (await readAgentContent(agent.id))!
    expect(content.instructions).toBe('new')
    expect(content.skillFiles.map(f => f.path)).toEqual(['skills/keep/SKILL.md'])
    expect((await prisma.package.findFirst({ where: { key: agent.id } }))?.updatedById).toBe(user.id)
  })

  it('reports no change when the instructions are the same', async () => {
    const { agent, digest } = await agentWithContent('same')
    const { ctx } = await contextWithRole('ADMIN')

    expect(await updateAgentFile({ agentId: agent.id, filename: 'instructions.md', content: 'same' }, ctx))
      .toEqual({ digest, changed: false })
  })

  it('refuses a file that is not part of an agent\'s content with 400', async () => {
    const { agent } = await agentWithContent()
    const { ctx } = await contextWithRole('ADMIN')
    await expect(updateAgentFile({ agentId: agent.id, filename: 'PROFILE.md' as any, content: 'x' }, ctx))
      .rejects.toMatchObject({ statusCode: 400 })
    expect((await readAgentContent(agent.id))!.instructions).toBe('old')
  })

  it('refuses content that is not text with 400', async () => {
    const { agent } = await agentWithContent()
    const { ctx } = await contextWithRole('ADMIN')
    await expect(updateAgentFile({ agentId: agent.id, filename: 'instructions.md', content: 5 as any }, ctx))
      .rejects.toMatchObject({ statusCode: 400 })
    expect((await readAgentContent(agent.id))!.instructions).toBe('old')
  })

  it.each([
    ['an agent with no content yet', async () => (await createAgent()).id],
    ['an agent that does not exist', async () => 'ghost'],
  ])('answers 409 for %s', async (_name, agentId) => {
    const { ctx } = await contextWithRole('ADMIN')
    await expect(updateAgentFile({ agentId: await agentId(), filename: 'instructions.md', content: 'x' }, ctx))
      .rejects.toMatchObject({ statusCode: 409 })
  })

  it.each(['MEMBER'] as const)('refuses a %s with 403 naming ADMIN, and changes nothing', async (role) => {
    const { agent } = await agentWithContent()
    const { ctx } = await contextWithRole(role)
    await expect(updateAgentFile({ agentId: agent.id, filename: 'instructions.md', content: 'x' }, ctx))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('ADMIN') })
    expect((await readAgentContent(agent.id))!.instructions).toBe('old')
  })

  it('refuses a person with no role, and a signed-out caller', async () => {
    const { agent } = await agentWithContent()
    const args = { agentId: agent.id, filename: 'instructions.md' as const, content: 'x' }
    await expect(updateAgentFile(args, (await contextWithoutRole()).ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(updateAgentFile(args, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
    expect((await readAgentContent(agent.id))!.instructions).toBe('old')
  })
})

describe('updateAgentSettings @SC-045', () => {
  it('saves the settings on the agent\'s record and writes no content', async () => {
    const agent = await createAgent()
    const { ctx } = await contextWithRole('ADMIN')

    expect(await updateAgentSettings({ agentId: agent.id, approval: 'immediate', defaultModel: 'claude-opus-4-6' }, ctx)).toEqual({ ok: true })

    expect(await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })).toMatchObject({ approval: 'immediate', defaultModel: 'claude-opus-4-6' })
    expect(await readAgentContent(agent.id)).toBeNull()
  })

  it('changes only the settings sent, and can set and clear the tool ceiling', async () => {
    const agent = await createAgent({ approval: 'immediate', defaultModel: 'claude-haiku-4-5' })
    const { ctx } = await contextWithRole('ADMIN')

    await updateAgentSettings({ agentId: agent.id, allowedTools: [{ name: 'Read', state: 'always' }] }, ctx)
    const set = await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })
    expect(set).toMatchObject({ approval: 'immediate', defaultModel: 'claude-haiku-4-5', allowedTools: [{ name: 'Read', state: 'always' }] })

    await updateAgentSettings({ agentId: agent.id, allowedTools: null }, ctx)
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })).allowedTools).toBeNull()
  })

  it('answers 404 for an agent that does not exist', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    await expect(updateAgentSettings({ agentId: 'nope', approval: 'immediate' }, ctx)).rejects.toMatchObject({ statusCode: 404 })
  })

  it.each([
    ['an unknown runtime', { runtime: 'gpt' }, /runtime/i],
    ['an invalid approval', { approval: 'bogus' }, /approval/i],
    ['a blank model', { defaultModel: '  ' }, /model/i],
    ['a model the opencode runtime does not offer', { runtime: 'opencode', defaultModel: 'no-such/model' }, /opencode/i],
  ])('answers 400 for %s, and changes nothing', async (_name, change, message) => {
    const agent = await createAgent()
    const before = await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })
    const { ctx } = await contextWithRole('ADMIN')

    await expect(updateAgentSettings({ agentId: agent.id, ...change }, ctx))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(message) })

    expect(await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })).toEqual(before)
  })

  it.each(['MEMBER'] as const)('refuses a %s with 403, and changes nothing', async (role) => {
    const agent = await createAgent()
    const { ctx } = await contextWithRole(role)
    await expect(updateAgentSettings({ agentId: agent.id, approval: 'immediate' }, ctx)).rejects.toMatchObject({ statusCode: 403 })
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })).approval).toBe('deferred')
  })

  it('refuses a person with no role, and a signed-out caller', async () => {
    const agent = await createAgent()
    await expect(updateAgentSettings({ agentId: agent.id, approval: 'immediate' }, (await contextWithoutRole()).ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(updateAgentSettings({ agentId: agent.id, approval: 'immediate' }, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })).approval).toBe('deferred')
  })
})
