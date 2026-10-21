/**
 * Integration tests for deleting an agent (ADR-0094 — real test DB): SC-052 delete and clear history, and
 * what only the agent row named — its package and its memory. Who may do it is
 * agentActionFloors.integration.test.ts's subject.
 *
 * The agent, its sessions, packages and memory are real; the site that holds its runs is the shared
 * siteRuntimeStore fake, and the dashboard notifier and feed are the shared fakes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createAgent, createSession, ensureExecutionSite } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { deleteAgent as deleteAgentAction } from '../actions'
import { writePackage } from '../../packages/packageStore'
import * as siteStore from '../../test/fakes/siteRuntimeStore'
import { contextWithRole } from './definitionFixtures'

beforeEach(async () => {
  await ensureExecutionSite()
  siteStore.removeAgentDirectory.mockResolvedValue({ removed: false })
})

const adminCtx = async () => (await contextWithRole('ADMIN')).ctx

describe('deleteAgent @SC-052', () => {
  // plan 5d-2 task 10: run/transcript/tool-call history lives on site now —
  // this asserts the site-first delete forwards (siteStore.deleteSessionsBy,
  // siteStore.stopAgent) instead of seeding a real AgentRun row (that model no
  // longer exists in hq's schema).
  it('deletes the agent and cascades its sessions (clears session + run history via site)', async () => {
    const agent = await createAgent({ handle: 'to-delete' })
    const session = await createSession({ agentId: agent.id })

    await deleteAgentAction({ id: agent.id }, await adminCtx())

    expect(await prisma.agent.findUnique({ where: { id: agent.id } })).toBeNull()
    expect(await prisma.agentSession.findUnique({ where: { id: session.id } })).toBeNull()
    expect(siteStore.deleteSessionsBy).toHaveBeenCalledWith(expect.any(String), { agentId: agent.id })
    expect(siteStore.stopAgent).toHaveBeenCalledWith(expect.any(String), agent.handle)
  })

  it('refuses to delete the built-in agent with 403, and deletes nothing', async () => {
    const kernel = await createAgent({ handle: 'kernel' })
    await createSession({ agentId: kernel.id })
    await expect(
      deleteAgentAction({ id: kernel.id }, await adminCtx()),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.agent.count()).toBe(1)
    expect(await prisma.agentSession.count()).toBe(1)
    expect(siteStore.deleteSessionsBy).not.toHaveBeenCalled()
  })

  it('answers 404 for an agent that does not exist', async () => {
    await expect(deleteAgentAction({ id: 'ghost' }, await adminCtx())).rejects.toMatchObject({ statusCode: 404 })
  })

  it('deletes an agent that has never had a session without asking any site', async () => {
    const agent = await createAgent({ handle: 'never-ran' })

    await deleteAgentAction({ id: agent.id }, await adminCtx())

    expect(await prisma.agent.findUnique({ where: { id: agent.id } })).toBeNull()
    expect(siteStore.deleteSessionsBy).not.toHaveBeenCalled()
  })

  it('does not fail the delete when the site cannot be told afterwards', async () => {
    const agent = await createAgent({ handle: 'site-down' })
    await createSession({ agentId: agent.id })
    siteStore.stopAgent.mockRejectedValue(new Error('site unreachable'))

    await deleteAgentAction({ id: agent.id }, await adminCtx())

    expect(await prisma.agent.findUnique({ where: { id: agent.id } })).toBeNull()
  })
})

// An agent's content is its package, and the package table carries no foreign
// key back to the Agent row, so nothing in the database removes it for us.
describe('deleteAgent takes what only the agent row named @SC-052', () => {
  async function writeContent(agentId: string) {
    await writePackage({
      kind: 'agent',
      key: agentId,
      updatedById: null,
      files: [
        { path: 'instructions.md', content: Buffer.from('first', 'utf-8') },
        { path: 'skills/a/SKILL.md', content: Buffer.from('second', 'utf-8') },
      ],
    })
  }

  async function packageRows(agentId: string) {
    const pkg = await prisma.package.findUnique({
      where: { kind_key: { kind: 'AGENT', key: agentId } },
      select: { digest: true },
    })
    if (!pkg) return { packages: 0, files: 0 }
    return { packages: 1, files: await prisma.packageFile.count({ where: { contentDigest: pkg.digest } }) }
  }

  // Its content is released, not deleted: a run that already started may still
  // need it, and the content sweep removes it after its grace period.
  it('removes the agent\'s package', async () => {
    const agent = await createAgent()
    const bystander = await createAgent()
    await writeContent(agent.id)
    await writeContent(bystander.id)

    // Anchor: there is something here to orphan. Without it the assertion
    // below would pass against a table that was empty all along.
    expect(await packageRows(agent.id)).toEqual({ packages: 1, files: 2 })

    await deleteAgentAction({ id: agent.id }, await adminCtx())

    expect(await packageRows(agent.id)).toEqual({ packages: 0, files: 0 })
    expect(await packageRows(bystander.id)).toEqual({ packages: 1, files: 2 })
  })

  it('removes the agent\'s memory items, and leaves another agent\'s alone', async () => {
    const user = await createUser()
    const agent = await createAgent()
    const bystander = await createAgent()
    const item = (agentId: string, key: string) => ({
      scope: 'AGENT_PERSON' as const, scopeKey: `agent-person:${agentId}:${user.id}`, key, userId: user.id, agentId,
      title: key, body: `${key} is what the person asked for.`, kind: 'PREFERENCE' as const,
    })
    await prisma.memoryItem.create({ data: item(agent.id, 'works-late') })
    await prisma.memoryItem.create({ data: item(bystander.id, 'short-answers') })

    await deleteAgentAction({ id: agent.id }, await adminCtx())

    expect(await prisma.memoryItem.count({ where: { agentId: agent.id } })).toBe(0)
    expect(await prisma.memoryItem.count({ where: { agentId: bystander.id } })).toBe(1)
  })
})

// R-195 / SC-389 / SC-390: shaping an agent is the organisation admin's. A
// viewer or an operator can rename it or delete it
