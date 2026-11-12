/**
 * Integration tests for agent avatar/cover images and chat stats
 * (ADR-0094 — real test DB).
 *
 * Scope (F-017c): agents area scenarios with a load-bearing data path —
 *   SC-046 set an agent's avatar/cover image by upload (row updated, file written under
 *   hq's storage root), read an agent's queued, running and blocked task counts.
 *
 * The upload writes real files under a temporary storage root. Where
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

import sharp from 'sharp'
import { smallPictureName } from '../../shared/pictures/files'
import { uploadAgentImage } from '../actions'
import { getAgentChatStats } from '../queries'
import { contextWithRole, contextWithoutRole, opContext, useTempRoots, snapshotTree, type TempRoots } from './definitionFixtures'

let roots: TempRoots
beforeEach(async () => {
  roots = await useTempRoots()
})
afterEach(async () => { await roots.restore() })

const imagesDir = (agentId: string) => path.join(roots.storage, 'agents', agentId, 'images')
const storedFiles = async (agentId: string) => (await fs.readdir(imagesDir(agentId)).catch(() => [] as string[])).sort()

// 1x1 transparent PNG as a data URL.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg=='
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`

describe('uploadAgentImage @SC-046 @SC-2011', () => {
  it('sets the avatarUrl, clears its recipe, and writes it again as WebP with a small copy under hq\'s storage', async () => {
    const agent = await createAgent({ handle: 'has-avatar' })
    await prisma.agent.update({ where: { id: agent.id }, data: { avatarRecipe: { v: 1 }, coverRecipe: { v: 1 } } })
    const { ctx } = await contextWithRole('ADMIN')

    const result = await uploadAgentImage({ agentId: agent.id, type: 'avatar', dataUrl: PNG_DATA_URL }, ctx)

    expect(result.url).toMatch(new RegExp(`^/agents/${agent.id}/images/[0-9a-f-]+\\.webp$`))
    const after = await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })
    expect(after.avatarUrl).toBe(result.url)
    expect(after.avatarRecipe).toBeNull()
    expect(after.coverRecipe).toEqual({ v: 1 })
    expect(after.coverUrl).toBeNull()
    const filename = result.url.split('/').pop()!
    expect(await storedFiles(agent.id)).toEqual([filename, smallPictureName(filename)].sort())
    expect((await sharp(await fs.readFile(path.join(imagesDir(agent.id), filename))).metadata()).format).toBe('webp')
  })

  it('sets the coverUrl for a cover upload', async () => {
    const agent = await createAgent({ handle: 'has-cover' })
    const { ctx } = await contextWithRole('ADMIN')
    const result = await uploadAgentImage({ agentId: agent.id, type: 'cover', dataUrl: PNG_DATA_URL }, ctx)
    const after = await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })
    expect(after.coverUrl).toBe(result.url)
    expect(after.avatarUrl).toBeNull()
  })

  it.each(['jpeg', 'webp'])('stores a picture sent as %s as WebP', async (mime) => {
    const agent = await createAgent()
    const { ctx } = await contextWithRole('ADMIN')
    const result = await uploadAgentImage({ agentId: agent.id, type: 'avatar', dataUrl: `data:image/${mime};base64,${PNG_BASE64}` }, ctx)
    expect(result.url.endsWith('.webp')).toBe(true)
  })

  it.each([
    ['text that is not a data URL', 'not-a-data-url'],
    ['a type that is not an image the avatar may be', `data:image/gif;base64,${PNG_BASE64}`],
    ['a data URL that is not base64', 'data:image/png,plain'],
    ['bytes that are no picture', `data:image/png;base64,${Buffer.from('not really a png').toString('base64')}`],
    ['an SVG sent as a PNG', `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9"/>').toString('base64')}`],
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
