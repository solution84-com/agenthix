/**
 * Integration tests for creating and renaming agents (ADR-0094 — real test DB).
 *
 * Scope (F-017c): SC-044 create, SC-045 edit identity, SC-178 rename collision. The agent row and its first
 * content are written for real; the dashboard notifier and feed are the shared fakes. Who may do it is
 * agentActionFloors.integration.test.ts's subject.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
import * as activity from '../../test/fakes/activity'
import { createAgent as createAgentAction, updateAgent as updateAgentAction } from '../actions'
import { readAgentContent } from '../../packages/agentPackageService'
import { contextWithRole, useTempRoots, type TempRoots } from './definitionFixtures'

let roots: TempRoots
beforeEach(async () => { roots = await useTempRoots() })
afterEach(async () => { await roots.restore() })

const adminCtx = async () => (await contextWithRole('ADMIN')).ctx

describe('createAgent @SC-044', () => {
  it('creates an agent with name, handle and role, with its first content', async () => {
    const result = await createAgentAction(
      { name: 'Scout', handle: 'scout-x', role: 'Researcher' },
      await adminCtx(),
    )

    expect(result).toMatchObject({ name: 'Scout', handle: 'scout-x', role: 'Researcher', approval: 'deferred' })
    expect(await prisma.agent.findUnique({ where: { handle: 'scout-x' } })).toMatchObject({ id: result.id })
    expect(await readAgentContent(result.id)).not.toBeNull()
  })

  it('answers 409, not 500, for a handle already taken, and creates nothing', async () => {
    await createAgent({ handle: 'taken-handle' })
    await expect(
      createAgentAction({ name: 'Scout', handle: 'taken-handle' }, await adminCtx()),
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/already exists/) })
    expect(await prisma.agent.count({ where: { handle: 'taken-handle' } })).toBe(1)
  })

  it('writes the first content as the caller, and tells the dashboard', async () => {
    const { user, ctx } = await contextWithRole('ADMIN')
    const result = await createAgentAction({ name: 'Scout', handle: 'scout-x' }, ctx)

    expect((await prisma.package.findFirst({ where: { key: result.id } }))?.updatedById).toBe(user.id)
    expect(activity.recordActivity).toHaveBeenCalledWith('agent_added', '@scout-x added', result.id)
    expect(dashboardPush.triggerSnapshotPush).toHaveBeenCalled()
  })

  it('rejects the reserved @agenthix handle with 403', async () => {
    await expect(createAgentAction({ name: 'K', handle: 'kernel' }, await adminCtx())).rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.agent.count()).toBe(0)
  })

  it.each(['Has Space', '-leading', '../escape', ''])('answers 400 for the handle %j, and creates nothing', async (handle) => {
    await expect(createAgentAction({ name: 'N', handle }, await adminCtx())).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.agent.count()).toBe(0)
  })

  it('rejects a setting with 400 naming updateAgentSettings and changes nothing', async () => {
    const agent = await createAgent({ approval: 'deferred' })
    await expect(
      updateAgentAction({ id: agent.id, approval: 'immediate' } as any, await adminCtx()),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('updateAgentSettings') })

    const stored = await prisma.agent.findUnique({ where: { id: agent.id } })
    expect(stored?.approval).toBe('deferred')
  })

  it('rejects an out-of-set approval the same way, before it would even be validated', async () => {
    const agent = await createAgent({ approval: 'deferred' })
    await expect(
      updateAgentAction({ id: agent.id, approval: 'wild' } as any, await adminCtx()),
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('updateAgentSettings') })

    const stored = await prisma.agent.findUnique({ where: { id: agent.id } })
    expect(stored?.approval).toBe('deferred')
  })
})

describe('updateAgent handle collision @SC-178', () => {
  it('rejects renaming a handle to the reserved @agenthix handle with 403', async () => {
    const agent = await createAgent({ handle: 'rename-me' })
    await expect(
      updateAgentAction({ id: agent.id, handle: 'kernel' }, await adminCtx()),
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects renaming to a handle already taken by another agent with a clean 409', async () => {
    const a = await createAgent({ handle: 'taken-handle' })
    const b = await createAgent({ handle: 'other-handle' })
    await expect(
      updateAgentAction({ id: b.id, handle: 'taken-handle' }, await adminCtx()),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: b.id } })).handle).toBe('other-handle')
    void a
  })
})

describe('updateAgent protects the built-in agent', () => {
  it('refuses to change the built-in agent\'s handle with 403, and changes nothing', async () => {
    const kernel = await createAgent({ handle: 'kernel', name: 'Kernel' })
    await expect(updateAgentAction({ id: kernel.id, handle: 'not-kernel' }, await adminCtx()))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('protected fields [handle]') })
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: kernel.id } })).handle).toBe('kernel')
  })

  it('lets the built-in agent\'s name change', async () => {
    const kernel = await createAgent({ handle: 'kernel', name: 'Kernel' })
    await updateAgentAction({ id: kernel.id, name: 'Renamed' }, await adminCtx())
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: kernel.id } })).name).toBe('Renamed')
  })
})

describe('updateAgent handle validity @SC-178', () => {
  it.each(['Has Space', '-leading', '../escape', ''])('answers 400 for the new handle %j, and changes nothing', async (handle) => {
    const agent = await createAgent({ handle: 'keeps-this' })
    await expect(updateAgentAction({ id: agent.id, handle }, await adminCtx())).rejects.toMatchObject({ statusCode: 400 })
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })).handle).toBe('keeps-this')
  })

  it('renames an agent to a valid, free handle', async () => {
    const agent = await createAgent({ handle: 'old-handle' })
    expect((await updateAgentAction({ id: agent.id, handle: 'new-handle' }, await adminCtx())).handle).toBe('new-handle')
  })
})

