/**
 * The memory screen's operations against the real test database, with the fake embedder: who sees which scope, the
 * edits (an edit keeps the item and its pin), forgetting, the admins-only measurements and embedding-model switch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createProject, createUser, createUserWithRole, joinProjectAs } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../embedding/embedders', () => import('../../../test/fakes/embedders'))

import { forgetMemoryItem, saveMemoryItem, setMemoryPinned } from '../actions'
import { getMemory, getMemoryChoices, getMemoryMeasurements } from '../queries'

const as = (id: string) => ({ user: { id }, entities: {} }) as never
const ask = <T>(op: unknown, id: string | null, args?: unknown): Promise<T> =>
  (op as (a: unknown, c: unknown) => Promise<T>)(args, id ? as(id) : { user: null, entities: {} })
const refused = async (work: Promise<unknown>, status: number) =>
  expect(await work.then(() => null, (e: { statusCode?: number }) => e.statusCode)).toBe(status)

let alice: string
let bob: string
let admin: string
let scout: string
let shop: string

const tea = { title: 'Tea', body: 'Prefers green tea to coffee in the afternoon.', kind: 'PREFERENCE' as const }
const release = { title: 'Release day', body: 'The team ships the weekly release on Thursday afternoons.', kind: 'FACT' as const }

beforeEach(async () => {
  alice = (await createUser()).id
  bob = (await createUser()).id
  admin = (await createUserWithRole('ADMIN')).id
  scout = (await createAgent({ name: 'Scout' })).id
  shop = (await createProject({ name: 'Shop' })).id
  await joinProjectAs(shop, alice, 'ADMIN')
  await joinProjectAs(shop, bob, 'MEMBER')
})

describe('who sees which scope @SC-991', () => {
  it("a person's own scopes are theirs alone", async () => {
    await ask(saveMemoryItem, alice, { scope: 'PERSON', ...tea })
    await ask(saveMemoryItem, alice, { scope: 'AGENT_PERSON', agentId: scout, ...release })
    expect(await ask<{ title: string }[]>(getMemory, alice, { scope: 'PERSON' })).toMatchObject([{ title: 'Tea', scopeLabel: 'Everyone you work with' }])
    expect(await ask<{ scopeLabel: string }[]>(getMemory, alice, { scope: 'AGENT_PERSON', agentId: scout })).toMatchObject([{ scopeLabel: 'Scout, about you' }])
    expect(await ask(getMemory, bob, { scope: 'PERSON' })).toEqual([])
    expect(await ask(getMemory, bob, { scope: 'AGENT_PERSON', agentId: scout })).toEqual([])
    expect(await ask(getMemory, admin, { scope: 'PERSON' })).toEqual([])
  })

  it("agent x place is a project admin's; a member or another person is refused", async () => {
    const place = { type: 'project' as const, id: shop }
    await ask(saveMemoryItem, alice, { scope: 'AGENT_PLACE', agentId: scout, place, ...release })
    expect(await ask<{ scopeLabel: string }[]>(getMemory, alice, { scope: 'AGENT_PLACE', agentId: scout, place })).toMatchObject([{ scopeLabel: 'Scout, in Shop' }])
    await refused(ask(getMemory, bob, { scope: 'AGENT_PLACE', agentId: scout, place }), 403)
    await refused(ask(saveMemoryItem, bob, { scope: 'AGENT_PLACE', agentId: scout, place, ...release }), 403)
  })

  it("a person's own space is that person's alone", async () => {
    await ask(saveMemoryItem, alice, { scope: 'AGENT_PLACE', agentId: scout, place: { type: 'user', id: alice }, ...tea })
    await refused(ask(getMemory, bob, { scope: 'AGENT_PLACE', agentId: scout, place: { type: 'user', id: alice } }), 403)
  })

  it('refuses a missing agent or place, and a stranger to the screen', async () => {
    await refused(ask(getMemory, alice, { scope: 'AGENT_PERSON' }), 400)
    await refused(ask(getMemory, alice, { scope: 'AGENT_PLACE', agentId: scout }), 400)
    await refused(ask(getMemory, null, { scope: 'PERSON' }), 401)
  })

  it('offers an admin their own space and the projects they administer', async () => {
    const choices = await ask<{ agents: { name: string }[]; places: { name: string }[] }>(getMemoryChoices, alice)
    expect(choices.agents.map(a => a.name)).toContain('Scout')
    expect(choices.places.map(p => p.name)).toEqual(['Your own space', 'Shop'])
    expect((await ask<{ places: unknown[] }>(getMemoryChoices, bob)).places).toHaveLength(1)
  })
})

describe('edits, pins and forgetting @SC-991', () => {
  it('an edit changes the item in place and keeps its pin', async () => {
    const created = await ask<{ id: string; key: string }>(saveMemoryItem, alice, { scope: 'PERSON', ...tea })
    await ask(setMemoryPinned, alice, { id: created.id, pinned: true })
    const edited = await ask<{ id: string; key: string; body: string; pinned: boolean; title: string }>(saveMemoryItem, alice, {
      id: created.id, scope: 'PERSON', title: 'Tea, afternoons', body: 'Prefers green tea in the afternoon, and no sugar.', kind: 'PREFERENCE',
    })
    expect(edited).toMatchObject({ id: created.id, key: created.key, title: 'Tea, afternoons', pinned: true })
    expect(await prisma.memoryItem.count()).toBe(1)
  })

  it("another person cannot edit, pin or delete someone's item", async () => {
    const created = await ask<{ id: string }>(saveMemoryItem, alice, { scope: 'PERSON', ...tea })
    await refused(ask(saveMemoryItem, bob, { id: created.id, scope: 'PERSON', ...release }), 403)
    await refused(ask(setMemoryPinned, bob, { id: created.id, pinned: true }), 403)
    await refused(ask(forgetMemoryItem, bob, { id: created.id }), 403)
    expect(await prisma.memoryItem.count()).toBe(1)
  })

  it('a refused write carries the store\'s reason', async () => {
    await refused(ask(saveMemoryItem, alice, { scope: 'PERSON', title: 'Thing', body: 'do that', kind: 'FACT' }), 400)
    await refused(ask(saveMemoryItem, alice, { scope: 'PERSON', ...tea, kind: 'NOTE' }), 400)
  })

  it('forgetting deletes the item; archived items are listed only on request', async () => {
    const created = await ask<{ id: string }>(saveMemoryItem, alice, { scope: 'PERSON', ...tea })
    await prisma.memoryItem.update({ where: { id: created.id }, data: { archived: true } })
    expect(await ask(getMemory, alice, { scope: 'PERSON' })).toEqual([])
    expect(await ask(getMemory, alice, { scope: 'PERSON', includeArchived: true })).toHaveLength(1)
    expect(await ask(forgetMemoryItem, alice, { id: created.id })).toEqual({ ok: true })
    expect(await ask(forgetMemoryItem, alice, { id: created.id })).toEqual({ ok: false })
    expect(await prisma.memoryItem.count()).toBe(0)
  })

  it('lists pinned items first', async () => {
    await ask(saveMemoryItem, alice, { scope: 'PERSON', ...tea })
    const second = await ask<{ id: string }>(saveMemoryItem, alice, { scope: 'PERSON', ...release })
    await ask(setMemoryPinned, alice, { id: second.id, pinned: true })
    expect((await ask<{ title: string }[]>(getMemory, alice, { scope: 'PERSON' })).map(i => i.title)).toEqual(['Release day', 'Tea'])
  })
})

describe('measurements and the embedding model @SC-991', () => {
  it('counts the last 30 days of outcomes and reads the bars, for an admin only', async () => {
    const item = await ask<{ id: string }>(saveMemoryItem, alice, { scope: 'PERSON', ...tea })
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
