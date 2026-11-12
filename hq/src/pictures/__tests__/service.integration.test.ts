/**
 * Integration tests (ADR-0094 — real test DB) for the picture service and the defaults it gives where things are made
 * (ADR-0187): the rows get a url and a recipe together, and each path that makes an agent, a team or a person, or
 * renames one, gives or follows its picture.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '../../test/db'
import { createAgent as createAgentRow, createUser, createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
// No robots in the test run: an agent gets a Thumbs character, Kernel its fixed look.
vi.mock('../robots', async () => ({ ...(await vi.importActual<typeof import('../robots')>('../robots')), getRobots: async () => null }))

import { applyDefaultPictures, redrawIfFollowsName, saveRecipePicture } from '../service'
import { createAgent, updateAgent } from '../../agents/agentService'
import { createTeam, updateTeam } from '../../org/teams/teamActions'
import { KERNEL_FALLBACK_RECIPE, randomRecipe } from '../../shared/pictures/pictures'
import { getHqStorageRoot } from '../../server/hqStoragePaths'
import { useTempRoots, type TempRoots } from '../../agents/__tests__/definitionFixtures'

let roots: TempRoots
beforeEach(async () => { roots = await useTempRoots() })
afterEach(async () => { await roots.restore() })

const style = (recipe: unknown) => (recipe as { style: string } | null)?.style
const exists = (url: string | null) => fs.stat(path.join(getHqStorageRoot(), String(url))).then(() => true, () => false)

describe('the picture service', () => {
  it('saves a recipe as a file and records the url and the recipe on the row together', async () => {
    const agent = await createAgentRow({ name: 'Writer' })
    const recipe = await randomRecipe('thumbs', 1, { subject: { kind: 'agent', name: 'Writer' }, robots: null })
    const saved = await saveRecipePicture({ kind: 'agent', id: agent.id }, 'avatar', recipe)
    const row = await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })
    expect(row.avatarUrl).toBe(saved.url)
    expect(row.avatarRecipe).toEqual(recipe)
    expect(await exists(saved.url)).toBe(true)
  })

  it('refuses a recipe the subject may not use and changes nothing', async () => {
    const user = await createUser()
    const symbol = await randomRecipe('icons', 1, { subject: { kind: 'org', name: 'x' }, robots: null })
    await expect(saveRecipePicture({ kind: 'person', id: user.id }, 'avatar', symbol)).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ avatarUrl: null, avatarRecipe: null })
  })

  it('gives a person a cover only, and never replaces a picture they have', async () => {
    const user = await createUser()
    await applyDefaultPictures({ kind: 'person', id: user.id })
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(row.avatarUrl).toBeNull()
    expect(style(row.coverRecipe)).toBe('patterns')
    await applyDefaultPictures({ kind: 'person', id: user.id })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).coverUrl).toBe(row.coverUrl)
  })

  it('gives Kernel its fixed look without the robots, and the organisation a symbol and a cover', async () => {
    const kernel = await createAgentRow({ name: 'Kernel', handle: 'kernel', isKernel: true })
    await applyDefaultPictures({ kind: 'agent', id: kernel.id })
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: kernel.id } })).avatarRecipe).toEqual(KERNEL_FALLBACK_RECIPE)

    const org = await prisma.org.create({ data: { name: 'Fernhill' } })
    await applyDefaultPictures({ kind: 'org', id: org.id })
    const row = await prisma.org.findUniqueOrThrow({ where: { id: org.id } })
    expect(style(row.avatarRecipe)).toBe('icons')
    expect(style(row.coverRecipe)).toBe('patterns')
    expect(await exists(row.avatarUrl)).toBe(true)
  })
})

describe('where things are made and renamed', () => {
  it('gives a new agent a character and a cover, and keeps its face on a rename', async () => {
    const agent = await createAgent({ name: 'Scout', handle: 'scout' })
    expect(style(agent.avatarRecipe)).toBe('thumbs')
    const row = await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })
    expect(row.avatarUrl).toBe(agent.avatarUrl)
    expect(style(row.coverRecipe)).toBe('patterns')

    await updateAgent({ id: agent.id, name: 'Ranger' })
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: agent.id } })).avatarUrl).toBe(row.avatarUrl)
  })

  it('gives a new team Initials and a cover, and draws the Initials again when it is renamed', async () => {
    const admin = await createUserWithRole('ADMIN')
    const context = { user: { id: admin.id } }
    const { id } = await createTeam({ name: 'Design team' }, context as never)
    const made = await prisma.team.findUniqueOrThrow({ where: { id } })
    expect(style(made.avatarRecipe)).toBe('initials')
    expect(style(made.coverRecipe)).toBe('patterns')

    await updateTeam({ id, name: 'Research' }, context as never)
    const renamed = await prisma.team.findUniqueOrThrow({ where: { id } })
    expect(renamed.avatarUrl).not.toBe(made.avatarUrl)
    expect(renamed.avatarRecipe).toEqual(made.avatarRecipe)
    expect(renamed.coverUrl).toBe(made.coverUrl)
  })

  it('draws nothing again on a rename where the avatar was uploaded', async () => {
    const team = await prisma.team.create({ data: { name: 'Ops', createdBy: (await createUser()).id, avatarUrl: '/teams/x/images/up.webp' } })
    await redrawIfFollowsName({ kind: 'team', id: team.id })
    expect((await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).avatarUrl).toBe('/teams/x/images/up.webp')
  })
})
