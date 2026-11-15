/**
 * The memory screen's operations against the real test database (ADR-0188): a person sees, promotes and forgets
 * only their own memories; the agent and place filters match the scope exactly; nobody adds, edits or pins a
 * memory any more; the admins-only measurements.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createProject, createUser, createUserWithRole } from '../../../test/factories'
import { scopeColumns, type MemoryScope } from '../../scopes'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../embedding/embedders', () => import('../../../test/fakes/embedders'))

import { forgetMemoryItem, setMemoryScope } from '../actions'
import { getMemory, getMemoryChoices, getMemoryMeasurements } from '../queries'

const as = (id: string) => ({ user: { id }, entities: {} }) as never
const ask = <T>(op: unknown, id: string | null, args?: unknown): Promise<T> =>
  (op as (a: unknown, c: unknown) => Promise<T>)(args, id ? as(id) : { user: null, entities: {} })
const refused = async (work: Promise<unknown>, status: number) =>
  expect(await work.then(() => null, (e: { statusCode?: number }) => e.statusCode)).toBe(status)

let alice: string
let bob: string
let admin: string
let kernel: string
let shop: string

type View = { id: string; title: string; agent: { name: string } | null; place: { name: string } | null; savedBy: { name: string } | null; savedIn: { name: string } | null }

/** A memory as an agent saves it: for the person, that agent and that place. */
async function saved(person: string, title: string, scope: Partial<Omit<MemoryScope, 'person'>> = {}, extra: { kind?: 'FACT' | 'RULE'; tags?: string[] } = {}) {
  const agent = scope.agent === undefined ? kernel : scope.agent
  const place = scope.place === undefined ? { type: 'project' as const, id: shop } : scope.place
  return prisma.memoryItem.create({
    data: {
      ...scopeColumns({ person, agent, place }), key: title.toLowerCase(), title, body: `${title} is something about the person.`, kind: extra.kind ?? 'FACT', tags: extra.tags ?? [],
      writtenByAgentId: kernel, savedInPlaceType: 'project', savedInPlaceId: shop,
    },
  })
}

beforeEach(async () => {
  alice = (await createUser()).id
  bob = (await createUser()).id
  admin = (await createUserWithRole('ADMIN')).id
  kernel = (await createAgent({ name: 'Kernel' })).id
  shop = (await createProject({ name: 'Shop' })).id
})

describe('a person sees only their own memory @SC-2108', () => {
  it('lists the person\'s memories newest first, with the current names of their agent and place', async () => {
    await saved(alice, 'Tea')
    await saved(alice, 'Tables', { agent: null, place: null })
    await saved(bob, 'Coffee')
    const items = await ask<View[]>(getMemory, alice, {})
    expect(items.map(i => i.title)).toEqual(['Tables', 'Tea'])
    expect(items[1]).toMatchObject({ agent: { name: 'Kernel' }, place: { name: 'Shop' }, savedBy: { name: 'Kernel' }, savedIn: { name: 'Shop' } })
    expect(items[0]).toMatchObject({ agent: null, place: null })
    await prisma.project.update({ where: { id: shop }, data: { name: 'Store' } })
    expect((await ask<View[]>(getMemory, alice, {}))[1]!.place).toMatchObject({ name: 'Store' })
    expect(await ask(getMemory, admin, {})).toEqual([])
    await refused(ask(getMemory, null, {}), 401)
  })

  it('filters by agent and place exactly: null is every agent or everywhere', async () => {
    await saved(alice, 'Tea')
    await saved(alice, 'Tables', { agent: null, place: null })
    const titles = async (args: unknown) => (await ask<View[]>(getMemory, alice, args)).map(i => i.title)
    expect(await titles({ agentId: kernel })).toEqual(['Tea'])
    expect(await titles({ agentId: null })).toEqual(['Tables'])
    expect(await titles({ place: { type: 'project', id: shop } })).toEqual(['Tea'])
    expect(await titles({ place: null })).toEqual(['Tables'])
    await refused(ask(getMemory, alice, { place: { type: 'team', id: shop } }), 400)
  })

  it('lists archived memories only on request', async () => {
    const tea = await saved(alice, 'Tea')
    await prisma.memoryItem.update({ where: { id: tea.id }, data: { archived: true } })
    expect(await ask(getMemory, alice, {})).toEqual([])
    expect(await ask(getMemory, alice, { includeArchived: true })).toHaveLength(1)
  })
})

describe('the memory screen\'s filters and menus @SC-2108', () => {
  const titles = async (args: unknown) => (await ask<View[]>(getMemory, alice, args)).map(i => i.title)

  it('filters by kind, tag, words and one id, within the person\'s own', async () => {
    const tea = await saved(alice, 'Tea', {}, { kind: 'FACT', tags: ['drinks'] })
    await saved(alice, 'Tables', { agent: null, place: null }, { kind: 'RULE', tags: ['format'] })
    await saved(bob, 'Coffee', {}, { kind: 'RULE', tags: ['drinks'] })
    expect(await titles({ kind: 'RULE' })).toEqual(['Tables'])
    expect(await titles({ tag: 'drinks' })).toEqual(['Tea'])
    expect(await titles({ words: 'TEA something' })).toEqual(['Tea'])
    expect(await titles({ words: 'format' })).toEqual(['Tables'])
    expect(await titles({ id: tea.id })).toEqual(['Tea'])
    const coffee = await prisma.memoryItem.findFirstOrThrow({ where: { userId: bob } })
    expect(await titles({ id: coffee.id })).toEqual([])
    await refused(ask(getMemory, alice, { kind: 'PREFERENCE' }), 400)
    await refused(ask(getMemory, alice, { id: { not: '' } }), 400)
    await refused(ask(getMemory, alice, { place: { type: 'project', id: { not: '' } } }), 400)
  })

  it('offers every agent, place and tag the person\'s memories name, and only theirs', async () => {
    const scout = (await createAgent({ name: 'Scout' })).id
    const garden = (await createProject({ name: 'Garden' })).id
    await saved(alice, 'Tea', {}, { tags: ['drinks'] })
    await saved(alice, 'Roses', { agent: scout, place: { type: 'project', id: garden } }, { tags: ['plants'] })
    await saved(alice, 'Name', { agent: null, place: { type: 'user', id: alice } })
    await saved(bob, 'Coffee', { agent: null, place: null }, { tags: ['secret'] })
    expect(await ask(getMemoryChoices, alice)).toEqual({
      agents: [{ id: kernel, name: 'Kernel' }, { id: scout, name: 'Scout' }],
      places: [{ type: 'project', id: garden, name: 'Garden' }, { type: 'project', id: shop, name: 'Shop' }, { type: 'user', id: alice, name: 'Your space' }],
      tags: ['drinks', 'plants'],
    })
    await refused(ask(getMemoryChoices, null), 401)
  })
})

describe('promoting and forgetting @SC-2107 @SC-2110', () => {
  it('promotes with the two switches, and flips back', async () => {
    const tea = await saved(alice, 'Tea')
    expect(await ask(setMemoryScope, alice, { id: tea.id, agent: 'every', place: 'everywhere' })).toEqual({ itemId: tea.id })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id: tea.id } })).toMatchObject({ agentId: null, placeId: null })
    await ask(setMemoryScope, alice, { id: tea.id, agent: 'saved', place: 'everywhere' })
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id: tea.id } })).toMatchObject({ agentId: kernel, placeId: null })
  })

  it("refuses another person's memory, and a choice it does not know", async () => {
    const tea = await saved(alice, 'Tea')
    await refused(ask(setMemoryScope, bob, { id: tea.id, agent: 'every', place: 'everywhere' }), 409)
    await refused(ask(setMemoryScope, alice, { id: tea.id, agent: 'someone', place: 'everywhere' }), 400)
    expect(await prisma.memoryItem.findUniqueOrThrow({ where: { id: tea.id } })).toMatchObject({ agentId: kernel })
  })

  it('refuses an id that is not one memory\'s, so no condition reaches the database', async () => {
    await saved(alice, 'Tea')
    await refused(ask(forgetMemoryItem, alice, { id: { not: '' } }), 400)
    await refused(ask(setMemoryScope, alice, { id: { not: '' }, agent: 'every', place: 'everywhere' }), 400)
    expect(await prisma.memoryItem.count()).toBe(1)
  })

  it("forgets the person's own memory, and never another's", async () => {
    const tea = await saved(alice, 'Tea')
    expect(await ask(forgetMemoryItem, bob, { id: tea.id })).toEqual({ ok: false })
    expect(await prisma.memoryItem.count()).toBe(1)
    expect(await ask(forgetMemoryItem, alice, { id: tea.id })).toEqual({ ok: true })
    expect(await ask(forgetMemoryItem, alice, { id: tea.id })).toEqual({ ok: false })
    expect(await prisma.memoryItem.count()).toBe(0)
  })
})

describe('measurements @SC-2113', () => {
  it('counts the last 30 days of outcomes and reads the bars, for an admin only', async () => {
    const item = await saved(alice, 'Tea')
    const day = 86_400_000
    await prisma.memoryOutcome.createMany({
      data: [
        { itemId: item.id, kind: 'INCLUDED' }, { itemId: item.id, kind: 'INCLUDED' }, { itemId: item.id, kind: 'USED' },
        { itemId: item.id, kind: 'MISSED' },
        { itemId: item.id, kind: 'USED', createdAt: new Date(Date.now() - 40 * day) },
      ],
    })
    await prisma.org.create({ data: { name: 'Org', memoryCertainBar: 0.7 } })
    expect(await ask(getMemoryMeasurements, admin)).toMatchObject({
      included: 2, hinted: 0, recalled: 0, used: 1, unused: 0, missed: 1,
      certainBar: 0.7, probableBar: 0.45,
    })
    await refused(ask(getMemoryMeasurements, alice), 403)
  })
})
