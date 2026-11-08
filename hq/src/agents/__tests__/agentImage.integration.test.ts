/**
 * Integration tests for agent avatar/cover images and chat stats
 * (ADR-0094 — real test DB).
 *
 * Scope (F-017c): agents area scenarios with a load-bearing data path —
 *   SC-046 set an agent's avatar/cover image by upload or from a preset (row updated, file written under
 *   hq's storage root), read an agent's queued, running and blocked task counts.
 *
 * The upload and the preset copy write real files under a temporary storage root and assets root. Where
 * the bytes may land — confinement to hq's storage — is agentImageStorage.integration.test.ts's subject.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser, createTestTask } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))

import { uploadAgentImage, applyAgentPreset } from '../actions'
import { getAgentChatStats } from '../queries'
import { contextWithRole, contextWithoutRole, opContext, useTempRoots, writeTextFile, snapshotTree, type TempRoots } from './definitionFixtures'

let roots: TempRoots
beforeEach(async () => {
  roots = await useTempRoots()
  await writeTextFile(path.join(roots.assets, 'avatars', 'preset.png'), 'AVATAR-PRESET')
  await writeTextFile(path.join(roots.assets, 'covers', 'wide.webp'), 'COVER-PRESET')
})
afterEach(async () => { await roots.restore() })

const imagesDir = (agentId: string) => path.join(roots.storage, 'agents', agentId, 'images')
const storedFiles = (agentId: string) => fs.readdir(imagesDir(agentId)).catch(() => [] as string[])

// 1x1 transparent PNG as a data URL.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`

describe('uploadAgentImage @SC-046', () => {
  it('sets the avatarUrl and writes the bytes under hq\'s storage', async () => {
    const agent = await createAgent({ handle: 'has-avatar' })
    const { ctx } = await contextWithRole('ADMIN')

    const result = await uploadAgentImage({ agentId: agent.id, type: 'avatar', dataUrl: PNG_DATA_URL }, ctx)

    expect(result.url).toMatch(new RegExp(`^/agents/${agent.id}/images/[0-9a-f-]+\\.png$`))
    const after = await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })
    expect(after.avatarUrl).toBe(result.url)
    expect(after.coverUrl).toBeNull()
    const filename = result.url.split('/').pop()!
    expect(await storedFiles(agent.id)).toEqual([filename])
    expect(await fs.readFile(path.join(imagesDir(agent.id), filename))).toEqual(Buffer.from(PNG_BASE64, 'base64'))
  })

  it('sets the coverUrl for a cover upload', async () => {
    const agent = await createAgent({ handle: 'has-cover' })
    const { ctx } = await contextWithRole('ADMIN')
    const result = await uploadAgentImage({ agentId: agent.id, type: 'cover', dataUrl: PNG_DATA_URL }, ctx)
    const after = await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })
    expect(after.coverUrl).toBe(result.url)
    expect(after.avatarUrl).toBeNull()
  })

  it.each([['jpeg', 'jpg'], ['webp', 'webp']])('stores a %s image with the %s extension', async (mime, ext) => {
    const agent = await createAgent()
    const { ctx } = await contextWithRole('ADMIN')
    const result = await uploadAgentImage({ agentId: agent.id, type: 'avatar', dataUrl: `data:image/${mime};base64,${PNG_BASE64}` }, ctx)
    expect(result.url.endsWith(`.${ext}`)).toBe(true)
  })

  it.each([
    ['text that is not a data URL', 'not-a-data-url'],
    ['a type that is not an image the avatar may be', `data:image/gif;base64,${PNG_BASE64}`],
    ['a data URL that is not base64', 'data:image/png,plain'],
  ])('answers 400 for %s, and writes nothing', async (_name, dataUrl) => {
    const agent = await createAgent()
    const { ctx } = await contextWithRole('ADMIN')
    const before = await snapshotTree(roots.storage)

    await expect(uploadAgentImage({ agentId: agent.id, type: 'avatar', dataUrl }, ctx)).rejects.toMatchObject({ statusCode: 400 })

    expect(await snapshotTree(roots.storage)).toEqual(before)
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })).avatarUrl).toBeNull()
  })

  it('answers 400 for an image over 5 MB, and writes nothing', async () => {
    const agent = await createAgent()
    const { ctx } = await contextWithRole('ADMIN')
    const big = Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')

    await expect(uploadAgentImage({ agentId: agent.id, type: 'avatar', dataUrl: `data:image/png;base64,${big}` }, ctx))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('5 MB') })

    expect(await storedFiles(agent.id)).toEqual([])
  })

  it('answers 404 for an agent that does not exist', async () => {
    const { ctx } = await contextWithRole('ADMIN')
    await expect(uploadAgentImage({ agentId: 'ghost', type: 'avatar', dataUrl: PNG_DATA_URL }, ctx)).rejects.toMatchObject({ statusCode: 404 })
    expect(await storedFiles('ghost')).toEqual([])
  })

  // R-195: an agent's image is part of shaping it, an organisation admin's act.
  it.each(['MEMBER'] as const)('refuses a %s (403 naming ADMIN) and writes nothing', async (role) => {
    const agent = await createAgent({ handle: 'no-change' })
    const { ctx } = await contextWithRole(role)

    await expect(uploadAgentImage({ agentId: agent.id, type: 'avatar', dataUrl: PNG_DATA_URL }, ctx))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('ADMIN') })

    expect((await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })).avatarUrl).toBeNull()
    expect(await storedFiles(agent.id)).toEqual([])
  })

  it('refuses a person with no role and a signed-out caller', async () => {
    const agent = await createAgent()
    const args = { agentId: agent.id, type: 'avatar' as const, dataUrl: PNG_DATA_URL }
    await expect(uploadAgentImage(args, (await contextWithoutRole()).ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(uploadAgentImage(args, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
    expect(await storedFiles(agent.id)).toEqual([])
  })
})

describe('applyAgentPreset @SC-046', () => {
  it.each([
    ['avatar', 'preset.png', 'avatarUrl', 'AVATAR-PRESET'],
    ['cover', 'wide.webp', 'coverUrl', 'COVER-PRESET'],
  ] as const)('copies the %s preset into hq\'s storage and sets %s', async (imageType, filename, field, bytes) => {
    const agent = await createAgent()
    const { ctx } = await contextWithRole('ADMIN')

    const result = await applyAgentPreset({ agentId: agent.id, imageType, filename }, ctx)

    expect(result.url).toContain(`/agents/${agent.id}/images/`)
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } }))[field]).toBe(result.url)
    const stored = await storedFiles(agent.id)
    expect(stored).toHaveLength(1)
    expect(await fs.readFile(path.join(imagesDir(agent.id), stored[0]), 'utf-8')).toBe(bytes)
    // The preset itself is copied, not moved.
    expect(await fs.readFile(path.join(roots.assets, `${imageType}s`, filename), 'utf-8')).toBe(bytes)
  })

  it.each(['preset.gif', '../preset.png', 'sub/preset.png', 'pre..set.png', 'preset', ''])('answers 400 for the filename %j, and writes nothing', async (filename) => {
    const agent = await createAgent()
    const { ctx } = await contextWithRole('ADMIN')
    await expect(applyAgentPreset({ agentId: agent.id, imageType: 'avatar', filename }, ctx)).rejects.toMatchObject({ statusCode: 400 })
    expect(await storedFiles(agent.id)).toEqual([])
  })

  it.each(['../avatar', 'avatars', 'AVATAR', ''])('answers 400 for the image type %j, and writes nothing', async (imageType) => {
    const agent = await createAgent()
    const { ctx } = await contextWithRole('ADMIN')
    await expect(applyAgentPreset({ agentId: agent.id, imageType: imageType as 'avatar', filename: 'preset.png' }, ctx)).rejects.toMatchObject({ statusCode: 400 })
    expect(await storedFiles(agent.id)).toEqual([])
  })

  it('fails for an agent that does not exist, and for a preset that is not there, writing no row', async () => {
    const agent = await createAgent()
    const { ctx } = await contextWithRole('ADMIN')

    await expect(applyAgentPreset({ agentId: 'ghost', imageType: 'avatar', filename: 'preset.png' }, ctx)).rejects.toThrow()
    await expect(applyAgentPreset({ agentId: agent.id, imageType: 'avatar', filename: 'missing.png' }, ctx)).rejects.toMatchObject({ statusCode: 404 })

    expect((await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })).avatarUrl).toBeNull()
  })

  it.each(['MEMBER'] as const)('refuses a %s (403 naming ADMIN) and writes nothing', async (role) => {
    const agent = await createAgent()
    const { ctx } = await contextWithRole(role)
    await expect(applyAgentPreset({ agentId: agent.id, imageType: 'avatar', filename: 'preset.png' }, ctx))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('ADMIN') })
    expect(await storedFiles(agent.id)).toEqual([])
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })).avatarUrl).toBeNull()
  })

  it('refuses a person with no role and a signed-out caller', async () => {
    const agent = await createAgent()
    const args = { agentId: agent.id, imageType: 'avatar' as const, filename: 'preset.png' }
    await expect(applyAgentPreset(args, (await contextWithoutRole()).ctx)).rejects.toMatchObject({ statusCode: 403 })
    await expect(applyAgentPreset(args, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
    expect(await storedFiles(agent.id)).toEqual([])
  })
})

describe('agent chat stats @SC-048', () => {
  async function task(agentId: string, projectId: string, planned: boolean, runState: string, number: number) {
    const creator = await createUser()
    return createTestTask({
      data: { title: `T${number}`, projectId, number, state: planned ? 'TODO' : 'BACKLOG', assignedAgentId: agentId, runState, onBehalfOfUserId: creator.id } as any,
    })
  }

  it('counts the agent\'s queued, running and blocked tasks', async () => {
    const agent = await createAgent()
    const other = await createAgent()
    const project = await createProject()
    const caller = await createUser()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: caller.id } })
    await task(agent.id, project.id, true, 'RUN_QUEUED', 1)
    await task(agent.id, project.id, true, 'RUN_QUEUED', 2)
    await task(agent.id, project.id, false, 'RUN_QUEUED', 3) // in Backlog: not counted as queued
    await task(agent.id, project.id, true, 'RUN_ACTIVE', 4)
    await task(agent.id, project.id, true, 'RUN_BLOCKED', 5)
    await task(agent.id, project.id, true, 'RUN_BLOCKED', 6)
    await task(other.id, project.id, true, 'RUN_ACTIVE', 7)

    expect(await getAgentChatStats({ agentId: agent.id }, opContext(caller)))
      .toEqual({ queuedCount: 2, runningCount: 1, blockedCount: 2 })
  })

  it('leaves out tasks in a private project the caller is not a member of', async () => {
    const agent = await createAgent()
    const project = await createProject({ accessLevel: 'PRIVATE' })
    await task(agent.id, project.id, true, 'RUN_ACTIVE', 1)
    const member = await createUser()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id, role: 'MEMBER' } })

    expect(await getAgentChatStats({ agentId: agent.id }, opContext(await createUser()))).toEqual({ queuedCount: 0, runningCount: 0, blockedCount: 0 })
    expect((await getAgentChatStats({ agentId: agent.id }, opContext(member))).runningCount).toBe(1)
  })

  it('returns 404 for an unknown agent, and 401 when nobody is signed in', async () => {
    await expect(getAgentChatStats({ agentId: 'does-not-exist' }, opContext(await createUser()))).rejects.toMatchObject({ statusCode: 404 })
    const agent = await createAgent()
    await expect(getAgentChatStats({ agentId: agent.id }, opContext(undefined))).rejects.toMatchObject({ statusCode: 401 })
  })
})
