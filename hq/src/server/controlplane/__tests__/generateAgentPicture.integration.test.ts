/**
 * `generate_agent_picture` (ADR-0187), against the real test database and the run's own storage: an organisation
 * admin's run makes a random picture or the recipe it names, a recipe the registry refuses changes nothing, a Member
 * is refused by the floor, and the tool reaches an agent's picture only — never a person's, a team's or the
 * organisation's, whatever id it is handed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs/promises'
import { prisma } from '../../../test/db'
import { ensureExecutionSite } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../dashboard/activity', () => import('../../../test/fakes/activity'))

import { callOperation } from '../operations'
import { generateAgentPictureOp } from '../agentOps'
import { ControlPlaneError } from '../types'
import { chatCtx } from './controlPlaneFixtures'
import { randomRecipe } from '../../../shared/pictures/pictures'
import { getAgentImagesDir } from '../../hqStoragePaths'
import { smallPictureName } from '../../../shared/pictures/files'

let adminId: string
let memberId: string
beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  adminId = (await prisma.user.create({ data: {} })).id
  await prisma.userSettings.create({ data: { userId: adminId, role: 'ADMIN' } })
  memberId = (await prisma.user.create({ data: {} })).id
  await prisma.userSettings.create({ data: { userId: memberId, role: 'MEMBER' } })
  await prisma.org.create({ data: { name: 'Acme', vision: '', mission: '' } })
  await ensureExecutionSite()
  await prisma.agent.create({ data: { id: 'agent-1', name: 'Writer', handle: 'writer' } })
  await prisma.agentSession.create({ data: { id: 's1', userId: adminId, agentId: 'agent-1', sessionType: 'chat' } })
})

const admin = () => chatCtx(adminId, 'ADMIN')
const agentRow = () => prisma.agent.findUniqueOrThrow({ where: { id: 'agent-1' } })

describe('generate_agent_picture', () => {
  it('makes a fresh random picture without a recipe, and another one the next time', async () => {
    const first = await generateAgentPictureOp(admin(), { agentId: 'agent-1', imageType: 'cover' })
    expect(first.url).toMatch(/^\/agents\/agent-1\/images\/[0-9a-f-]+\.webp$/)
    const row = await agentRow()
    expect([row.coverUrl, row.coverRecipe]).toEqual([first.url, first.recipe])

    const second = await generateAgentPictureOp(admin(), { agentId: 'agent-1', imageType: 'cover' })
    expect(second.recipe).not.toEqual(first.recipe)
    // The first one is replaced, so its files are gone.
    const name = second.url.split('/').pop()!
    expect((await fs.readdir(getAgentImagesDir('agent-1'))).sort()).toEqual([name, smallPictureName(name)].sort())
  })

  it('makes the recipe it is given', async () => {
    const recipe = await randomRecipe('thumbs', 7, { subject: { kind: 'agent', name: 'Writer' }, robots: null })
    const result = await generateAgentPictureOp(admin(), { agentId: 'agent-1', imageType: 'avatar', recipe })
    expect(result.recipe).toEqual(recipe)
    expect((await agentRow()).avatarRecipe).toEqual(recipe)
  })

  it('refuses a recipe the registry does not allow for an agent, changing nothing', async () => {
    const symbol = await randomRecipe('icons', 1, { subject: { kind: 'org', name: 'Acme' }, robots: null })
    for (const recipe of [symbol, { ...symbol, style: 'nope' }, 'not a recipe']) {
      await expect(generateAgentPictureOp(admin(), { agentId: 'agent-1', imageType: 'avatar', recipe }))
        .rejects.toMatchObject({ code: 'invalid' })
    }
    expect((await agentRow()).avatarUrl).toBeNull()
  })

  it("is refused below the organisation admin's floor, apply_agent_preset's, changing nothing", async () => {
    await expect(callOperation('generate_agent_picture', chatCtx(memberId, 'ADMIN'), { agentId: 'agent-1', imageType: 'avatar' }))
      .rejects.toBeInstanceOf(ControlPlaneError)
    expect((await agentRow()).avatarUrl).toBeNull()
  })

  it("never reaches a person's, a team's or the organisation's picture", async () => {
    const team = await prisma.team.create({ data: { name: 'Design' } })
    const org = await prisma.org.findFirstOrThrow()
    for (const id of [memberId, team.id, org.id]) {
      await expect(generateAgentPictureOp(admin(), { agentId: id, imageType: 'avatar' })).rejects.toMatchObject({ code: 'not_found' })
    }
    // Extra arguments naming another subject are not read.
    const loose = { agentId: 'agent-1', imageType: 'cover', kind: 'person', userId: memberId, teamId: team.id } as never
    await callOperation('generate_agent_picture', admin(), loose)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: memberId } })).coverUrl).toBeNull()
    expect((await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).coverUrl).toBeNull()
    expect((await prisma.org.findFirstOrThrow()).coverUrl).toBeNull()
    expect((await agentRow()).coverUrl).not.toBeNull()
  })
})
