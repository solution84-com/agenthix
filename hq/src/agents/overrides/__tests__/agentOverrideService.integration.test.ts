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
  setAgentOverride, getAgentOverride, applyBoundaryOverride, runBoundary,
} from '../agentOverrideService'

const none = { model: null, approval: null, allowedTools: null, allowedBashPatterns: null }
// A boundary no longer overrides an agent's model (models from one place, part 4): `model` always reads null.

async function task(projectId: string) {
  const creator = await createUser()
  return createTestTask({ data: { title: 'T', projectId, number: 1, onBehalfOfUserId: creator.id } })
}

describe('setAgentOverride @SC-615', () => {
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

  it('applies a boundary\'s approval to the dispatched agent config, and never a model', async () => {
    const agent = await createAgent()
    await prisma.agentOverride.create({ data: { boundaryType: 'project', boundaryId: 'p1', agentId: agent.id, approval: 'immediate' } })

    expect(await applyBoundaryOverride(agentConfig(agent.id), { type: 'project', id: 'p1' }))
      .toMatchObject({ defaultModel: 'claude-opus-4-6', approval: 'immediate' })
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
