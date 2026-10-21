/**
 * Integration tests (ADR-0094 — real test DB): an agent's handle names its credential home on a site's
 * disk (spec §4.27), so every way an agent is created or renamed refuses an invalid one before anything is
 * written, and a rename or delete never touches a directory — the site derives its own path.
 *
 * "Touches no disk" is observed on a temporary tree that also holds a sibling the handle tries to reach
 * (`escape/`), compared before and after. The handle's own rules are pure and are in
 * agentHandleValidation.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import JSZip from 'jszip'
import path from 'node:path'
import { prisma } from '../../test/db'
import { createAgent as seedAgent, createSession, createProject, ensureExecutionSite } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import {
  createAgent as createAgentRecord,
  updateAgent as updateAgentRecord,
  deleteAgent as deleteAgentRecord,
} from '../agentService'
import { createAgent, updateAgent } from '../actions'
import { createAgentOp } from '../../server/controlplane/agentOps'
import { importAgentZip } from '../agentZipService'
import { applyAgentTemplate } from '../../library/agentTemplateService'
import { applyTemplate } from '../../library/workforceTemplateService'
import * as siteStore from '../../test/fakes/siteRuntimeStore'
import { contextWithRole, snapshotTree, useTempRoots, writeTextFile, type TempRoots } from './definitionFixtures'
import type { CallerContext } from '../../server/controlplane/types'
import { claims } from '../../server/controlplane/__tests__/controlPlaneFixtures'

/** An ADMIN's own Chat: a run's authority is the person it is for, read from the database (adr-0101). */
async function adminChat(): Promise<CallerContext> {
  const { user } = await contextWithRole('ADMIN')
  const agent = await seedAgent()
  const session = await prisma.agentSession.create({ data: { userId: user.id, agentId: agent.id, sessionType: 'chat' } })
  return { kind: 'run', claims: claims({ userId: user.id, role: 'ADMIN', projectId: null, taskId: null, sessionId: session.id, agentId: agent.id, runner: { kind: 'person', userId: user.id } }) }
}

const BAD_HANDLES = ['../../escape', '..', '.', '', 'a/b', 'a\\b', 'Scout', 'has space', '-lead', '_lead', 'x'.repeat(65)]

let sandbox: TempRoots
const tree = () => snapshotTree(sandbox.root)
const adminCtx = async () => (await contextWithRole('ADMIN')).ctx

beforeEach(async () => {
  sandbox = await useTempRoots()
  // What an upgraded install still has under an agent's own directory on a site's disk; a rename must leave it where it is.
  await writeTextFile(path.join(sandbox.root, 'site/agents/scout/home/.claude/.credentials.json'), '{"claudeAiOauth":{"expiresAt":1}}')
  await writeTextFile(path.join(sandbox.root, 'escape/keep.md'), 'outside')
  await ensureExecutionSite()
  siteStore.removeAgentDirectory.mockResolvedValue({ removed: false })
})
afterEach(async () => { await sandbox.restore() })

describe('creating an agent refuses an invalid handle before touching disk', () => {
  it.each(BAD_HANDLES)('agentService.createAgent refuses %j with 400', async (handle) => {
    const before = await tree()
    await expect(createAgentRecord({ name: 'X', handle })).rejects.toMatchObject({ statusCode: 400 })
    expect(await tree()).toEqual(before)
    expect(await prisma.agent.count()).toBe(0)
  })

  it('the createAgent action answers 400', async () => {
    const before = await tree()
    await expect(createAgent({ name: 'X', handle: '../../escape' }, await adminCtx())).rejects.toMatchObject({ statusCode: 400 })
    expect(await tree()).toEqual(before)
    expect(await prisma.agent.count()).toBe(0)
  })

  it('create_agent answers invalid', async () => {
    const chat = await adminChat()
    const before = await tree()
    await expect(
      createAgentOp(chat, { name: 'X', role: 'r', responsibilities: 'x', handle: '../../escape' }),
    ).rejects.toMatchObject({ code: 'invalid' })
    expect(await tree()).toEqual(before)
    // Only the chat's own agent.
    expect(await prisma.agent.count()).toBe(1)
  })

  it.each([
    ['no agent holds the handle', false],
    ['an agent row already holds the handle', true],
  ])('importAgent refuses the handle an archive names when %s', async (_label, held) => {
    if (held) await seedAgent({ handle: '../../escape', name: 'Legacy' })
    const zip = new JSZip()
    const folder = zip.folder('bundle')!
    folder.file('agent.json', JSON.stringify({ name: 'Evil', handle: '../../escape' }))
    folder.file('PROFILE.md', 'pwned')
    folder.folder('skills')!.folder('notes')!.file('SKILL.md', 'pwned')
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    const before = await tree()
    const agentsBefore = await prisma.agent.findMany()
    await expect(importAgentZip(buffer, null)).rejects.toMatchObject({ statusCode: 400 })
    expect(await tree()).toEqual(before)
    expect(await prisma.agent.findMany()).toEqual(agentsBefore)
  })

  it('applyAgentTemplate refuses the handle it is given', async () => {
    await writeTextFile(path.join(sandbox.assets, 'library/agents/dev/agent.json'), JSON.stringify({ name: 'Dev', role: 'Dev', skills: [] }))
    await prisma.agentTemplate.create({ data: { slug: 'dev', name: 'Dev', version: 1, handle: 'dev', assetPath: 'library/agents/dev', isSystem: true } as any })
    const before = await tree()
    await expect(applyAgentTemplate('dev', '../../escape', null)).rejects.toMatchObject({ statusCode: 400 })
    expect(await tree()).toEqual(before)
    expect(await prisma.agent.count()).toBe(0)
  })

  it('applyWorkforceTemplate refuses a resolved handle', async () => {
    const content = {
      teams: [{
        name: 'Eng',
        purpose: 'Build',
        agents: [{
          handle: 'dev', name: 'Dev', role: 'Dev', responsibilities: 'Code',
          skills: [{ slug: 'notes', name: 'Notes', description: 'd', content: 'body' }],
        }],
      }],
      projects: [],
    }
    const selections = {
      teams: [{
        name: 'Eng',
        include: true,
        agents: [{ handle: 'dev', resolvedHandle: '../../escape', include: true, skills: [{ slug: 'notes', include: true }] }],
      }],
      projects: [],
    }
    const before = await tree()
    await expect(applyTemplate(content as any, selections as any, null)).rejects.toMatchObject({ statusCode: 400 })
    expect(await tree()).toEqual(before)
    expect(await prisma.agent.count()).toBe(0)
  })

  it('a valid handle still creates the agent', async () => {
    const agent = await createAgentRecord({ name: 'Scout X', handle: 'scout-x' })
    expect(agent.handle).toBe('scout-x')
    expect(await prisma.agent.count()).toBe(1)
  })
})

describe('renaming an agent', () => {
  it.each(BAD_HANDLES)('agentService.updateAgent refuses %j with 400 and moves nothing', async (handle) => {
    const agent = await seedAgent({ handle: 'scout', name: 'Scout' })
    const before = await tree()
    await expect(updateAgentRecord({ id: agent.id, handle })).rejects.toMatchObject({ statusCode: 400 })
    expect(await tree()).toEqual(before)
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })).handle).toBe('scout')
  })

  it('the updateAgent action answers 400', async () => {
    const agent = await seedAgent({ handle: 'scout', name: 'Scout' })
    const before = await tree()
    await expect(updateAgent({ id: agent.id, handle: '../../escape' }, await adminCtx())).rejects.toMatchObject({ statusCode: 400 })
    expect(await tree()).toEqual(before)
  })

  it.each([
    ['names its own directory', 'scout'],
    ['names no single directory at all', '../../escape'],
  ])('renames an agent whose stored handle %s without touching any directory', async (_label, oldHandle) => {
    const agent = await seedAgent({ handle: oldHandle, name: 'Scout' })
    const before = await tree()

    const updated = await updateAgentRecord({ id: agent.id, handle: 'scout-2' })

    expect(updated.handle).toBe('scout-2')
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })).handle).toBe('scout-2')
    expect(await tree()).toEqual(before)
  })

  // No container binds that directory any more, and the rule is unchanged for the same reason it was made:
  // a rename touches the row, never the disk, and asks no site to stop anything.
  it('leaves a running container alone — nothing under the old handle moves, and no site is asked to stop it', async () => {
    const agent = await seedAgent({ handle: 'scout', name: 'Scout' })
    await createSession({ agentId: agent.id })

    await updateAgentRecord({ id: agent.id, handle: 'scout-2' })

    expect(await tree()).toHaveProperty(['site/agents/scout/home/.claude/.credentials.json'], '{"claudeAiOauth":{"expiresAt":1}}')
    expect(siteStore.stopAgent).not.toHaveBeenCalled()
  })

  it('an unchanged handle that predates the rule is not re-checked', async () => {
    const agent = await seedAgent({ handle: 'Legacy Bot', name: 'Legacy' })
    await updateAgentRecord({ id: agent.id, handle: 'Legacy Bot', name: 'Renamed' })
    expect(await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })).toMatchObject({ handle: 'Legacy Bot', name: 'Renamed' })
  })
})

describe('deleting an agent', () => {
  it.each(['scout', '', '..', '../../escape'])('touches no site disk for a stored handle %j', async (handle) => {
    const agent = await seedAgent({ handle })
    const before = await tree()

    await deleteAgentRecord(agent.id)

    expect(await prisma.agent.findUnique({ where: { id: agent.id } })).toBeNull()
    expect(await tree()).toEqual(before)
  })

  // An agent working across two machines has runs and transcripts on both. Sweeping only one would delete
  // hq's copy of the sessions naming them and leave the other site's rows with nothing to reach them by.
  async function agentOnTwoSites() {
    const siteA = await ensureExecutionSite()
    const siteB = await prisma.executionSite.create({
      data: { siteId: 'site-b', label: 'Second', status: 'ONLINE', credentialHash: 'e'.repeat(64), credentialPrefix: 'smc_test_b', isDefault: false } as any,
    })
    const agent = await seedAgent({ handle: 'scout' })
    for (const site of [siteA, siteB]) {
      const project = await createProject({ executionSiteId: site.id })
      await createSession({ agentId: agent.id, primaryOwnerType: 'project', primaryOwnerId: project.id })
    }
    return { agent, siteA: siteA.siteId, siteB: siteB.siteId }
  }

  it('deletes the site-held sessions on every site the agent works across, and stops its containers on each', async () => {
    const { agent, siteA, siteB } = await agentOnTwoSites()

    await deleteAgentRecord(agent.id)

    expect(await prisma.agentSession.count()).toBe(0)
    expect(siteStore.deleteSessionsBy).toHaveBeenCalledWith(siteA, { agentId: agent.id })
    expect(siteStore.deleteSessionsBy).toHaveBeenCalledWith(siteB, { agentId: agent.id })
    expect(siteStore.stopAgent).toHaveBeenCalledWith(siteA, 'scout')
    expect(siteStore.stopAgent).toHaveBeenCalledWith(siteB, 'scout')
  })

  // hq removes nothing from a site's disk itself, but the agent's credential home is still down there, so it
  // asks — over the same channel, to every site the agent worked across, after stopping its containers there.
  it('asks every site to remove the agent\'s directory, after stopping its containers there', async () => {
    const { agent, siteA, siteB } = await agentOnTwoSites()
    const order: string[] = []
    siteStore.stopAgent.mockImplementation(async (siteId: string) => { order.push(`stop:${siteId}`) })
    siteStore.removeAgentDirectory.mockImplementation(async (siteId: string) => {
      order.push(`remove:${siteId}`)
      return { removed: true }
    })

    await deleteAgentRecord(agent.id)

    expect(siteStore.removeAgentDirectory).toHaveBeenCalledWith(siteA, 'scout')
    expect(siteStore.removeAgentDirectory).toHaveBeenCalledWith(siteB, 'scout')
    expect(order.indexOf(`remove:${siteA}`)).toBeGreaterThan(order.indexOf(`stop:${siteA}`))
    expect(order.indexOf(`remove:${siteB}`)).toBeGreaterThan(order.indexOf(`stop:${siteB}`))
  })

  it('a site that refuses the removal does not fail the delete', async () => {
    const { agent, siteA } = await agentOnTwoSites()
    siteStore.removeAgentDirectory.mockRejectedValue(new Error(`Execution Site "${siteA}" is unreachable`))

    await expect(deleteAgentRecord(agent.id)).resolves.toBeUndefined()

    expect(siteStore.removeAgentDirectory).toHaveBeenCalledWith(siteA, 'scout')
    expect(await prisma.agent.findUnique({ where: { id: agent.id } })).toBeNull()
  })
})
