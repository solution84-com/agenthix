/**
 * Integration tests (ADR-0094 — real test DB) for the agent service's createAgent @SC-314: the agent's
 * settings are columns of its own row and never part of its content (ADR-0072), and they are validated
 * before anything is written.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUser } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))

import { createAgent } from '../agentService'
import { defaultAgentSettings, readAgentContent } from '../../packages/agentPackageService'
import { PackageContentError } from '../../packages/packageStore'
import { useTempRoots, type TempRoots } from './definitionFixtures'

let roots: TempRoots
beforeEach(async () => { roots = await useTempRoots() })
afterEach(async () => { await roots.restore() })

describe('createAgent @SC-314', () => {
  it('writes the created agent\'s content as the person who created it', async () => {
    const user = await createUser()

    const agent = await createAgent({ name: 'Scout', handle: 'scout', createdById: user.id })

    expect(await readAgentContent(agent.id)).toEqual({ instructions: '', skillFiles: [] })
    expect((await prisma.package.findFirst({ where: { key: agent.id } }))?.updatedById).toBe(user.id)
  })

  it('puts the settings on the Agent row itself, and none in the content (ADR-0072)', async () => {
    const agent = await createAgent({ name: 'Scout', handle: 'scout', settings: { ...defaultAgentSettings(), approval: 'immediate' } })

    expect(await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })).toMatchObject({ approval: 'immediate' })
    expect(Object.keys((await readAgentContent(agent.id))!).sort()).toEqual(['instructions', 'skillFiles'])
  })

  it('validates the settings before creating the agent row, leaving nothing behind', async () => {
    await expect(createAgent({ name: 'Scout', handle: 'scout', settings: { ...defaultAgentSettings(), approval: 'yolo' } })).rejects.toBeInstanceOf(PackageContentError)

    expect(await prisma.agent.count()).toBe(0)
    expect(await prisma.package.count()).toBe(0)
  })
})
