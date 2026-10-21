/**
 * Integration tests (ADR-0094 — real test DB) for the override service's reads and writes: the boundary a
 * run acts in, the stored override, and applying it to a dispatched agent. The narrowing rules themselves
 * are pure and are in agentOverrideService.test.ts.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createProject, createUser, createTestTask } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import {
  setAgentOverride, getAgentOverride, applyBoundaryOverride, runBoundary, OverrideValidationError,
} from '../agentOverrideService'

const none = { model: null, approval: null, allowedTools: null, allowedBashPatterns: null }

async function task(projectId: string) {
  const creator = await createUser()
  return createTestTask({ data: { title: 'T', projectId, number: 1, onBehalfOfUserId: creator.id } })
}

describe('setAgentOverride @SC-615', () => {
  it('refuses a model that costs more than the agent\'s current model, and stores nothing', async () => {
    const agent = await createAgent({ defaultModel: 'claude-sonnet-4-6', runtime: 'claude-sdk' })
    const user = await createUser()

    await expect(setAgentOverride({ type: 'project', id: 'p1' }, agent.id, { ...none, model: 'claude-opus-4-6' }, user.id))
      .rejects.toThrow(OverrideValidationError)
    expect(await prisma.agentOverride.count()).toBe(0)

    await setAgentOverride({ type: 'project', id: 'p1' }, agent.id, { ...none, model: 'claude-haiku-4-5' }, user.id)
    expect((await getAgentOverride({ type: 'project', id: 'p1' }, agent.id))?.model).toBe('claude-haiku-4-5')
  })

  it('lets an approval-only edit resubmit the stored model, even once the agent\'s model became cheaper', async () => {
    const agent = await createAgent({ defaultModel: 'claude-sonnet-4-6', runtime: 'claude-sdk' })
    const user = await createUser()
    await prisma.agentOverride.create({ data: { boundaryType: 'project', boundaryId: 'p1', agentId: agent.id, model: 'claude-opus-4-6' } })

    await setAgentOverride({ type: 'project', id: 'p1' }, agent.id, { ...none, model: 'claude-opus-4-6', approval: 'immediate' }, user.id)

    expect(await getAgentOverride({ type: 'project', id: 'p1' }, agent.id)).toEqual({ ...none, model: 'claude-opus-4-6', approval: 'immediate' })
  })

  it('still refuses a pricier model that differs from the one stored', async () => {
    const agent = await createAgent({ defaultModel: 'claude-sonnet-4-6', runtime: 'claude-sdk' })
    const user = await createUser()
    await prisma.agentOverride.create({ data: { boundaryType: 'project', boundaryId: 'p1', agentId: agent.id, model: 'claude-haiku-4-5' } })

    await expect(setAgentOverride({ type: 'project', id: 'p1' }, agent.id, { ...none, model: 'claude-opus-4-6' }, user.id))
      .rejects.toThrow(OverrideValidationError)

    expect((await getAgentOverride({ type: 'project', id: 'p1' }, agent.id))?.model).toBe('claude-haiku-4-5')
  })

  it('refuses a model on an agent whose runtime offers no such model, and still accepts an approval-only override', async () => {
    const agent = await createAgent({ defaultModel: 'anthropic/claude-opus-4-8', runtime: 'opencode' })
    const user = await createUser()

    await expect(setAgentOverride({ type: 'user', id: user.id }, agent.id, { ...none, model: 'claude-haiku-4-5' }, user.id))
      .rejects.toThrow(/runtime/)
    expect(await prisma.agentOverride.count()).toBe(0)

    await setAgentOverride({ type: 'user', id: user.id }, agent.id, { ...none, approval: 'immediate' }, user.id)
    expect(await prisma.agentOverride.count()).toBe(1)
  })

  it('refuses a model override for an agent that does not exist', async () => {
    const user = await createUser()
    await expect(setAgentOverride({ type: 'user', id: user.id }, 'ghost', { ...none, model: 'claude-haiku-4-5' }, user.id))
      .rejects.toThrow(/Agent not found/)
  })

  it('removes the stored row when every field is cleared', async () => {
    const agent = await createAgent()
    const user = await createUser()
    await prisma.agentOverride.create({ data: { boundaryType: 'project', boundaryId: 'p1', agentId: agent.id, approval: 'immediate' } })
    await prisma.agentOverride.create({ data: { boundaryType: 'project', boundaryId: 'p2', agentId: agent.id, approval: 'immediate' } })

    expect(await setAgentOverride({ type: 'project', id: 'p1' }, agent.id, none, user.id)).toBeNull()

    expect((await prisma.agentOverride.findMany()).map(r => r.boundaryId)).toEqual(['p2'])
  })
})

describe('applyBoundaryOverride @SC-614', () => {
  const agentConfig = (id: string, approval = 'bypassed') => ({
    id, defaultModel: 'claude-opus-4-6', runtime: 'claude-sdk', approval,
    allowedTools: [{ name: 'read_file', state: 'always' }, { name: 'write_file', state: 'always' }], allowedBashPatterns: null,
  }) as any

  it('applies a boundary\'s model and approval to the dispatched agent config', async () => {
    const agent = await createAgent()
    await prisma.agentOverride.create({ data: { boundaryType: 'project', boundaryId: 'p1', agentId: agent.id, model: 'claude-haiku-4-5', approval: 'immediate' } })

    expect(await applyBoundaryOverride(agentConfig(agent.id), { type: 'project', id: 'p1' }))
      .toMatchObject({ defaultModel: 'claude-haiku-4-5', approval: 'immediate' })
  })

  it('makes approval only stricter: a project\'s immediate over the organisation\'s deferred, never a bypassed over its immediate', async () => {
    const agent = await createAgent()
    await prisma.agentOverride.create({ data: { boundaryType: 'project', boundaryId: 'p1', agentId: agent.id, approval: 'immediate' } })
    await prisma.agentOverride.create({ data: { boundaryType: 'project', boundaryId: 'p2', agentId: agent.id, approval: 'bypassed' } })

    expect((await applyBoundaryOverride(agentConfig(agent.id, 'deferred'), { type: 'project', id: 'p1' })).approval).toBe('immediate')
    expect((await applyBoundaryOverride(agentConfig(agent.id, 'immediate'), { type: 'project', id: 'p2' })).approval).toBe('immediate')
  })

  it('dispatches the run\'s effective tools, so its approved tools are built from what the boundary allows', async () => {
    const agent = await createAgent()
    await prisma.agentOverride.create({ data: {
      boundaryType: 'project', boundaryId: 'p1', agentId: agent.id,
      allowedTools: [{ name: 'write_file', state: 'ask' }], allowedBashPatterns: [{ pattern: 'rm', state: 'never' }],
    } })

    const config = await applyBoundaryOverride(agentConfig(agent.id, 'deferred'), { type: 'project', id: 'p1' })
    const tools = config.allowedTools as Array<{ name: string; state: string }>
    expect(tools.find(t => t.name === 'write_file')?.state).toBe('ask')
    expect(tools.find(t => t.name === 'read_file')?.state).toBe('always')
    expect(config.allowedBashPatterns).toEqual([{ pattern: 'rm', state: 'never' }])
  })

  it('leaves the agent as it is with no boundary, or no override in this one', async () => {
    const agent = await createAgent()
    await prisma.agentOverride.create({ data: { boundaryType: 'project', boundaryId: 'p1', agentId: agent.id, approval: 'immediate' } })
    const config = agentConfig(agent.id)

    expect(await applyBoundaryOverride(config, null)).toBe(config)
    expect(await applyBoundaryOverride(config, { type: 'project', id: 'p2' })).toBe(config)
    expect(await applyBoundaryOverride(config, { type: 'user', id: 'p1' })).toBe(config)
  })
})

describe('runBoundary @SC-614', () => {
  it('acts in the task\'s current project, not the project the session stored', async () => {
    const project = await createProject()
    const t = await task(project.id)
    const session = { primaryWorkspaceId: null, taskId: t.id, userId: 'u1', sessionType: 'task', primaryOwnerType: 'project' as const, primaryOwnerId: 'p-stale' }

    expect(await runBoundary(session)).toEqual({ type: 'project', id: project.id })
    expect(await runBoundary({ ...session, sessionType: 'chat' })).toEqual({ type: 'project', id: project.id })
  })

  it('acts as the person for a task in their personal project, whatever the session row says', async () => {
    const person = await createUser()
    const project = await createProject({ personalOwnerId: person.id })
    const t = await task(project.id)
    const session = { primaryWorkspaceId: null, taskId: t.id, userId: person.id, sessionType: 'task', primaryOwnerType: 'project' as const, primaryOwnerId: project.id }

    expect(await runBoundary(session)).toEqual({ type: 'user', id: person.id })
  })

  it('has no boundary when the task the session names no longer exists', async () => {
    const gone = { primaryWorkspaceId: null, taskId: 'gone', userId: 'u1' }
    expect(await runBoundary({ ...gone, sessionType: 'chat', primaryOwnerType: 'user', primaryOwnerId: 'u1' })).toBeNull()
    expect(await runBoundary({ ...gone, sessionType: 'task', primaryOwnerType: 'project', primaryOwnerId: 'p-stale' })).toBeNull()
  })

  it('takes a project chat\'s project and a personal chat\'s person, with no task involved', async () => {
    const base = { primaryWorkspaceId: null, taskId: null, userId: 'u1' }
    expect(await runBoundary({ ...base, sessionType: 'chat', primaryOwnerType: 'project', primaryOwnerId: 'p1' })).toEqual({ type: 'project', id: 'p1' })
    expect(await runBoundary({ ...base, sessionType: 'chat', primaryOwnerType: null, primaryOwnerId: null })).toEqual({ type: 'user', id: 'u1' })
  })
})
